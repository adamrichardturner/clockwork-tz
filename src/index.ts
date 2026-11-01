/**
 * clockworktz: timezone conversions that get the weird zones right.
 *
 * Exact DST gap and overlap handling (Temporal semantics), half- and
 * quarter-hour offsets, and an optional deterministic IANA tzdb engine, with
 * zero runtime dependencies.
 *
 * @example
 * ```ts
 * import { fromUTC, convert, interpretLocal, format } from 'clockworktz'
 *
 * fromUTC('2024-07-15T14:00:00Z', 'Australia/Lord_Howe').local // '2024-07-16 00:30:00.000'
 * ```
 *
 * @see {@link https://clockworktz.dev/docs | Documentation}
 * @packageDocumentation
 * @license MIT
 */

export {
  initClockworkTZ,
  dispose,
  engine,
  tzdbVersion,
  getUserTimeZone,
  isValidTimeZone,
  canonicalizeTimeZone,
  fromUTC,
  interpretLocal,
  convert,
  getZoneInfo,
  getZoneCountries,
  getOffset,
  isDST,
  listTimeZones,
  onDataUpdate,
  watchZoneTransitions,
  onTick,
  getCurrentEngine,
  setEngine,
  getInitOptions,
  refreshTimezoneData,
  getStatus,
} from './api.js'
export type { WallTime } from './api.js'

export type {
  EngineKind,
  Disambiguation,
  DateInput,
  ClockworkTime,
  ZoneInfo,
  Transition,
  ListOptions,
  TimeZoneItem,
  ClockworkOptions,
  FormatOptions,
  ConvertOptions,
  TzEngine,
  LoadableEngine,
  LabelStyle,
  TzdbManifest,
} from './data/types.js'

export { TimezoneError, AmbiguousTimeError, InvalidTimeError } from './data/types.js'

export {
  format,
  formatWithPattern,
  formatNow,
  formatFor,
  formatRange,
  formatDuration,
  formatRelative,
  formatOffset,
  isValidFormatPattern,
  FORMAT_PATTERNS,
  DEFAULT_FORMAT_PATTERN,
} from './format.js'

export {
  parse,
  parseDate,
  parseComponents,
  safeParse,
  isParseable,
  parseAny,
  parseRange,
  parseTime,
  parseOffset,
  normalize,
} from './parse.js'
export type { ParseResult, ParseOptions } from './parse.js'

export { isValidISOString, isValidLocalISOString } from './utils/iso.js'
export type { DateComponents } from './utils/iso.js'

export {
  getNextTransition,
  getPreviousTransition,
  getTransitions,
  isNearTransition,
  cleanupAllWatchers,
  getWatcherStats,
} from './transitions.js'
export type { TransitionInfo } from './transitions.js'

export {
  ensureFreshTzdb,
  verifyManifestSignature,
  compareTzdbVersions,
  clearCache,
  getCacheStats,
  DEFAULT_MANIFEST_URL,
  DEFAULT_PUBLIC_KEY,
} from './data/updater.js'
export type { EnsureFreshOptions } from './data/updater.js'

export { createSystemIntlEngine, SystemIntlEngine } from './engines/systemIntl.js'
export { createEmbeddedTzdbEngine, EmbeddedTzdbEngine } from './engines/embeddedTzdb.js'

/**
 * The version of clockworktz, such as `'1.0.1'`.
 */
export const VERSION: string = __VERSION__
