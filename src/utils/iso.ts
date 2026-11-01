/**
 * ISO 8601 date parsing and validation utilities.
 *
 * Nothing in this module depends on the host timezone: wall-clock times are
 * represented as "wall milliseconds", i.e. the epoch value the wall time would
 * have if it were UTC.
 */

import type { DateInput } from '../data/types.js'
import { TimezoneError } from '../data/types.js'

const DATE_TIME = String.raw`(-?\d{4,6})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,9}))?)?`

/**
 * ISO 8601 date-time with a UTC designator or numeric offset.
 * Matches: YYYY-MM-DDTHH:mm[:ss[.fff]](Z|±HH[:mm[:ss]]|±HHmm[ss])
 */
const ISO_DATE_PATTERN = new RegExp(`^${DATE_TIME}(Z|z|[+-]\\d{2}(?::?\\d{2}(?::?\\d{2})?)?)$`)

/**
 * Local ISO date-time without timezone info.
 * Matches: YYYY-MM-DDTHH:mm[:ss[.fff]] or YYYY-MM-DD HH:mm[:ss[.fff]]
 */
const LOCAL_ISO_PATTERN = new RegExp(`^${DATE_TIME}$`)

/**
 * A wall-clock date and time as fields. `month` is 1–12.
 */
export interface DateComponents {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
  millisecond: number
}

function matchToComponents(match: RegExpExecArray): DateComponents {
  const [, year, month, day, hour, minute, second = '0', fraction = '0'] = match
  return {
    year: parseInt(year!, 10),
    month: parseInt(month!, 10),
    day: parseInt(day!, 10),
    hour: parseInt(hour!, 10),
    minute: parseInt(minute!, 10),
    second: parseInt(second, 10),
    millisecond: parseInt(fraction.padEnd(3, '0').slice(0, 3), 10),
  }
}

/**
 * Parse a numeric UTC offset ("Z", "+05:45", "-0330", "+00:19:32") into seconds
 */
export function parseOffsetSeconds(offset: string): number {
  if (offset === 'Z' || offset === 'z') {
    return 0
  }
  const match = /^([+-])(\d{2})(?::?(\d{2})(?::?(\d{2}))?)?$/.exec(offset)
  if (!match) {
    throw new TimezoneError(`Invalid UTC offset: ${offset}`)
  }
  const [, sign, h, m = '0', s = '0'] = match
  const hours = parseInt(h!, 10)
  const minutes = parseInt(m, 10)
  const seconds = parseInt(s, 10)
  if (hours > 23 || minutes > 59 || seconds > 59) {
    throw new TimezoneError(`Invalid UTC offset: ${offset}`)
  }
  const total = hours * 3600 + minutes * 60 + seconds
  return sign === '-' ? -total : total
}

/**
 * Validate and parse an ISO 8601 date string that carries an offset
 */
export function parseISODate(isoString: string): Date {
  const match = typeof isoString === 'string' ? ISO_DATE_PATTERN.exec(isoString.trim()) : null
  if (!match) {
    throw new TimezoneError(`Invalid ISO date string: ${isoString}`)
  }

  const components = matchToComponents(match)
  if (!validateDateComponents(components)) {
    throw new TimezoneError(`Invalid date components in ISO string: ${isoString}`)
  }

  const offsetSeconds = parseOffsetSeconds(match[8]!)
  return new Date(componentsToWallMs(components) - offsetSeconds * 1000)
}

/**
 * Whether a string is a valid ISO 8601 instant: a date-time with an offset or
 * `Z`, and real calendar values. Never throws.
 *
 * @example
 * ```ts
 * isValidISOString('2024-07-15T14:00:00+05:45') // true
 * isValidISOString('2024-07-15T14:00:00') // false
 * isValidISOString('2023-02-29T00:00:00Z') // false
 * ```
 */
export function isValidISOString(isoString: string): boolean {
  if (typeof isoString !== 'string') {
    return false
  }
  const match = ISO_DATE_PATTERN.exec(isoString.trim())
  return match !== null && validateDateComponents(matchToComponents(match))
}

