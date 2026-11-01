/**
 * Main API implementation for clockworktz
 */

import type {
  EngineKind,
  ClockworkTime,
  ListOptions,
  TimeZoneItem,
  ClockworkOptions,
  FormatOptions,
  ConvertOptions,
  DateInput,
  LoadableEngine,
  TzEngine,
  ZoneInfo,
} from './data/types.js'
import { TimezoneError } from './data/types.js'

import { createSystemIntlEngine } from './engines/systemIntl.js'
import { createEmbeddedTzdbEngine } from './engines/embeddedTzdb.js'
import { cacheKey, ensureFreshTzdb, onBroadcastUpdate } from './data/updater.js'
import {
  watchZoneTransitions as watchZoneTransitionsImpl,
  onTick as onTickImpl,
} from './transitions.js'
import { formatInstant, LOCAL_TIME_PATTERN } from './format.js'
import { getEngine, setEngineState } from './core/state.js'
import {
  assertValidZone,
  canonicalizeZone,
  isFixedOffsetZone,
  isValidZone,
  offsetSecondsToString,
  zoneInfoAt,
} from './core/zone.js'
import { wallMsToInstant } from './core/localTime.js'
import {
  componentsToWallMs,
  formatComponentsAsLocalISO,
  isValidISOString,
  normalizeToDate,
  parseLocalISOString,
  validateDateComponents,
  type DateComponents,
} from './utils/iso.js'

/**
 * A wall-clock time as fields; omitted time fields default to zero
 */
export type WallTime = Pick<DateComponents, 'year' | 'month' | 'day'> &
  Partial<Omit<DateComponents, 'year' | 'month' | 'day'>>

/**
 * Global state
 */
let initOptions: ClockworkOptions = {}
const updateListeners = new Set<(version: string) => void>()
let updateTimer: ReturnType<typeof setInterval> | null = null
let stopBroadcastListener: (() => void) | null = null
let lastUpdate: Date | undefined

function isLoadable(engine: TzEngine): engine is LoadableEngine {
  return typeof (engine as Partial<LoadableEngine>).loadTzdbData === 'function'
}

function notifyListeners(version: string): void {
  for (const listener of updateListeners) {
    try {
      listener(version)
    } catch (error) {
      console.warn('Error in data update listener:', error)
    }
  }
}

async function loadFromManifest(manifestURL: string, publicKey?: string): Promise<boolean> {
  const result = await ensureFreshTzdb(manifestURL, publicKey === undefined ? {} : { publicKey })
  const engine = getEngine()
  if (!result || !isLoadable(engine)) {
    return false
  }
  if (result.version === engine.getVersion()) {
    return false
  }
  engine.loadTzdbData(result.data)
  lastUpdate = new Date()
  notifyListeners(result.version)
  return true
}

/**
 * Initialize clockworktz with options. Calling it again replaces the engine,
 * any auto-update schedule and cross-tab listener.
 *
 * Throws TimezoneError synchronously for invalid options or data. Otherwise
 * the returned promise settles once the initial manifest load (if any) has
 * been attempted; it never rejects, and failures keep the current data.
 */
export function initClockworkTZ(opts: ClockworkOptions = {}): Promise<void> {
  const {
    engine = 'system-intl',
    data,
    manifestURL,
    publicKey,
    autoUpdateIntervalMs = 24 * 60 * 60 * 1000,
  } = opts

  if (engine !== 'system-intl' && engine !== 'embedded-tzdb') {
    throw new TimezoneError(`Unknown engine: ${String(engine)}`)
  }
  if (engine === 'system-intl' && (data !== undefined || manifestURL !== undefined)) {
    throw new TimezoneError("The data and manifestURL options require engine: 'embedded-tzdb'")
  }
  if (!Number.isFinite(autoUpdateIntervalMs) || autoUpdateIntervalMs < 0) {
    throw new TimezoneError(`Invalid autoUpdateIntervalMs: ${autoUpdateIntervalMs}`)
  }

  // Build the new engine before touching state, so invalid data changes nothing
  const next = engine === 'system-intl' ? createSystemIntlEngine() : createEmbeddedTzdbEngine(data)

  dispose()
  initOptions = { ...opts }
  lastUpdate = data !== undefined ? new Date() : undefined
  setEngineState(next)

  if (!manifestURL) {
    return Promise.resolve()
  }

  // Another tab verified and cached newer data from the same source: load it
  const source = cacheKey(manifestURL, publicKey)
  stopBroadcastListener = onBroadcastUpdate((_version, from) => {
    if (from === source) {
      loadFromManifest(manifestURL, publicKey).catch(error => {
        console.warn('Failed to load timezone data from another tab:', error)
      })
    }
  })

  if (autoUpdateIntervalMs > 0) {
    updateTimer = setInterval(() => {
      loadFromManifest(manifestURL, publicKey).catch(error => {
        console.warn('Auto-update failed:', error)
      })
    }, autoUpdateIntervalMs)
    ;(updateTimer as { unref?: () => void }).unref?.()
  }

  return loadFromManifest(manifestURL, publicKey).then(
    () => undefined,
    error => {
      console.warn('Failed to load initial timezone data:', error)
    }
  )
}

