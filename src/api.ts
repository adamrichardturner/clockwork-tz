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
  TzEngine,
} from './data/types.js'
import { TimezoneError } from './data/types.js'

import { createSystemIntlEngine } from './engines/systemIntl.js'
import { createEmbeddedTzdbEngine } from './engines/embeddedTzdb.js'
import { ensureFreshTzdb, onDataUpdate as onDataUpdateImpl } from './data/updater.js'
import {
  watchZoneTransitions as watchZoneTransitionsImpl,
  onTick as onTickImpl,
} from './transitions.js'
import { format as formatImpl, DEFAULT_FORMAT_PATTERN } from './format.js'
import { normalizeToDate } from './utils/iso.js'

/**
 * Global state
 */
let currentEngine: TzEngine = createSystemIntlEngine()
let initOptions: ClockworkOptions = {}
let updateListeners: Set<(version: string) => void> = new Set()

/**
 * Initialize clockwork-tz with options
 */
export function initClockworkTZ(opts: ClockworkOptions = {}): void {
  initOptions = { ...opts }

  const { engine = 'system-intl', manifestURL, autoUpdateIntervalMs = 24 * 60 * 60 * 1000 } = opts

  // Switch engine if requested
  if (engine !== currentEngine.kind) {
    switch (engine) {
      case 'system-intl': {
        currentEngine = createSystemIntlEngine()
        break
      }
      case 'embedded-tzdb': {
        currentEngine = createEmbeddedTzdbEngine()

        // Auto-load timezone data if manifest URL provided
        if (manifestURL) {
          ensureFreshTzdb(manifestURL)
            .then(result => {
              if (result && 'loadTzdbData' in currentEngine) {
                return (currentEngine as any).loadTzdbData(result.data, result.version)
              }
            })
            .catch(error => {
              console.warn('Failed to load initial timezone data:', error)
            })
        }
        break
      }
      default: {
        throw new Error(`Unknown engine: ${engine}`)
      }
    }
  }

  // Set up auto-update if enabled and using embedded engine
  if (engine === 'embedded-tzdb' && manifestURL && autoUpdateIntervalMs > 0) {
    const updateInterval = setInterval(async () => {
      try {
        const result = await ensureFreshTzdb(manifestURL)
        if (result && 'loadTzdbData' in currentEngine) {
          await (currentEngine as any).loadTzdbData(result.data, result.version)

          // Notify listeners
          for (const listener of updateListeners) {
            try {
              listener(result.version)
            } catch (error) {
              console.warn('Error in data update listener:', error)
            }
          }
        }
      } catch (error) {
        console.warn('Auto-update failed:', error)
      }
    }, autoUpdateIntervalMs)

    // Clean up on page unload if in browser
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        clearInterval(updateInterval)
      })
    }
  }
}

/**
 * Get the current engine type
 */
export function engine(): EngineKind {
  return currentEngine.kind
}

/**
 * Get the current TZDB version (if available)
 */
export function tzdbVersion(): string | undefined {
  return currentEngine.getVersion()
}

/**
 * Get the user's timezone
 */
export function getUserTimeZone(): string {
  return currentEngine.getUserTimeZone()
}

/**
 * Check if a timezone identifier is valid
 */
export function isValidTimeZone(zone: string): boolean {
  if (typeof zone !== 'string' || zone.trim() === '') {
    return false
  }

  return currentEngine.isValidTimeZone(zone)
}

/**
 * Convert UTC time to a specific timezone
 */
export function fromUTC(
  input: string | Date,
  zone: string,
  opts: FormatOptions = {}
): ClockworkTime {
  if (!isValidTimeZone(zone)) {
    throw new TimezoneError(`Invalid timezone: ${zone}`)
  }

  const date = normalizeToDate(input)
  const result = currentEngine.fromUTC(date, zone)

  // Apply custom formatting if requested
  if (opts.format && opts.format !== DEFAULT_FORMAT_PATTERN) {
    result.local = currentEngine.format(date, zone, opts.format)
  }

  return result
}

/**
 * Interpret a local time string in a specific timezone
 */
export function interpretLocal(
  localISO: string,
  zone: string,
  opts: ConvertOptions = {}
): ClockworkTime {
  if (!isValidTimeZone(zone)) {
    throw new TimezoneError(`Invalid timezone: ${zone}`)
  }

  const { disambiguation = 'latest', format } = opts
  const result = currentEngine.interpretLocal(localISO, zone, disambiguation)

  // Apply custom formatting if requested
  if (format && format !== DEFAULT_FORMAT_PATTERN) {
    const utcDate = new Date(result.utc)
    result.local = currentEngine.format(utcDate, zone, format)
  }

  return result
}

