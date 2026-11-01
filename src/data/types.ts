/**
 * Core types and interfaces for clockworktz
 */

/**
 * Which timezone engine is in use:
 * - `'system-intl'` (default): the runtime's own timezone data (ICU), no data to ship
 * - `'embedded-tzdb'`: a pinned IANA tzdb release, identical on every platform
 *
 * @see {@link https://clockworktz.dev/docs/engines | Engines & tzdb data}
 */
export type EngineKind = 'system-intl' | 'embedded-tzdb'

/**
 * How to resolve a wall time that a DST transition skips (a gap) or repeats
 * (an overlap). Same semantics as Temporal:
 * - `'compatible'` (default): the later instant in a gap (pushed forward), the
 *   earlier in an overlap
 * - `'earliest'`: the earlier of the two candidate instants
 * - `'latest'`: the later of the two candidate instants
 * - `'reject'`: throw {@link InvalidTimeError} (gap) or {@link AmbiguousTimeError} (overlap)
 *
 * @see {@link https://clockworktz.dev/docs/dst-disambiguation | DST gaps and overlaps}
 */
export type Disambiguation = 'compatible' | 'earliest' | 'latest' | 'reject'

/**
 * Label format for {@link listTimeZones}:
 * - `'original'`: `Asia/Kathmandu`
 * - `'offset'`: `(UTC+05:45) Asia/Kathmandu`
 * - `'abbrev'`: `Asia/Kathmandu (+0545)`
 * - `'altName'`: `Asia/Kathmandu (Nepal Time)`, in the `locale` you pass
 */
export type LabelStyle = 'original' | 'offset' | 'abbrev' | 'altName'

/**
 * An instant: a `Date`, epoch milliseconds, or an ISO 8601 string with an
 * offset or `Z` (`'2024-07-15T14:00:00Z'`, `'2024-07-15T19:45:00+05:45'`).
 * Strings without an offset are wall times, not instants; pass those to
 * {@link interpretLocal}.
 */
export type DateInput = string | Date | number

/**
 * An instant together with how it's seen in a zone. Returned by
 * {@link fromUTC}, {@link interpretLocal} and {@link convert}.
 *
 * @example
 * ```ts
 * {
 *   utc: '2024-07-15T14:00:00.000Z',
 *   zone: 'Australia/Lord_Howe',
 *   local: '2024-07-16 00:30:00.000',
 *   offsetMinutes: 630,
 *   isDST: false,
 *   abbreviation: '+1030',
 *   source: 'system-intl'
 * }
 * ```
 */
export interface ClockworkTime {
  /** The instant as an ISO 8601 UTC string, such as `'2024-07-15T14:00:00.000Z'` */
  utc: string
  /** The zone, as you passed it */
  zone: string
  /** Local time in the zone, formatted with the `format` option (default `'yyyy-MM-dd HH:mm:ss.SSS'`) */
  local: string
  /**
   * Offset from UTC in minutes, such as `630` for +10:30. Fractional only for
   * historical local mean time, such as Kolkata's +05:53:28 before 1854.
   */
  offsetMinutes: number
  /** Whether daylight saving time is in effect */
  isDST: boolean
  /** Abbreviation in effect, such as `'EST'`, or `'+0545'` where the tzdb has no letters */
  abbreviation: string
  /** The engine that produced this result */
  source: EngineKind
  /** The tzdb release used, such as `'2026f'`; only set by the `embedded-tzdb` engine */
  tzdbVersion?: string
}

/**
 * The offset, DST flag and abbreviation in effect in a zone at an instant.
 * Returned by {@link getZoneInfo}.
 */
export interface ZoneInfo {
  /** Offset from UTC in seconds, such as `20700` for +05:45 */
  offsetSeconds: number
  /** Whether daylight saving time is in effect */
  isDST: boolean
  /** Abbreviation in effect, such as `'EDT'` or `'+0545'` */
  abbreviation: string
}

/**
 * A change of offset, DST flag or abbreviation, in engine form (epoch
 * milliseconds). The public transition functions return {@link TransitionInfo}.
 */
export interface Transition {
  /** The instant of the transition, in epoch milliseconds */
  at: number
  /** What was in effect just before the transition */
  before: ZoneInfo
  /** What is in effect from the transition onwards */
  after: ZoneInfo
}

/**
 * Options for {@link listTimeZones}.
 */
export interface ListOptions {
  /** Label format (default `'original'`); see {@link LabelStyle} */
  labelStyle?: LabelStyle
  /** The instant used for offsets and labels (default: now) */
  at?: DateInput
  /** Language for `'altName'` labels (default `'en'`) */
  locale?: string
  /** Only zones used in this ISO 3166 country, such as `'AU'` (case-insensitive) */
  country?: string
}

/**
 * One zone in a {@link listTimeZones} result.
 */
export interface TimeZoneItem {
  /** The IANA identifier, for storing or passing to other functions */
  value: string
  /** The label to show users, in the requested {@link LabelStyle} */
  label: string
  /** Offset from UTC in minutes at the requested instant */
  offsetMinutes: number
  /** ISO 3166 codes of the countries using the zone; empty when unknown */
  countryCodes: string[]
}

/**
 * Options for {@link initClockworkTZ}.
 *
 * @example
 * ```ts
 * import { tzdb } from 'clockworktz/tzdb'
 *
 * const options: ClockworkOptions = {
 *   engine: 'embedded-tzdb',
 *   data: tzdb,
 *   manifestURL: DEFAULT_MANIFEST_URL,
 * }
 * ```
 */
