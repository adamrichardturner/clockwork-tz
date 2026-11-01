/**
 * Engine-independent zone lookups, including fixed-offset zones like "+05:30"
 */

import type { TzEngine, ZoneInfo } from '../data/types.js'
import { TimezoneError } from '../data/types.js'
import { parseOffsetSeconds } from '../utils/iso.js'

const FIXED_OFFSET_PATTERN = /^[+-]\d{2}(?::?\d{2})?$/

/**
 * Format an offset in seconds as ±HH:mm, appending :ss when non-zero
 */
export function offsetSecondsToString(offsetSeconds: number, separator = ':'): string {
  const sign = offsetSeconds < 0 ? '-' : '+'
  const abs = Math.abs(offsetSeconds)
  const h = Math.floor(abs / 3600)
  const m = Math.floor((abs % 3600) / 60)
  const s = abs % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${sign}${pad(h)}${separator}${pad(m)}${s ? `${separator}${pad(s)}` : ''}`
}

function fixedOffsetSeconds(zone: string): number | null {
  if (!FIXED_OFFSET_PATTERN.test(zone)) {
    return null
  }
  try {
    return parseOffsetSeconds(zone)
  } catch {
    return null
  }
}

export function isValidZone(zone: string, engine: TzEngine): boolean {
  if (typeof zone !== 'string' || zone.trim() === '') {
    return false
  }
  return fixedOffsetSeconds(zone) !== null || engine.isValidTimeZone(zone)
}

export function assertValidZone(zone: string, engine: TzEngine, label = 'timezone'): void {
  if (!isValidZone(zone, engine)) {
    throw new TimezoneError(`Invalid ${label}: ${zone}`)
  }
}

export function canonicalizeZone(zone: string, engine: TzEngine): string {
  assertValidZone(zone, engine)
  const fixed = fixedOffsetSeconds(zone)
  if (fixed !== null) {
    return offsetSecondsToString(fixed)
  }
  return engine.canonicalize(zone)
}

export function zoneInfoAt(epochMs: number, zone: string, engine: TzEngine): ZoneInfo {
  const fixed = fixedOffsetSeconds(zone)
  if (fixed !== null) {
    return { offsetSeconds: fixed, isDST: false, abbreviation: offsetSecondsToString(fixed) }
  }
  return engine.getZoneInfo(epochMs, zone)
}

export function offsetSecondsAt(epochMs: number, zone: string, engine: TzEngine): number {
  return zoneInfoAt(epochMs, zone, engine).offsetSeconds
}

export function isFixedOffsetZone(zone: string): boolean {
  return fixedOffsetSeconds(zone) !== null
}
