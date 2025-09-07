/**
 * Date formatting utilities using date-fns-tz
 */

import { formatInTimeZone } from 'date-fns-tz'
import { TimezoneError } from './data/types.js'
import { normalizeToDate } from './utils/iso.js'

/**
 * Default format pattern
 */
export const DEFAULT_FORMAT_PATTERN = 'yyyy-MM-dd HH:mm:ss zzz'

/**
 * Common format patterns
 */
export const FORMAT_PATTERNS = {
  /** ISO-like with timezone abbreviation: 2024-03-15 14:30:00 PST */
  default: DEFAULT_FORMAT_PATTERN,

  /** ISO date only: 2024-03-15 */
  dateOnly: 'yyyy-MM-dd',

  /** ISO time only: 14:30:00 */
  timeOnly: 'HH:mm:ss',

  /** ISO datetime without timezone: 2024-03-15 14:30:00 */
  dateTime: 'yyyy-MM-dd HH:mm:ss',

  /** ISO datetime with milliseconds: 2024-03-15 14:30:00.123 */
  dateTimeMs: 'yyyy-MM-dd HH:mm:ss.SSS',

  /** 12-hour format: 2024-03-15 2:30:00 PM PST */
  amPm: 'yyyy-MM-dd h:mm:ss a zzz',

  /** Human readable: March 15, 2024 at 2:30 PM PST */
  human: "MMMM d, yyyy 'at' h:mm a zzz",

  /** Short format: 3/15/24 2:30 PM */
  short: 'M/d/yy h:mm a',

  /** Long format with full timezone name */
  long: "EEEE, MMMM d, yyyy 'at' h:mm:ss a zzzz",

  /** RFC 2822 style: Fri, 15 Mar 2024 14:30:00 +0800 */
  rfc2822: 'EEE, d MMM yyyy HH:mm:ss xx',

  /** ISO 8601 with offset: 2024-03-15T14:30:00+08:00 */
  iso8601: "yyyy-MM-dd'T'HH:mm:ssxxx",
} as const

/**
 * Format a date/time in a specific timezone
 *
 * @param input - Date object or ISO string to format
 * @param zone - IANA timezone identifier
 * @param pattern - Format pattern (defaults to DEFAULT_FORMAT_PATTERN)
 * @returns Formatted date string
 * @throws TimezoneError if timezone is invalid or formatting fails
 */
export function format(
  input: string | Date,
  zone: string,
  pattern: string = DEFAULT_FORMAT_PATTERN
): string {
  try {
    const date = normalizeToDate(input)
    return formatInTimeZone(date, zone, pattern)
  } catch (error) {
    throw new TimezoneError(`Failed to format date in timezone "${zone}": ${error}`)
  }
}

/**
 * Format a date using a predefined pattern
 */
export function formatWithPattern(
  input: string | Date,
  zone: string,
  patternName: keyof typeof FORMAT_PATTERNS
): string {
  const pattern = FORMAT_PATTERNS[patternName]
  if (!pattern) {
    throw new Error(`Unknown format pattern: ${patternName}`)
  }

  return format(input, zone, pattern)
}

/**
 * Format current time in a timezone
 */
export function formatNow(zone: string, pattern?: string): string {
  return format(new Date(), zone, pattern)
}

/**
 * Format a date for different common use cases
 */
export function formatFor(
  input: string | Date,
  zone: string,
  useCase: 'display' | 'log' | 'filename' | 'api' | 'human'
): string {
  switch (useCase) {
    case 'display': {
      return format(input, zone, FORMAT_PATTERNS.default)
    }
    case 'log': {
      return format(input, zone, FORMAT_PATTERNS.iso8601)
    }
    case 'filename': {
      // Safe for filenames (no colons or spaces)
      return format(input, zone, 'yyyy-MM-dd_HH-mm-ss')
    }
    case 'api': {
      return format(input, zone, FORMAT_PATTERNS.iso8601)
    }
    case 'human': {
      return format(input, zone, FORMAT_PATTERNS.human)
    }
    default: {
      return format(input, zone, FORMAT_PATTERNS.default)
    }
  }
}

/**
 * Format a date range in a timezone
 */
