/**
 * Core types and interfaces for clockwork-tz
 */

/** Engine types supported by clockwork-tz */
export type EngineKind = 'system-intl' | 'embedded-tzdb'

/** Disambiguation strategy for ambiguous local times during DST transitions */
export type Disambiguation = 'earliest' | 'latest' | 'reject'

/** Label style options for timezone listing */
export type LabelStyle = 'original' | 'offset' | 'abbrev' | 'altName'

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
  /** Offset from UTC in minutes (e.g., 630 for +10:30) */
  offsetMinutes: number
  /** Whether this time is during Daylight Saving Time */
  isDST: boolean
  /** The engine that produced this result */
  source: EngineKind
  /** TZDB version (only available for embedded-tzdb engine) */
  tzdbVersion?: string
}

/**
 * Options for listing timezones
 */
export interface ListOptions {
  /** Style for timezone labels */
  labelStyle?: LabelStyle
  /** User's timezone for biasing label generation */
  forZone?: string
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
  /** URL for CDN-hosted timezone database manifest */
  manifestURL?: string
  /** Auto-update interval in milliseconds (default: 24 hours) */
  autoUpdateIntervalMs?: number
}

/**
 * Formatting options
 */
export interface FormatOptions {
  /** Custom format pattern (date-fns compatible) */
  format?: string
}

/**
 * Conversion options
 */
export interface ConvertOptions extends FormatOptions {
  /** Disambiguation strategy for ambiguous times */
  disambiguation?: Disambiguation
}

/**
 * Engine interface that all timezone engines must implement
 */
export interface TzEngine {
  /** Engine identifier */
  readonly kind: EngineKind

  /** Get current TZDB version (if available) */
  getVersion(): string | undefined

  /** Check if a timezone is valid */
  isValidTimeZone(zone: string): boolean

  /** Get user's current timezone */
  getUserTimeZone(): string

  /** Convert UTC time to timezone */
  fromUTC(utc: Date, zone: string): ClockworkTime

  /** Interpret local time in timezone */
  interpretLocal(localISO: string, zone: string, disambiguation: Disambiguation): ClockworkTime

  /** Get timezone offset at specific time */
  getOffset(time: Date, zone: string): number

  /** Check if time is in DST */
  isDST(time: Date, zone: string): boolean

  /** List available timezones */
  listTimeZones(options: ListOptions): TimeZoneItem[]

  /** Format time in timezone */
  format(time: Date, zone: string, pattern: string): string
}

/**
 * Timezone database manifest structure
 */
export interface TzdbManifest {
  /** TZDB version */
  version: string
  /** Release date */
  releaseDate: string
  /** Data URL */
  dataUrl: string
  /** Signature for verification */
  signature: string
  /** ETag for caching */
  etag?: string
}

/**
 * Cached timezone data
 */
export interface CachedTzdbData {
  /** TZDB version */
  version: string
  /** Cached timestamp */
  cachedAt: number
  /** ETag from server */
  etag?: string | undefined
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
  /** Cache API available */
  hasCacheAPI: boolean
  /** File system access available */
  hasFileSystem: boolean
}

/**
 * Error thrown when embedded TZDB engine is not yet implemented
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
  constructor(message: string) {
    super(message)
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