/**
 * Whether a string is a valid wall time: an ISO 8601 date-time without an
 * offset (`T` or a space; seconds and fraction optional) and real calendar
 * values. Never throws.
 *
 * @example
 * ```ts
 * isValidLocalISOString('2024-07-15 14:00') // true
 * isValidLocalISOString('2024-07-15T14:00:00Z') // false
 * ```
 */
export function isValidLocalISOString(localString: string): boolean {
  if (typeof localString !== 'string') {
    return false
  }
  const match = LOCAL_ISO_PATTERN.exec(localString.trim())
  return match !== null && validateDateComponents(matchToComponents(match))
}

/**
 * Parse a local ISO string into date components
 */
export function parseLocalISOString(localString: string): DateComponents {
  const match = typeof localString === 'string' ? LOCAL_ISO_PATTERN.exec(localString.trim()) : null
  if (!match) {
    throw new TimezoneError(`Invalid local ISO string: ${localString}`)
  }
  const components = matchToComponents(match)
  if (!validateDateComponents(components)) {
    throw new TimezoneError(`Invalid date components in local ISO string: ${localString}`)
  }
  return components
}

/**
 * Convert date components to wall milliseconds (the components read as UTC)
 */
export function componentsToWallMs(c: DateComponents): number {
  const date = new Date(0)
  date.setUTCFullYear(c.year, c.month - 1, c.day)
  date.setUTCHours(c.hour, c.minute, c.second, c.millisecond)
  return date.getTime()
}

/**
 * Convert wall milliseconds back into date components
 */
export function wallMsToComponents(wallMs: number): DateComponents {
  const d = new Date(wallMs)
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    second: d.getUTCSeconds(),
    millisecond: d.getUTCMilliseconds(),
  }
}

/**
 * Convert date components to a Date whose UTC fields equal the components.
 * Independent of the host timezone.
 */
export function componentsToDate(components: DateComponents): Date {
  return new Date(componentsToWallMs(components))
}

/**
 * Format a Date as ISO 8601 UTC string
 */
export function formatAsUTC(date: Date): string {
  return date.toISOString()
}

/**
 * Format components as a local ISO string (without timezone info)
 */
export function formatComponentsAsLocalISO(c: DateComponents): string {
  const pad = (n: number, len = 2) => String(n).padStart(len, '0')
  const year =
    c.year < 0 ? `-${pad(-c.year, 6)}` : c.year > 9999 ? `+${pad(c.year, 6)}` : pad(c.year, 4)
  return `${year}-${pad(c.month)}-${pad(c.day)}T${pad(c.hour)}:${pad(c.minute)}:${pad(c.second)}.${pad(c.millisecond, 3)}`
}

/**
 * Normalize input to a Date object. Strings must carry an offset or `Z`.
 */
export function normalizeToDate(input: DateInput): Date {
  if (input instanceof Date) {
    if (isNaN(input.getTime())) {
      throw new TimezoneError('Invalid Date')
    }
    return input
  }

  if (typeof input === 'number') {
    if (!Number.isFinite(input)) {
      throw new TimezoneError(`Invalid epoch milliseconds: ${input}`)
    }
    return new Date(input)
  }

  if (typeof input === 'string') {
    return parseISODate(input)
  }

  throw new TimezoneError(`Invalid date input: ${String(input)}`)
}

/**
 * Check if a year is a leap year
 */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

/**
 * Get the number of days in a month
 */
export function getDaysInMonth(year: number, month: number): number {
  const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

  if (month === 2 && isLeapYear(year)) {
    return 29
  }

  return daysInMonth[month - 1] ?? 30
}

/**
 * Validate date components
 */
export function validateDateComponents(components: DateComponents): boolean {
  const { year, month, day, hour, minute, second, millisecond } = components

  if (!Number.isInteger(year)) {
    return false
  }
  if (month < 1 || month > 12) {
    return false
  }
  if (day < 1 || day > getDaysInMonth(year, month)) {
    return false
  }
  if (hour < 0 || hour > 23) {
    return false
  }
  if (minute < 0 || minute > 59) {
    return false
  }
  if (second < 0 || second > 59) {
    return false
  }
  if (millisecond < 0 || millisecond > 999) {
    return false
  }

  return true
}