export interface ClockworkOptions {
  /** The engine to use (default `'system-intl'`); see {@link EngineKind} */
  engine?: EngineKind
  /**
   * tzdb data for the `embedded-tzdb` engine, usually `tzdb` from
   * `'clockworktz/tzdb'`. Requires `engine: 'embedded-tzdb'`.
   */
  data?: unknown
  /**
   * A signed manifest to load newer tzdb data from and keep it current, usually
   * {@link DEFAULT_MANIFEST_URL}. Requires `engine: 'embedded-tzdb'`.
   */
  manifestURL?: string
  /** Raw Ed25519 public key (base64) for self-hosted manifests (default {@link DEFAULT_PUBLIC_KEY}) */
  publicKey?: string
  /** How often to check the manifest, in milliseconds (default 24 hours; `0` disables) */
  autoUpdateIntervalMs?: number
}

/**
 * Formatting options for {@link fromUTC}, {@link interpretLocal} and {@link convert}.
 */
export interface FormatOptions {
  /** Pattern for the result's `local` field (default `'yyyy-MM-dd HH:mm:ss.SSS'`); see {@link format} for tokens */
  format?: string
  /** Locale for month, weekday and AM/PM names in `format` (default `'en'`) */
  locale?: string
}

/**
 * Options for {@link interpretLocal} and {@link convert}.
 */
export interface ConvertOptions extends FormatOptions {
  /** How to resolve skipped or repeated wall times (default `'compatible'`); see {@link Disambiguation} */
  disambiguation?: Disambiguation
}

/**
 * The primitives a timezone engine provides. Everything else (wall-time
 * resolution, formatting, transitions) is built on these, so a custom engine
 * passed to {@link setEngine} only needs to implement this interface.
 */
export interface TzEngine {
  /** Which engine this is */
  readonly kind: EngineKind

  /** The tzdb release in use, or `undefined` when the data comes from the runtime */
  getVersion(): string | undefined

  /** Whether the engine knows a zone (links included); never throws */
  isValidTimeZone(zone: string): boolean

  /** The canonical spelling of a valid zone, with links resolved where the engine knows them */
  canonicalize(zone: string): string

  /** Every zone identifier the engine lists, for pickers */
  listZoneIds(): string[]

  /** The offset, DST flag and abbreviation in effect in `zone` at `epochMs` */
  getZoneInfo(epochMs: number, zone: string): ZoneInfo

  /** Exact transitions in [`fromMs`, `toMs`); optional (otherwise found by sampling) */
  getTransitions?(zone: string, fromMs: number, toMs: number): Transition[]

  /** ISO 3166 codes of the countries using a zone; optional */
  getCountryCodes?(zone: string): string[]
}

/**
 * An engine whose timezone data can be replaced at runtime, such as
 * {@link EmbeddedTzdbEngine}.
 */
export interface LoadableEngine extends TzEngine {
  /** Replace the engine's data; throws {@link TimezoneError} if it's invalid */
  loadTzdbData(data: unknown): void
  /** Whether data has been loaded */
  isDataLoaded(): boolean
}

/**
 * The signed manifest that describes a tzdb data release.
 *
 * @see {@link https://clockworktz.dev/docs/security | Security of data updates}
 */
export interface TzdbManifest {
  /** The tzdb release, such as `'2026f'` */
  version: string
  /** When the data was built and signed (ISO 8601) */
  releaseDate: string
  /** Where to download the data (absolute, or relative to the manifest URL) */
  dataUrl: string
  /** Lowercase hex SHA-256 of the data file's bytes */
  sha256: string
  /** Base64 Ed25519 signature over `${version}\n${sha256}` */
  signature: string
  /** Short identifier of the signing key */
  keyId: string
}

/**
 * Cached timezone data
 */
export interface CachedTzdbData {
  /** TZDB version */
  version: string
  /** Cached timestamp */
  cachedAt: number
  /** Actual timezone data */
  data: unknown
}

/**
 * Environment detection results
 */
export interface Environment {
  /** Running in Node.js */
  isNode: boolean
  /** Running in browser */
  isBrowser: boolean
  /** BroadcastChannel available */
  hasBroadcastChannel: boolean
  /** localStorage available */
  hasLocalStorage: boolean
}

/**
 * The base class of every error clockworktz throws: invalid zones, unparseable
 * input, unsupported format tokens and invalid timezone data. The underlying
 * error, when there is one, is in `cause`.
 *
 * @example
 * ```ts
 * try {
 *   fromUTC('2024-07-15T14:00:00Z', 'Mars/Olympus_Mons')
 * } catch (error) {
 *   if (error instanceof TimezoneError) {
 *     console.error(error.message) // 'Invalid timezone: Mars/Olympus_Mons'
 *   }
 * }
 * ```
 */
export class TimezoneError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'TimezoneError'
  }
}

/**
 * Thrown with `disambiguation: 'reject'` for a wall time that happens twice
 * because clocks went back, such as 01:30 in New York on 3 November 2024.
 * Pick `'earliest'` or `'latest'` to resolve it instead.
 */
export class AmbiguousTimeError extends TimezoneError {
  constructor(localTime: string, zone: string) {
    super(`Ambiguous time "${localTime}" in timezone "${zone}"`)
    this.name = 'AmbiguousTimeError'
  }
}

/**
 * Thrown with `disambiguation: 'reject'` for a wall time that doesn't exist
 * because clocks went forward, such as 02:30 in New York on 10 March 2024.
 * Use `'compatible'` to push it forward instead.
 */
export class InvalidTimeError extends TimezoneError {
  constructor(localTime: string, zone: string) {
    super(`Invalid time "${localTime}" in timezone "${zone}"`)
    this.name = 'InvalidTimeError'
  }
}
