/**
 * clockwork-tz - Accurate timezone conversions and DST handling
 *
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

/** Library version */
export const VERSION: string = __VERSION__