/**
 * Stop auto-updates and cross-tab listening started by initClockworkTZ
 */
export function dispose(): void {
  if (updateTimer) {
    clearInterval(updateTimer)
    updateTimer = null
  }
  if (stopBroadcastListener) {
    stopBroadcastListener()
    stopBroadcastListener = null
  }
}

/**
 * Get the current engine type
 */
export function engine(): EngineKind {
  return getEngine().kind
}

/**
 * Get the current TZDB version (if available)
 */
export function tzdbVersion(): string | undefined {
  return getEngine().getVersion()
}

/**
 * The runtime's timezone, canonicalized ("Asia/Calcutta" -> "Asia/Kolkata");
 * falls back to UTC when it cannot be determined
 */
export function getUserTimeZone(): string {
  let zone = 'UTC'
  try {
    zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
  try {
    return canonicalizeZone(zone, getEngine())
  } catch {
    return zone
  }
}

/**
 * Check if a timezone identifier (or fixed offset like "+05:30") is valid
 */
export function isValidTimeZone(zone: string): boolean {
  return isValidZone(zone, getEngine())
}

/**
 * Canonical spelling of a timezone: links such as "Asia/Calcutta" resolve to
 * their primary zone where the engine knows them.
 */
export function canonicalizeTimeZone(zone: string): string {
  return canonicalizeZone(zone, getEngine())
}

function buildTime(
  epochMs: number,
  zone: string,
  engine: TzEngine,
  opts: FormatOptions
): ClockworkTime {
  const info = zoneInfoAt(epochMs, zone, engine)
  const result: ClockworkTime = {
    utc: new Date(epochMs).toISOString(),
    zone,
    local: formatInstant(epochMs, zone, opts.format ?? LOCAL_TIME_PATTERN, engine, opts.locale),
    offsetMinutes: info.offsetSeconds / 60,
    isDST: info.isDST,
    abbreviation: info.abbreviation,
    source: engine.kind,
  }
  const version = engine.getVersion()
  if (version !== undefined) {
    result.tzdbVersion = version
  }
  return result
}

/**
 * Convert an instant to a specific timezone
 */
export function fromUTC(input: DateInput, zone: string, opts: FormatOptions = {}): ClockworkTime {
  const engine = getEngine()
  assertValidZone(zone, engine)
  return buildTime(normalizeToDate(input).getTime(), zone, engine, opts)
}

function wallTimeToComponents(wall: string | WallTime): DateComponents {
  if (typeof wall === 'string') {
    try {
      return parseLocalISOString(wall)
    } catch (error) {
      throw new TimezoneError(`Invalid local time "${wall}"`, { cause: error })
    }
  }
  const components: DateComponents = {
    year: wall?.year,
    month: wall?.month,
    day: wall?.day,
    hour: wall?.hour ?? 0,
    minute: wall?.minute ?? 0,
    second: wall?.second ?? 0,
    millisecond: wall?.millisecond ?? 0,
  }
  const integers = Object.values(components).every(Number.isInteger)
  if (!integers || !validateDateComponents(components)) {
    throw new TimezoneError(`Invalid local time ${JSON.stringify(wall)}`)
  }
  return components
}

/**
 * Interpret a wall-clock time in a zone: either a string without an offset
 * ("2024-03-10T02:30:00") or fields ({ year: 2024, month: 3, day: 10, hour: 2, minute: 30 })
 */
export function interpretLocal(
  wallTime: string | WallTime,
  zone: string,
  opts: ConvertOptions = {}
): ClockworkTime {
  const engine = getEngine()
  assertValidZone(zone, engine)

  const components = wallTimeToComponents(wallTime)
  const label = typeof wallTime === 'string' ? wallTime : formatComponentsAsLocalISO(components)
  const epochMs = wallMsToInstant(
    componentsToWallMs(components),
    zone,
    engine,
    opts.disambiguation ?? 'compatible',
    label
  )
  return buildTime(epochMs, zone, engine, opts)
}

/**
 * Convert time from one timezone to another. Strings without an offset are
 * read as wall time in `fromZone`; instants (Date, epoch ms, strings with an
 * offset) are converted directly.
 */
export function convert(
  input: DateInput,
  fromZone: string,
  toZone: string,
  opts: ConvertOptions = {}
): ClockworkTime {
  const engine = getEngine()
  assertValidZone(fromZone, engine, 'source timezone')
  assertValidZone(toZone, engine, 'target timezone')

  if (typeof input === 'string' && !isValidISOString(input)) {
    const { format: _format, ...interpretOpts } = opts
    const source = interpretLocal(input, fromZone, interpretOpts)
    return fromUTC(source.utc, toZone, opts)
  }

  return fromUTC(input, toZone, opts)
}

/**
 * Offset, DST flag and abbreviation in effect at an instant
 */
export function getZoneInfo(input: DateInput, zone: string): ZoneInfo {
  const engine = getEngine()
  assertValidZone(zone, engine)
  return zoneInfoAt(normalizeToDate(input).getTime(), zone, engine)
}

/**
 * Get timezone offset in minutes at an instant
 */
export function getOffset(input: DateInput, zone: string): number {
  return getZoneInfo(input, zone).offsetSeconds / 60
}

/**
 * Check if an instant is in Daylight Saving Time. Returns false for invalid zones.
 */
export function isDST(input: DateInput, zone: string): boolean {
  if (!isValidTimeZone(zone)) {
    return false
  }
  return getZoneInfo(input, zone).isDST
}

function zoneLabel(
  zone: string,
  epochMs: number,
  info: ZoneInfo,
  style: string,
  locale: string
): string {
  switch (style) {
    case 'offset': {
      return `(UTC${offsetSecondsToString(info.offsetSeconds)}) ${zone}`
    }
    case 'abbrev': {
      return `${zone} (${info.abbreviation})`
    }
    case 'altName': {
      try {
        const name = new Intl.DateTimeFormat(locale, { timeZone: zone, timeZoneName: 'long' })
          .formatToParts(epochMs)
          .find(p => p.type === 'timeZoneName')?.value
        return name && name !== zone ? `${zone} (${name})` : zone
      } catch {
        return zone
      }
    }
    default: {
      return zone
    }
  }
}

/**
 * ISO 3166 codes of the countries using a zone. Empty for fixed offsets,
 * zones not tied to a country (UTC) and engines without country data.
 */
export function getZoneCountries(zone: string): string[] {
  const engine = getEngine()
  assertValidZone(zone, engine)
  if (isFixedOffsetZone(zone) || !engine.getCountryCodes) {
    return []
  }
  return engine.getCountryCodes(zone)
}

/**
 * List available timezones with labels and offsets, sorted by offset then name
 */
export function listTimeZones(opts: ListOptions = {}): TimeZoneItem[] {
  const engine = getEngine()
  const { labelStyle = 'original', locale = 'en' } = opts
  const epochMs = normalizeToDate(opts.at ?? new Date()).getTime()
  const country = opts.country?.toUpperCase()

  return engine
    .listZoneIds()
    .map(zone => {
      const info = engine.getZoneInfo(epochMs, zone)
      return {
        value: zone,
        label: zoneLabel(zone, epochMs, info, labelStyle, locale),
        offsetMinutes: info.offsetSeconds / 60,
        countryCodes: engine.getCountryCodes?.(zone) ?? [],
      }
    })
    .filter(item => !country || item.countryCodes.includes(country))
    .sort((a, b) => a.offsetMinutes - b.offsetMinutes || a.value.localeCompare(b.value))
}

/**
 * Called with the tzdb version each time the embedded engine loads newer
 * data, whether fetched here or picked up from another tab
 */
export function onDataUpdate(callback: (version: string) => void): () => void {
  updateListeners.add(callback)
  return () => {
    updateListeners.delete(callback)
  }
}

/**
 * Watch for timezone transitions (DST changes) in a zone
 */
export function watchZoneTransitions(zone: string, callback: (at: Date) => void): () => void {
  return watchZoneTransitionsImpl(zone, callback, getEngine())
}

/**
 * Watch for time ticks (regular intervals)
 */
export function onTick(callback: (now: Date) => void, granularityMs: number = 1000): () => void {
  return onTickImpl(callback, granularityMs)
}

/**
 * Get current engine instance (for advanced usage)
 */
export function getCurrentEngine(): TzEngine {
  return getEngine()
}

/**
 * Manually set the engine (for testing or advanced usage)
 */
export function setEngine(engine: TzEngine): void {
  setEngineState(engine)
}

/**
 * Get current initialization options
 */
export function getInitOptions(): ClockworkOptions {
  return { ...initOptions }
}

/**
 * Force a refresh of timezone data from the configured manifest. Resolves
 * true when new data was loaded.
 */
export async function refreshTimezoneData(): Promise<boolean> {
  if (getEngine().kind !== 'embedded-tzdb') {
    throw new TimezoneError('Timezone data refresh only available for embedded-tzdb engine')
  }

  const { manifestURL, publicKey } = initOptions
  if (!manifestURL) {
    throw new TimezoneError('No manifest URL configured for timezone data refresh')
  }

  return loadFromManifest(manifestURL, publicKey)
}

/**
 * Get library status information
 */
export function getStatus(): {
  engine: EngineKind
  tzdbVersion?: string | undefined
  dataLoaded: boolean
  lastUpdate?: Date | undefined
} {
  const current = getEngine()
  return {
    engine: current.kind,
    tzdbVersion: current.getVersion(),
    dataLoaded: isLoadable(current) ? current.isDataLoaded() : true,
    lastUpdate,
  }
}
