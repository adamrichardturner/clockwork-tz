/**
 * ISO 8601 date parsing and validation utilities
 */

/**
 * Strict ISO 8601 date pattern with optional timezone
 * Matches: YYYY-MM-DDTHH:mm:ss.sssZ or YYYY-MM-DDTHH:mm:ss.sss±HH:mm
 */
const ISO_DATE_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?(?:Z|([+-])(\d{2}):(\d{2}))$/

/**
 * Local ISO pattern without timezone info
 * Matches: YYYY-MM-DDTHH:mm:ss.sss or YYYY-MM-DD HH:mm:ss.sss
 */
const LOCAL_ISO_PATTERN = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?$/

/**
 * Date component structure
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

/**
 * Validate and parse an ISO 8601 date string
 */
export function parseISODate(isoString: string): Date {
  if (!isValidISOString(isoString)) {
    throw new Error(`Invalid ISO date string: ${isoString}`)
  }

  const date = new Date(isoString)

  if (isNaN(date.getTime())) {
    throw new Error(`Unable to parse ISO date string: ${isoString}`)
  }

  return date
}

/**
 * Validate an ISO 8601 date string format
 */
export function isValidISOString(isoString: string): boolean {
  if (typeof isoString !== 'string') {
    return false
  }

  return ISO_DATE_PATTERN.test(isoString)
}

/**
 * Validate a local ISO string format (without timezone)
 */
export function isValidLocalISOString(localString: string): boolean {
  if (typeof localString !== 'string') {
    return false
  }

  return LOCAL_ISO_PATTERN.test(localString)
}

/**
 * Parse a local ISO string into date components
 */
export function parseLocalISOString(localString: string): DateComponents {
  if (!isValidLocalISOString(localString)) {
    throw new Error(`Invalid local ISO string: ${localString}`)
  }

  const match = LOCAL_ISO_PATTERN.exec(localString)
  if (!match) {
    throw new Error(`Failed to parse local ISO string: ${localString}`)
  }

  const [, yearStr, monthStr, dayStr, hourStr, minuteStr, secondStr, msStr] = match

  return {
    year: parseInt(yearStr!, 10),
    month: parseInt(monthStr!, 10),
    day: parseInt(dayStr!, 10),
    hour: parseInt(hourStr!, 10),
    minute: parseInt(minuteStr!, 10),
    second: parseInt(secondStr!, 10),
    millisecond: msStr ? parseInt(msStr, 10) : 0,
  }
}

/**
 * Convert date components to a Date object (assumes local timezone)
 */
export function componentsToDate(components: DateComponents): Date {
  return new Date(
    components.year,
    components.month - 1, // JS months are 0-based
    components.day,
    components.hour,
    components.minute,
    components.second,
    components.millisecond
  )
}

/**
 * Format a Date as ISO 8601 UTC string
 */
export function formatAsUTC(date: Date): string {
  return date.toISOString()
}

/**
 * Format a Date as local ISO string (without timezone info)
 */
export function formatAsLocalISO(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  const second = String(date.getSeconds()).padStart(2, '0')
  const ms = String(date.getMilliseconds()).padStart(3, '0')

  return `${year}-${month}-${day}T${hour}:${minute}:${second}.${ms}`
}

/**
 * Normalize input to a Date object
 */
export function normalizeToDate(input: string | Date): Date {
  if (input instanceof Date) {
    return input
  }

  if (typeof input === 'string') {
    return parseISODate(input)
  }

  throw new Error(`Invalid date input: ${input}`)
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

  // Basic range checks
  if (year < 1970 || year > 3000) return false
  if (month < 1 || month > 12) return false
  if (day < 1 || day > getDaysInMonth(year, month)) return false
  if (hour < 0 || hour > 23) return false
  if (minute < 0 || minute > 59) return false
  if (second < 0 || second > 59) return false
  if (millisecond < 0 || millisecond > 999) return false

  return true
}

/**
 * Add milliseconds to a Date
 */
export function addMilliseconds(date: Date, ms: number): Date {
  return new Date(date.getTime() + ms)
}

/**
 * Get the difference between two dates in milliseconds
 */
export function diffInMilliseconds(date1: Date, date2: Date): number {
  return date1.getTime() - date2.getTime()
}
