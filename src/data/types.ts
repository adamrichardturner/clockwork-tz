/**
 * Core types and interfaces for clockwork-tz
 */

/** Engine types supported by clockwork-tz */
export type EngineKind = 'system-intl' | 'embedded-tzdb'

/**
 * Disambiguation strategy for local times that are skipped (gap) or repeated
 * (overlap) by a transition. Semantics match Temporal:
 * - `compatible`: later instant for gaps, earlier instant for overlaps (default)
 * - `earliest`: the earlier of the two candidate instants
 * - `latest`: the later of the two candidate instants
 * - `reject`: throw InvalidTimeError (gap) or AmbiguousTimeError (overlap)
 */
export type Disambiguation = 'compatible' | 'earliest' | 'latest' | 'reject'

/** Label style options for timezone listing */
export type LabelStyle = 'original' | 'offset' | 'abbrev' | 'altName'

/** Anything that identifies an instant: ISO string with offset, Date, or epoch milliseconds */
export type DateInput = string | Date | number

/**
 * Complete timezone-aware time representation
 */
export interface ClockworkTime {
  /** ISO 8601 instant in UTC with Z suffix */
  utc: string
  /** IANA timezone identifier (e.g., "Australia/Lord_Howe") */
  zone: string
  /** Formatted local civil time */
  local: string
  /**
   * Offset from UTC in minutes (e.g., 630 for +10:30). Fractional only for
   * historical local mean time offsets such as Amsterdam's +00:19:32.
   */
  offsetMinutes: number
  /** Whether this time is during Daylight Saving Time */
  isDST: boolean
  /** Timezone abbreviation in effect (e.g., "EST", "+0545") */
  abbreviation: string
  /** The engine that produced this result */
  source: EngineKind
  /** TZDB version (only available for embedded-tzdb engine) */
  tzdbVersion?: string
}

/**
 * Offset, DST flag and abbreviation in effect at an instant
 */
export interface ZoneInfo {
  /** Offset from UTC in seconds */
  offsetSeconds: number
  /** Whether daylight saving time is in effect */
  isDST: boolean
  /** Abbreviation in effect */
  abbreviation: string
}

/**
 * A change of offset, DST flag or abbreviation in a zone
 */
export interface Transition {
  /** Instant of the transition in epoch milliseconds */
  at: number
  /** Zone info in effect just before the transition */
  before: ZoneInfo
  /** Zone info in effect from the transition onwards */
  after: ZoneInfo
}

/**
 * Options for listing timezones
 */
export interface ListOptions {
  /** Style for timezone labels */
  labelStyle?: LabelStyle
  /** Instant used to compute offsets and labels (default: now) */
  at?: DateInput
  /** Locale used for long timezone names (default: "en") */
  locale?: string
}

/**
 * Timezone list item
 */
export interface TimeZoneItem {
  /** IANA timezone identifier */
  value: string
  /** Human-readable label */
  label: string
  /** Current offset from UTC in minutes */
  offsetMinutes: number
}

/**
 * Initialization options for clockwork-tz
 */
export interface ClockworkOptions {
  /** Engine to use for timezone calculations */
  engine?: EngineKind
  /** Timezone data for the embedded-tzdb engine (e.g. from `clockwork-tz/tzdb`) */
  data?: unknown
  /** URL of a signed timezone database manifest to load and keep fresh */
  manifestURL?: string
  /** Base64 raw Ed25519 public key used to verify manifests (default: the project key) */
  publicKey?: string
  /** Auto-update interval in milliseconds (default: 24 hours, 0 disables) */
  autoUpdateIntervalMs?: number
}

/**
 * Formatting options
 */
export interface FormatOptions {
  /** Custom format pattern (date-fns compatible subset) */
  format?: string
  /** Locale for month, weekday and day period names (default: "en") */
  locale?: string
}

/**
 * Conversion options
 */
export interface ConvertOptions extends FormatOptions {
  /** Disambiguation strategy for skipped or repeated local times */
  disambiguation?: Disambiguation
}

/**
 * Primitives every timezone engine must implement. All higher-level behaviour
 * (local time interpretation, formatting, transitions) is built on these.
 */
export interface TzEngine {
  /** Engine identifier */
  readonly kind: EngineKind

  /** Get current TZDB version (if available) */
  getVersion(): string | undefined

  /** Check if a timezone is valid */
  isValidTimeZone(zone: string): boolean

  /** Canonical spelling of a valid zone (links resolved where the engine knows them) */
  canonicalize(zone: string): string

  /** All zone identifiers the engine can list */
  listZoneIds(): string[]

  /** Offset, DST flag and abbreviation in effect at an instant */
  getZoneInfo(epochMs: number, zone: string): ZoneInfo

  /** Exact transitions in [fromMs, toMs), when the engine knows them */
  getTransitions?(zone: string, fromMs: number, toMs: number): Transition[]
}

/**
 * Engine that can load timezone data at runtime
 */
export interface LoadableEngine extends TzEngine {
  loadTzdbData(data: unknown): void
  isDataLoaded(): boolean
}

/**
 * Timezone database manifest structure
 */
export interface TzdbManifest {
  /** TZDB version, e.g. "2026a" */
  version: string
  /** Release date */
  releaseDate: string
  /** Data URL (absolute, or relative to the manifest URL) */
  dataUrl: string
  /** Hex SHA-256 of the data file bytes */
  sha256: string
  /** Base64 Ed25519 signature over `${version}\n${sha256}` */
  signature: string
  /** Identifier of the signing key */
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
 * Error thrown when a feature is not available for the current engine
 */
export class NotImplementedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NotImplementedError'
  }
}

/**
 * Error thrown for invalid timezone operations
 */
export class TimezoneError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'TimezoneError'
  }
}

/**
 * Error thrown for ambiguous time operations when disambiguation is 'reject'
 */
export class AmbiguousTimeError extends TimezoneError {
  constructor(localTime: string, zone: string) {
    super(`Ambiguous time "${localTime}" in timezone "${zone}"`)
    this.name = 'AmbiguousTimeError'
  }
}

/**
 * Error thrown for invalid local times (e.g., during spring forward)
 */
export class InvalidTimeError extends TimezoneError {
  constructor(localTime: string, zone: string) {
    super(`Invalid time "${localTime}" in timezone "${zone}"`)
    this.name = 'InvalidTimeError'
  }
}