export function formatRange(
  start: string | Date,
  end: string | Date,
  zone: string,
  options: {
    pattern?: string
    separator?: string
    sameDay?: boolean
  } = {}
): string {
  const { pattern = FORMAT_PATTERNS.default, separator = ' – ', sameDay = true } = options

  const startDate = normalizeToDate(start)
  const endDate = normalizeToDate(end)

  // Check if dates are on the same day
  if (sameDay) {
    const startDay = format(startDate, zone, 'yyyy-MM-dd')
    const endDay = format(endDate, zone, 'yyyy-MM-dd')

    if (startDay === endDay) {
      // Same day - show date once, then time range
      const dateStr = format(startDate, zone, 'yyyy-MM-dd')
      const startTime = format(startDate, zone, 'HH:mm')
      const endTime = format(endDate, zone, 'HH:mm zzz')
      return `${dateStr} ${startTime}${separator}${endTime}`
    }
  }

  // Different days or sameDay disabled
  const startStr = format(startDate, zone, pattern)
  const endStr = format(endDate, zone, pattern)
  return `${startStr}${separator}${endStr}`
}

/**
 * Format duration between two dates
 */
export function formatDuration(
  start: string | Date,
  end: string | Date,
  options: {
    units?: Array<'days' | 'hours' | 'minutes' | 'seconds'>
    precision?: number
  } = {}
): string {
  const { units = ['days', 'hours', 'minutes'], precision = 2 } = options

  const startDate = normalizeToDate(start)
  const endDate = normalizeToDate(end)
  const diffMs = Math.abs(endDate.getTime() - startDate.getTime())

  const parts: string[] = []
  let remaining = diffMs

  if (units.includes('days')) {
    const days = Math.floor(remaining / (24 * 60 * 60 * 1000))
    if (days > 0) {
      parts.push(`${days} day${days !== 1 ? 's' : ''}`)
      remaining %= 24 * 60 * 60 * 1000
    }
  }

  if (units.includes('hours')) {
    const hours = Math.floor(remaining / (60 * 60 * 1000))
    if (hours > 0 || parts.length > 0) {
      parts.push(`${hours} hour${hours !== 1 ? 's' : ''}`)
      remaining %= 60 * 60 * 1000
    }
  }

  if (units.includes('minutes')) {
    const minutes = Math.floor(remaining / (60 * 1000))
    if (minutes > 0 || parts.length > 0) {
      parts.push(`${minutes} minute${minutes !== 1 ? 's' : ''}`)
      remaining %= 60 * 1000
    }
  }

  if (units.includes('seconds')) {
    const seconds = Math.floor(remaining / 1000)
    if (seconds > 0 || parts.length === 0) {
      parts.push(`${seconds} second${seconds !== 1 ? 's' : ''}`)
    }
  }

  return parts.slice(0, precision).join(', ')
}

/**
 * Format relative time (e.g., "2 hours ago", "in 3 days")
 */
export function formatRelative(
  date: string | Date,
  relativeTo: string | Date = new Date(),
  zone: string
): string {
  const targetDate = normalizeToDate(date)
  const baseDate = normalizeToDate(relativeTo)
  const diffMs = targetDate.getTime() - baseDate.getTime()
  const isPast = diffMs < 0
  const absDiffMs = Math.abs(diffMs)

  // Convert to different units
  const seconds = Math.floor(absDiffMs / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  let timeStr: string
  let unit: string

  if (seconds < 60) {
    timeStr = seconds.toString()
    unit = seconds === 1 ? 'second' : 'seconds'
  } else if (minutes < 60) {
    timeStr = minutes.toString()
    unit = minutes === 1 ? 'minute' : 'minutes'
  } else if (hours < 24) {
    timeStr = hours.toString()
    unit = hours === 1 ? 'hour' : 'hours'
  } else if (days < 7) {
    timeStr = days.toString()
    unit = days === 1 ? 'day' : 'days'
  } else {
    // For longer periods, show the actual date
    return format(targetDate, zone, FORMAT_PATTERNS.dateOnly)
  }

  return isPast ? `${timeStr} ${unit} ago` : `in ${timeStr} ${unit}`
}

/**
 * Format timezone offset as a string
 */
export function formatOffset(offsetMinutes: number): string {
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const absMinutes = Math.abs(offsetMinutes)
  const hours = Math.floor(absMinutes / 60)
  const minutes = absMinutes % 60

  return `${sign}${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
}

/**
 * Validate a format pattern
 */
export function isValidFormatPattern(pattern: string): boolean {
  try {
    // Try to format a test date with the pattern
    format(new Date(), 'UTC', pattern)
    return true
  } catch {
    return false
  }
}
