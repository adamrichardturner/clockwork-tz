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
 * A wall-clock time as fields, for {@link interpretLocal}. `month` is 1–12;
 * omitted time fields default to zero.
 *
 * @example
 * ```ts
 * const wall: WallTime = { year: 2024, month: 11, day: 3, hour: 1, minute: 30 }
 * ```
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
 * Choose the timezone engine and, optionally, signed tzdb updates.
 *
 * Calling this is optional: without it, the `system-intl` engine (the runtime's
 * own timezone data) is used. Calling it again replaces the engine, the update
 * schedule and the cross-tab listener.
 *
 * @param opts - Engine and data options; see {@link ClockworkOptions}.
 * @returns A promise that settles once the first manifest download (if any) has
 *   been attempted. It never rejects: a failed update keeps the current data.
 * @throws {@link TimezoneError} synchronously for an unknown engine, invalid
 *   `data`, `data` or `manifestURL` without `engine: 'embedded-tzdb'`, or a
 *   negative `autoUpdateIntervalMs`. The current engine is left unchanged.
 *
 * @example
 * ```ts
 * import { initClockworkTZ, DEFAULT_MANIFEST_URL } from 'clockworktz'
 * import { tzdb } from 'clockworktz/tzdb'
 *
 * // Deterministic results from the bundled IANA data, kept fresh from the CDN
 * await initClockworkTZ({ engine: 'embedded-tzdb', data: tzdb, manifestURL: DEFAULT_MANIFEST_URL })
 * ```
 *
 * @see {@link https://clockworktz.dev/docs/engines | Engines & tzdb data}
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
 * Stop the auto-update timer and cross-tab listener started by
 * {@link initClockworkTZ}, for example on server shutdown or in test teardown.
 * The current engine and its data stay in place.
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
 * The engine in use: `'system-intl'` (the default) or `'embedded-tzdb'`.
 */
export function engine(): EngineKind {
  return getEngine().kind
}

/**
 * The IANA tzdb release the engine uses, such as `'2026f'`.
 *
 * @returns The release for `embedded-tzdb`, or `undefined` for `system-intl`,
 *   whose data comes from the runtime (ICU).
 */
export function tzdbVersion(): string | undefined {
  return getEngine().getVersion()
}

/**
 * The runtime's timezone as a canonical IANA identifier.
 *
 * Legacy names are canonicalized (`'Asia/Calcutta'` → `'Asia/Kolkata'`). Falls
 * back to `'UTC'` when the runtime doesn't report a zone. Never throws.
 *
 * @example
 * ```ts
 * getUserTimeZone() // e.g. 'Europe/London'
 * ```
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
 * Whether the current engine recognises a zone.
 *
 * Accepts IANA identifiers and links (`'US/Eastern'`) case-insensitively, plus
 * fixed offsets: `'+05:30'`, `'-0930'`, `'+05'`.
 *
 * @param zone - The zone to check.
 * @returns `false` for unknown zones and empty or non-string input; never throws.
 *
 * @example
 * ```ts
 * isValidTimeZone('Asia/Kathmandu') // true
 * isValidTimeZone('+05:30') // true
 * isValidTimeZone('Mars/Olympus_Mons') // false
 * ```
 */
export function isValidTimeZone(zone: string): boolean {
  return isValidZone(zone, getEngine())
}

/**
 * The canonical spelling of a zone: links resolve to their primary zone and
 * fixed offsets are normalized to `±HH:mm`.
 *
 * @param zone - An IANA identifier, link or fixed offset.
 * @throws {@link TimezoneError} if the zone is invalid.
 *
 * @example
 * ```ts
 * canonicalizeTimeZone('Asia/Calcutta') // 'Asia/Kolkata'
 * canonicalizeTimeZone('Europe/Kiev') // 'Europe/Kyiv'
 * canonicalizeTimeZone('+0530') // '+05:30'
 * ```
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
 * Show an instant as it's seen in a zone.
 *
 * @param input - The instant: a `Date`, epoch milliseconds, or an ISO 8601
 *   string with an offset or `Z`. Strings without an offset are rejected; use
 *   {@link interpretLocal} for wall-clock times.
 * @param zone - An IANA zone or fixed offset (`'+05:30'`).
 * @param opts - `format`, the pattern for `local` (default
 *   `'yyyy-MM-dd HH:mm:ss.SSS'`), and `locale` for names in that pattern.
 * @returns The instant with its local time, offset, DST flag and abbreviation
 *   in `zone`.
 * @throws {@link TimezoneError} for an invalid zone, instant or pattern.
 *
 * @example
 * ```ts
 * fromUTC('2024-07-15T14:00:00Z', 'Australia/Lord_Howe').local // '2024-07-16 00:30:00.000'
 * fromUTC('2024-07-15T14:00:00Z', 'Australia/Lord_Howe').offsetMinutes // 630
 * fromUTC(0, 'Asia/Kathmandu', { format: 'HH:mm xxx' }).local // '05:30 +05:30'
 * ```
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
 * Turn a wall-clock time in a zone into an instant.
 *
 * A wall time can be skipped (DST starts) or happen twice (DST ends).
 * `disambiguation` picks the instant, with Temporal's semantics:
 * - `'compatible'` (default): the later instant in a gap, the earlier in an overlap
 * - `'earliest'` / `'latest'`: the earlier or later candidate
 * - `'reject'`: throw {@link InvalidTimeError} (gap) or {@link AmbiguousTimeError} (overlap)
 *
 * @param wallTime - A string without an offset (`'2024-03-10T02:30'`; `T` or a
 *   space; seconds and fraction optional) or fields (see {@link WallTime}).
 * @param zone - An IANA zone or fixed offset.
 * @param opts - `disambiguation`, plus `format` and `locale` for `local`.
 * @throws {@link TimezoneError} for an invalid zone or wall time (such as 30 February).
 *
 * @example
 * ```ts
 * // 02:30 doesn't exist in New York on 10 March 2024: pushed forward to 03:30 EDT
 * interpretLocal('2024-03-10T02:30:00', 'America/New_York').local // '2024-03-10 03:30:00.000'
 *
 * // 01:30 happens twice on 3 November 2024: pick the second (EST)
 * interpretLocal({ year: 2024, month: 11, day: 3, hour: 1, minute: 30 }, 'America/New_York', { disambiguation: 'latest' }).utc // '2024-11-03T06:30:00.000Z'
 * ```
 *
 * @see {@link https://clockworktz.dev/docs/dst-disambiguation | DST gaps and overlaps}
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
 * Convert a time from one zone to another.
 *
 * A string without an offset is wall time in `fromZone`, resolved with
 * `disambiguation` (see {@link interpretLocal}). An instant (`Date`, epoch
 * milliseconds, or ISO string with an offset) is converted directly, and
 * `fromZone` is only validated.
 *
 * @param input - Wall time in `fromZone`, or an instant.
 * @param fromZone - The zone `input` is in, when it's a wall time.
 * @param toZone - The zone to show the result in.
 * @param opts - `disambiguation`, plus `format` and `locale` for the result's `local`.
 * @returns The time in `toZone`.
 * @throws {@link TimezoneError} for invalid zones or input; {@link InvalidTimeError}
 *   or {@link AmbiguousTimeError} with `disambiguation: 'reject'`.
 *
 * @example
 * ```ts
 * convert('2024-07-15T16:30:00', 'Asia/Kathmandu', 'America/St_Johns').local // '2024-07-15 08:15:00.000'
 * ```
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
 * The offset, DST flag and abbreviation in effect in a zone at an instant.
 *
 * `offsetSeconds` keeps second precision, for historical local mean time. With
 * `system-intl`, `isDST` comes from comparing the zone's January and July
 * offsets; `embedded-tzdb` reports the tzdb flag.
 *
 * @param input - The instant: a `Date`, epoch milliseconds, or ISO string with an offset.
 * @param zone - An IANA zone or fixed offset.
 * @throws {@link TimezoneError} for an invalid zone or instant.
 *
 * @example
 * ```ts
 * getZoneInfo('2024-07-15T12:00:00Z', 'Asia/Kathmandu') // { offsetSeconds: 20700, isDST: false, abbreviation: '+0545' }
 * ```
 */
export function getZoneInfo(input: DateInput, zone: string): ZoneInfo {
  const engine = getEngine()
  assertValidZone(zone, engine)
  return zoneInfoAt(normalizeToDate(input).getTime(), zone, engine)
}

/**
 * A zone's offset from UTC at an instant, in minutes: `345` for +05:45,
 * `-210` for −03:30. Fractional only for historical local mean time.
 *
 * @param input - The instant: a `Date`, epoch milliseconds, or ISO string with an offset.
 * @param zone - An IANA zone or fixed offset.
 * @throws {@link TimezoneError} for an invalid zone or instant.
 *
 * @example
 * ```ts
 * getOffset('2024-07-15T00:00:00Z', 'Pacific/Chatham') // 765
 * getOffset('2024-01-15T00:00:00Z', 'Pacific/Chatham') // 825
 * ```
 */
export function getOffset(input: DateInput, zone: string): number {
  return getZoneInfo(input, zone).offsetSeconds / 60
}

/**
 * Whether daylight saving time is in effect in a zone at an instant.
 *
 * @param input - The instant: a `Date`, epoch milliseconds, or ISO string with an offset.
 * @param zone - An IANA zone or fixed offset.
 * @returns `false` for invalid zones (rather than throwing) and for fixed offsets.
 * @throws {@link TimezoneError} for an invalid instant.
 *
 * @example
 * ```ts
 * isDST('2024-01-15T00:00:00Z', 'Australia/Sydney') // true
 * isDST('2024-07-15T00:00:00Z', 'Australia/Sydney') // false
 * ```
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
 * ISO 3166 codes of the countries that use a zone.
 *
 * The `embedded-tzdb` engine reads IANA's `zone1970.tab`, so shared zones list
 * every country. `system-intl` asks `Intl.Locale#getTimeZones` and returns `[]`
 * on runtimes without it.
 *
 * @param zone - An IANA zone, link or fixed offset.
 * @returns The country codes; `[]` for fixed offsets and zones not tied to a
 *   country, such as `UTC`.
 * @throws {@link TimezoneError} if the zone is invalid.
 *
 * @example
 * ```ts
 * getZoneCountries('Asia/Kathmandu') // ['NP']
 * getZoneCountries('UTC') // []
 * ```
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
 * Every zone the engine lists, with a label and current offset, sorted by
 * offset and then name. Useful for timezone pickers.
 *
 * @param opts - Options; see {@link ListOptions}:
 *   - `labelStyle`: `'original'` (`Asia/Kathmandu`), `'offset'`
 *     (`(UTC+05:45) Asia/Kathmandu`), `'abbrev'` (`Asia/Kathmandu (+0545)`) or
 *     `'altName'` (`Asia/Kathmandu (Nepal Time)`)
 *   - `at`: the instant for offsets and labels (default: now)
 *   - `locale`: language for `altName` labels (default `'en'`)
 *   - `country`: only zones used in this ISO 3166 country
 * @returns Items with `value` (the zone), `label`, `offsetMinutes` and `countryCodes`.
 *
 * @example
 * ```ts
 * listTimeZones({ country: 'NP', labelStyle: 'offset', at: '2024-07-15T00:00:00Z' })[0].label // '(UTC+05:45) Asia/Kathmandu'
 * ```
 *
 * @see {@link https://clockworktz.dev/docs/time-zone-lists | Time zone lists}
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
 * Subscribe to tzdb data updates. The callback receives the new version (such as
 * `'2026g'`) each time the embedded engine loads newer data, whether fetched in
 * this context or picked up from another tab.
 *
 * @param callback - Called with the tzdb version that was loaded.
 * @returns A function that unsubscribes.
 *
 * @example
 * ```ts
 * const unsubscribe = onDataUpdate(version => console.log(`Timezone data updated to ${version}`))
 * ```
 */
export function onDataUpdate(callback: (version: string) => void): () => void {
  updateListeners.add(callback)
  return () => {
    updateListeners.delete(callback)
  }
}

/**
 * Call `callback` just after each DST or offset transition in a zone, for as
 * long as the watcher runs. Handles transitions further away than the 24.8-day
 * `setTimeout` limit, and doesn't keep a Node process alive.
 *
 * @param zone - The zone to watch.
 * @param callback - Called with the instant of each transition.
 * @returns A function that stops watching. Invalid zones log a warning and
 *   return a no-op.
 *
 * @example
 * ```ts
 * const stop = watchZoneTransitions('Europe/London', at => console.log('Clocks changed at', at))
 * ```
 */
export function watchZoneTransitions(zone: string, callback: (at: Date) => void): () => void {
  return watchZoneTransitionsImpl(zone, callback, getEngine())
}

/**
 * Call `callback` now and then on every wall-clock multiple of `granularityMs`,
 * so a 1000 ms clock ticks exactly on each second instead of drifting.
 *
 * @param callback - Called with the current time.
 * @param granularityMs - Interval in milliseconds (default `1000`, minimum `100`).
 * @returns A function that stops ticking.
 *
 * @example
 * ```ts
 * const stop = onTick(now => render(format(now, 'Asia/Tokyo', 'HH:mm:ss')))
 * ```
 */
export function onTick(callback: (now: Date) => void, granularityMs: number = 1000): () => void {
  return onTickImpl(callback, granularityMs)
}

/**
 * The engine instance in use, for advanced use such as calling engine
 * primitives directly. See {@link TzEngine}.
 */
export function getCurrentEngine(): TzEngine {
  return getEngine()
}

/**
 * Replace the engine with your own {@link TzEngine} implementation, or an engine
 * created with {@link createEmbeddedTzdbEngine} or {@link createSystemIntlEngine}.
 * Unlike {@link initClockworkTZ}, this doesn't touch auto-updates.
 *
 * @param engine - The engine to use from now on.
 */
export function setEngine(engine: TzEngine): void {
  setEngineState(engine)
}

/**
 * A copy of the options last passed to {@link initClockworkTZ}.
 */
export function getInitOptions(): ClockworkOptions {
  return { ...initOptions }
}

/**
 * Check the configured manifest for newer tzdb data now, instead of waiting for
 * the next auto-update.
 *
 * @returns `true` if newer verified data was loaded, otherwise `false`.
 * @throws {@link TimezoneError} if the engine isn't `embedded-tzdb` or no
 *   `manifestURL` was configured.
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
 * The engine in use, its tzdb version, whether it has data, and when data was
 * last loaded.
 *
 * @example
 * ```ts
 * getStatus() // { engine: 'system-intl', tzdbVersion: undefined, dataLoaded: true, lastUpdate: undefined }
 * ```
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