/**
 * Convert time from one timezone to another
 */
export function convert(
  input: string | Date,
  fromZone: string,
  toZone: string,
  opts: ConvertOptions = {}
): ClockworkTime {
  if (!isValidTimeZone(fromZone)) {
    throw new TimezoneError(`Invalid source timezone: ${fromZone}`)
  }

  if (!isValidTimeZone(toZone)) {
    throw new TimezoneError(`Invalid target timezone: ${toZone}`)
  }

  // First, interpret the input in the source timezone
  let utcTime: Date

  if (input instanceof Date) {
    utcTime = input
  } else if (typeof input === 'string') {
    // Check if it's already a UTC string
    if (input.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(input)) {
      utcTime = normalizeToDate(input)
    } else {
      // Treat as local time in the source timezone
      const sourceResult = interpretLocal(input, fromZone, opts)
      utcTime = new Date(sourceResult.utc)
    }
  } else {
    throw new Error('Input must be a Date object or ISO string')
  }

  // Convert to target timezone
  return fromUTC(utcTime, toZone, opts)
}

/**
 * Format a date/time in a specific timezone
 */
export function format(
  input: string | Date,
  zone: string,
  pattern: string = DEFAULT_FORMAT_PATTERN
): string {
  if (!isValidTimeZone(zone)) {
    throw new TimezoneError(`Invalid timezone: ${zone}`)
  }

  const date = normalizeToDate(input)
  return formatImpl(date, zone, pattern)
}

/**
 * Get timezone offset in minutes for a specific date/time
 */
export function getOffset(input: string | Date, zone: string): number {
  if (!isValidTimeZone(zone)) {
    throw new TimezoneError(`Invalid timezone: ${zone}`)
  }

  const date = normalizeToDate(input)
  return currentEngine.getOffset(date, zone)
}

/**
 * Check if a date/time is in Daylight Saving Time
 */
export function isDST(input: string | Date, zone: string): boolean {
  if (!isValidTimeZone(zone)) {
    return false
  }

  const date = normalizeToDate(input)
  return currentEngine.isDST(date, zone)
}

/**
 * List available timezones with labels and current offsets
 */
export function listTimeZones(opts: ListOptions = {}): TimeZoneItem[] {
  return currentEngine.listTimeZones(opts)
}

/**
 * Listen for timezone data updates
 */
export function onDataUpdate(callback: (version: string) => void): () => void {
  updateListeners.add(callback)

  // Also listen for broadcast updates from other tabs
  const broadcastCleanup = onDataUpdateImpl(callback)

  return () => {
    updateListeners.delete(callback)
    broadcastCleanup()
  }
}

/**
 * Watch for timezone transitions (DST changes)
 */
export function watchZoneTransitions(zone: string, callback: (at: Date) => void): () => void {
  return watchZoneTransitionsImpl(zone, callback, currentEngine)
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
  return currentEngine
}

/**
 * Manually set the engine (for testing or advanced usage)
 */
export function setEngine(engine: TzEngine): void {
  currentEngine = engine
}

/**
 * Get current initialization options
 */
export function getInitOptions(): ClockworkOptions {
  return { ...initOptions }
}

/**
 * Force refresh timezone data (for embedded engine)
 */
export async function refreshTimezoneData(): Promise<void> {
  if (currentEngine.kind !== 'embedded-tzdb') {
    throw new Error('Timezone data refresh only available for embedded-tzdb engine')
  }

  const { manifestURL } = initOptions
  if (!manifestURL) {
    throw new Error('No manifest URL configured for timezone data refresh')
  }

  const result = await ensureFreshTzdb(manifestURL)
  if (result && 'loadTzdbData' in currentEngine) {
    await (currentEngine as any).loadTzdbData(result.data, result.version)

    // Notify listeners
    for (const listener of updateListeners) {
      try {
        listener(result.version)
      } catch (error) {
        console.warn('Error in data update listener:', error)
      }
    }
  }
}

/**
 * Get library version and status information
 */
export function getStatus(): {
  engine: EngineKind
  tzdbVersion?: string | undefined
  dataLoaded: boolean
  lastUpdate?: Date | undefined
} {
  const isDataLoaded =
    currentEngine.kind === 'system-intl' ||
    (currentEngine.kind === 'embedded-tzdb' &&
      'isDataLoaded' in currentEngine &&
      (currentEngine as any).isDataLoaded())

  return {
    engine: currentEngine.kind,
    tzdbVersion: currentEngine.getVersion() ?? undefined,
    dataLoaded: isDataLoaded,
    lastUpdate: undefined, // TODO: Track last update timestamp
  }
}
