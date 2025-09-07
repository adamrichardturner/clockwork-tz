/**
 * clockwork-tz - Accurate timezone conversions and DST handling
 *
 * @author Adam Turner
 * @version 0.1.0
 * @license MIT
 */

// Re-export all public API functions
export {
  initClockworkTZ,
  engine,
  tzdbVersion,
  getUserTimeZone,
  isValidTimeZone,
  fromUTC,
  interpretLocal,
  convert,
  format,
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

// Import for default export
import {
  initClockworkTZ,
  engine,
  tzdbVersion,
  getUserTimeZone,
  isValidTimeZone,
  fromUTC,
  interpretLocal,
  convert,
  format,
  getOffset,
  isDST,
  listTimeZones,
  onDataUpdate,
  watchZoneTransitions,
  onTick,
  getStatus,
} from './api.js'
import { parseDate, normalize as normalizeToDate } from './parse.js'

// Re-export all public types
export type {
  EngineKind,
  Disambiguation,
  ClockworkTime,
  ListOptions,
  TimeZoneItem,
  ClockworkOptions,
  FormatOptions,
  ConvertOptions,
  TzEngine,
  LabelStyle,
} from './data/types.js'

// Re-export error classes
export {
  TimezoneError,
  AmbiguousTimeError,
  InvalidTimeError,
  NotImplementedError,
} from './data/types.js'

// Re-export formatting utilities
export {
  format as formatTime,
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

// Re-export parsing utilities
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

// Re-export parsing types
export type { ParseResult, ParseOptions } from './parse.js'

// Re-export ISO types
export type { DateComponents } from './utils/iso.js'

// Re-export transition utilities
export {
  getNextTransition,
  getPreviousTransition,
  isNearTransition,
  cleanupAllWatchers,
  getWatcherStats,
} from './transitions.js'

// Re-export environment utilities
export {
  detectEnvironment,
  getCacheStorage,
  createBroadcastChannel,
  getEnvironment,
  isSecureContext,
} from './utils/env.js'

// Re-export ISO utilities
export {
  parseISODate,
  isValidISOString,
  isValidLocalISOString,
  parseLocalISOString,
  componentsToDate,
  formatAsUTC,
  formatAsLocalISO,
  normalizeToDate,
  isLeapYear,
  getDaysInMonth,
  validateDateComponents,
  addMilliseconds,
  diffInMilliseconds,
} from './utils/iso.js'

// Re-export data updater utilities
export {
  ensureFreshTzdb,
  clearCache,
  getCacheStats,
  DEFAULT_MANIFEST_URL,
  CACHE_KEY_PREFIX,
  BROADCAST_CHANNEL_NAME,
} from './data/updater.js'

// Re-export engine constructors for advanced usage
export { createSystemIntlEngine } from './engines/systemIntl.js'

export { createEmbeddedTzdbEngine } from './engines/embeddedTzdb.js'

// Version information
export const VERSION = '0.1.0'

/**
 * Default export for convenience
 */
export default {
  // Core API
  init: initClockworkTZ,
  engine,
  tzdbVersion,
  getUserTimeZone,
  isValidTimeZone,
  fromUTC,
  interpretLocal,
  convert,
  format,
  getOffset,
  isDST,
  listTimeZones,

  // Event handling
  onDataUpdate,
  watchZoneTransitions,
  onTick,

  // Utilities
  formatTime: format,
  parseDate,
  normalize: normalizeToDate,

  // Status
  getStatus,
  VERSION,
}
