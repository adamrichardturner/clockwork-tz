/**
 * Main API implementation for clockwork-tz
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
import { ensureFreshTzdb, onDataUpdate as onBroadcastUpdate } from './data/updater.js'
import {
  watchZoneTransitions as watchZoneTransitionsImpl,
  onTick as onTickImpl,
} from './transitions.js'
import { formatInstant, LOCAL_TIME_PATTERN } from './format.js'
import { getEngine, setEngineState } from './core/state.js'
import {
  assertValidZone,
  canonicalizeZone,
  isValidZone,
  offsetSecondsToString,
  zoneInfoAt,
} from './core/zone.js'
import { wallMsToInstant } from './core/localTime.js'
import {
  componentsToWallMs,
  isValidISOString,
  normalizeToDate,
  parseLocalISOString,
} from './utils/iso.js'

/**
 * Global state
 */
let initOptions: ClockworkOptions = {}
const updateListeners = new Set<(version: string) => void>()
let updateTimer: ReturnType<typeof setInterval> | null = null
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
 * Initialize clockwork-tz with options. Calling it again replaces the engine
 * and any auto-update schedule. The returned promise settles once the initial
 * manifest load (if any) has been attempted; it never rejects.
 */
export function initClockworkTZ(opts: ClockworkOptions = {}): Promise<void> {
  dispose()
  initOptions = { ...opts }

  const {
    engine = 'system-intl',
    data,
    manifestURL,
    publicKey,
    autoUpdateIntervalMs = 24 * 60 * 60 * 1000,
  } = opts

  switch (engine) {
    case 'system-intl': {
      setEngineState(createSystemIntlEngine())
      return Promise.resolve()
    }
    case 'embedded-tzdb': {
      const embedded = createEmbeddedTzdbEngine()
      if (data !== undefined) {
        embedded.loadTzdbData(data)
        lastUpdate = new Date()
      }
      setEngineState(embedded)
      break
    }
    default: {
      throw new TimezoneError(`Unknown engine: ${String(engine)}`)
    }
  }

  if (!manifestURL) {
    return Promise.resolve()
  }

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
 * Stop auto-updates started by initClockworkTZ
 */
export function dispose(): void {
  if (updateTimer) {
    clearInterval(updateTimer)
    updateTimer = null
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
 * Get the user's timezone
 */
export function getUserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
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

/**
 * Interpret a wall-clock time (no offset, e.g. "2024-03-10T02:30:00") in a zone
 */
export function interpretLocal(
  localISO: string,
  zone: string,
  opts: ConvertOptions = {}
): ClockworkTime {
  const engine = getEngine()
  assertValidZone(zone, engine)

  let wallMs: number
  try {
    wallMs = componentsToWallMs(parseLocalISOString(localISO))
  } catch (error) {
    throw new TimezoneError(`Invalid local time "${localISO}"`, { cause: error })
  }

  const epochMs = wallMsToInstant(
    wallMs,
    zone,
    engine,
    opts.disambiguation ?? 'compatible',
    localISO
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
 * List available timezones with labels and offsets, sorted by offset then name
 */
export function listTimeZones(opts: ListOptions = {}): TimeZoneItem[] {
  const engine = getEngine()
  const { labelStyle = 'original', locale = 'en' } = opts
  const epochMs = normalizeToDate(opts.at ?? new Date()).getTime()

  return engine
    .listZoneIds()
    .map(zone => {
      const info = engine.getZoneInfo(epochMs, zone)
      return {
        value: zone,
        label: zoneLabel(zone, epochMs, info, labelStyle, locale),
        offsetMinutes: info.offsetSeconds / 60,
      }
    })
    .sort((a, b) => a.offsetMinutes - b.offsetMinutes || a.value.localeCompare(b.value))
}

/**
 * Listen for timezone data updates (in this context and, via
 * BroadcastChannel, in other tabs and workers)
 */
export function onDataUpdate(callback: (version: string) => void): () => void {
  updateListeners.add(callback)
  const broadcastCleanup = onBroadcastUpdate(callback)

  return () => {
    updateListeners.delete(callback)
    broadcastCleanup()
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
