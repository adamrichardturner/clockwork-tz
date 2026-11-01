/**
 * Dependency-free date formatting in any timezone.
 *
 * Patterns use a date-fns compatible subset of Unicode tokens. Letters must be
 * quoted ('like this') to appear literally; '' produces a single quote.
 */

import type { DateInput, TzEngine } from './data/types.js'
import { TimezoneError } from './data/types.js'
import { getEngine } from './core/state.js'
import { assertValidZone, zoneInfoAt } from './core/zone.js'
import { normalizeToDate } from './utils/iso.js'

/**
 * Default format pattern
 */
export const DEFAULT_FORMAT_PATTERN = 'yyyy-MM-dd HH:mm:ss zzz'

/**
 * Pattern used for ClockworkTime.local
 */
export const LOCAL_TIME_PATTERN = 'yyyy-MM-dd HH:mm:ss.SSS'

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
  dateTimeMs: LOCAL_TIME_PATTERN,

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

type Token = { literal: string } | { letter: string; count: number }

const SUPPORTED: Record<string, readonly number[]> = {
  y: [1, 2, 3, 4, 5, 6],
  M: [1, 2, 3, 4],
  d: [1, 2],
  E: [1, 2, 3, 4],
  H: [1, 2],
  h: [1, 2],
  m: [1, 2],
  s: [1, 2],
  S: [1, 2, 3],
  a: [1, 2, 3],
  z: [1, 2, 3, 4],
  x: [1, 2, 3, 4, 5],
  X: [1, 2, 3, 4, 5],
  O: [1, 4],
}

const tokenCache = new Map<string, Token[]>()

function tokenize(pattern: string): Token[] {
  const cached = tokenCache.get(pattern)
  if (cached) {
    return cached
  }

  const tokens: Token[] = []
  let i = 0
  while (i < pattern.length) {
    const ch = pattern[i]!
    if (ch === "'") {
      // '' is a literal quote; otherwise read until the closing quote,
      // where '' inside the quoted text is also a literal quote
      if (pattern[i + 1] === "'") {
        tokens.push({ literal: "'" })
        i += 2
        continue
      }
      let text = ''
      let j = i + 1
      for (;;) {
        if (j >= pattern.length) {
          throw new TimezoneError(`Unterminated quote in format pattern: ${pattern}`)
        }
        if (pattern[j] === "'") {
          if (pattern[j + 1] === "'") {
            text += "'"
            j += 2
            continue
          }
          break
        }
        text += pattern[j]
        j++
      }
      tokens.push({ literal: text })
      i = j + 1
      continue
    }
    if (/[A-Za-z]/.test(ch)) {
      let count = 1
      while (pattern[i + count] === ch) {
        count++
      }
      const allowed = SUPPORTED[ch]
      if (!allowed?.includes(count)) {
        throw new TimezoneError(`Unsupported format token "${ch.repeat(count)}" in ${pattern}`)
      }
      tokens.push({ letter: ch, count })
      i += count
      continue
    }
    tokens.push({ literal: ch })
    i++
  }

  if (tokenCache.size > 256) {
    tokenCache.clear()
  }
  tokenCache.set(pattern, tokens)
  return tokens
}

const nameFormatters = new Map<string, Intl.DateTimeFormat>()

function nameFormatter(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`
  let formatter = nameFormatters.get(key)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' })
    nameFormatters.set(key, formatter)
  }
  return formatter
}

function namePart(
  wall: Date,
  locale: string,
  options: Intl.DateTimeFormatOptions,
  type: Intl.DateTimeFormatPartTypes
): string {
  const part = nameFormatter(locale, options)
    .formatToParts(wall)
    .find(p => p.type === type)
  return part?.value ?? ''
}

function longZoneName(epochMs: number, zone: string, locale: string, fallback: string): string {
  try {
    const part = new Intl.DateTimeFormat(locale, { timeZone: zone, timeZoneName: 'long' })
      .formatToParts(epochMs)
      .find(p => p.type === 'timeZoneName')
    return part?.value ?? fallback
  } catch {
    return fallback
  }
}

function pad(n: number, length: number): string {
  const sign = n < 0 ? '-' : ''
  return sign + String(Math.abs(n)).padStart(length, '0')
}

function formatOffsetToken(offsetSeconds: number, letter: 'x' | 'X', count: number): string {
  if (letter === 'X' && offsetSeconds === 0) {
    return 'Z'
  }
  const sign = offsetSeconds < 0 ? '-' : '+'
  const abs = Math.abs(offsetSeconds)
  const hh = pad(Math.floor(abs / 3600), 2)
  const mm = pad(Math.floor((abs % 3600) / 60), 2)
  const ss = pad(abs % 60, 2)
  const hasSeconds = abs % 60 !== 0

  switch (count) {
    case 1: {
      return `${sign}${hh}${mm === '00' ? '' : mm}`
    }
    case 2: {
      return `${sign}${hh}${mm}`
    }
    case 3: {
      return `${sign}${hh}:${mm}`
    }
    case 4: {
      return `${sign}${hh}${mm}${hasSeconds ? ss : ''}`
    }
    default: {
      return `${sign}${hh}:${mm}${hasSeconds ? `:${ss}` : ''}`
    }
  }
}

function formatGmtToken(offsetSeconds: number, count: number): string {
  if (offsetSeconds === 0) {
    return 'GMT'
  }
  const sign = offsetSeconds < 0 ? '-' : '+'
  const abs = Math.abs(offsetSeconds)
  const hours = Math.floor(abs / 3600)
  const minutes = Math.floor((abs % 3600) / 60)
  if (count === 4) {
    return `GMT${sign}${pad(hours, 2)}:${pad(minutes, 2)}`
  }
  return `GMT${sign}${hours}${minutes ? `:${pad(minutes, 2)}` : ''}`
}

/**
 * Format an instant in a zone with an explicit engine. Used internally by
 * the API; most callers want `format`.
 */
export function formatInstant(
  epochMs: number,
  zone: string,
  pattern: string,
  engine: TzEngine,
  locale = 'en'
): string {
  const tokens = tokenize(pattern)
  const info = zoneInfoAt(epochMs, zone, engine)
  const wall = new Date(epochMs + info.offsetSeconds * 1000)

  let out = ''
  for (const token of tokens) {
    if ('literal' in token) {
      out += token.literal
      continue
    }

    const { letter, count } = token
    switch (letter) {
      case 'y': {
        const year = wall.getUTCFullYear()
        out += count === 2 ? pad(((year % 100) + 100) % 100, 2) : pad(year, count)
        break
      }
      case 'M': {
        const month = wall.getUTCMonth() + 1
        if (count <= 2) {
          out += pad(month, count)
        } else {
          const style = count === 3 ? 'short' : 'long'
          out += namePart(wall, locale, { month: style, day: 'numeric' }, 'month')
        }
        break
      }
      case 'd': {
        out += pad(wall.getUTCDate(), count)
        break
      }
      case 'E': {
        const style = count === 4 ? 'long' : 'short'
        out += namePart(wall, locale, { weekday: style }, 'weekday')
        break
      }
      case 'H': {
        out += pad(wall.getUTCHours(), count)
        break
      }
      case 'h': {
        out += pad(wall.getUTCHours() % 12 || 12, count)
        break
      }
      case 'm': {
        out += pad(wall.getUTCMinutes(), count)
        break
      }
      case 's': {
        out += pad(wall.getUTCSeconds(), count)
        break
      }
      case 'S': {
        out += pad(wall.getUTCMilliseconds(), 3).slice(0, count)
        break
      }
      case 'a': {
        const period = namePart(wall, locale, { hour: 'numeric', hour12: true }, 'dayPeriod')
        out += period || (wall.getUTCHours() < 12 ? 'AM' : 'PM')
        break
      }
      case 'z': {
        out +=
          count === 4 ? longZoneName(epochMs, zone, locale, info.abbreviation) : info.abbreviation
        break
      }
      case 'x':
      case 'X': {
        out += formatOffsetToken(info.offsetSeconds, letter, count)
        break
      }
      case 'O': {
        out += formatGmtToken(info.offsetSeconds, count)
        break
      }
    }
  }
  return out
}

/**
 * Format a date/time in a specific timezone
 *
 * @param input - Date, epoch milliseconds, or ISO string with offset
 * @param zone - IANA timezone identifier or fixed offset like "+05:30"
 * @param pattern - Format pattern (defaults to DEFAULT_FORMAT_PATTERN)
 * @param locale - Locale for month, weekday and day period names (default "en")
 * @returns Formatted date string
 * @throws TimezoneError if timezone is invalid or the pattern is unsupported
 */
export function format(
  input: DateInput,
  zone: string,
  pattern: string = DEFAULT_FORMAT_PATTERN,
  locale = 'en'
): string {
  const engine = getEngine()
  assertValidZone(zone, engine)
  const date = normalizeToDate(input)
  return formatInstant(date.getTime(), zone, pattern, engine, locale)
}

/**
 * Format a date using a predefined pattern
 */
export function formatWithPattern(
  input: DateInput,
  zone: string,
  patternName: keyof typeof FORMAT_PATTERNS
): string {
  const pattern = FORMAT_PATTERNS[patternName]
  if (!pattern) {
    throw new TimezoneError(`Unknown format pattern: ${patternName}`)
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
  input: DateInput,
  zone: string,
  useCase: 'display' | 'log' | 'filename' | 'api' | 'human'
): string {
  switch (useCase) {
    case 'log':
    case 'api': {
      return format(input, zone, FORMAT_PATTERNS.iso8601)
    }
    case 'filename': {
      // Safe for filenames (no colons or spaces)
      return format(input, zone, 'yyyy-MM-dd_HH-mm-ss')
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
  start: DateInput,
  end: DateInput,
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

  if (sameDay) {
    const startDay = format(startDate, zone, 'yyyy-MM-dd')
    const endDay = format(endDate, zone, 'yyyy-MM-dd')

    if (startDay === endDay) {
      const startTime = format(startDate, zone, 'HH:mm')
      const endTime = format(endDate, zone, 'HH:mm zzz')
      return `${startDay} ${startTime}${separator}${endTime}`
    }
  }

  return `${format(startDate, zone, pattern)}${separator}${format(endDate, zone, pattern)}`
}

/**
 * Format duration between two dates
 */
export function formatDuration(
  start: DateInput,
  end: DateInput,
  options: {
    units?: Array<'days' | 'hours' | 'minutes' | 'seconds'>
    precision?: number
  } = {}
): string {
  const { units = ['days', 'hours', 'minutes'], precision = 2 } = options

  const diffMs = Math.abs(normalizeToDate(end).getTime() - normalizeToDate(start).getTime())

  const unitMs = { days: 86_400_000, hours: 3_600_000, minutes: 60_000, seconds: 1000 } as const
  const parts: string[] = []
  let remaining = diffMs

  for (const unit of ['days', 'hours', 'minutes', 'seconds'] as const) {
    if (!units.includes(unit)) {
      continue
    }
    const value = Math.floor(remaining / unitMs[unit])
    remaining -= value * unitMs[unit]
    if (value > 0 || parts.length > 0) {
      parts.push(`${value} ${unit.slice(0, -1)}${value === 1 ? '' : 's'}`)
    }
  }

  if (parts.length === 0) {
    const smallest = units[units.length - 1] ?? 'seconds'
    parts.push(`0 ${smallest}`)
  }

  return parts.slice(0, precision).join(', ')
}

/**
 * Format relative time (e.g., "2 hours ago", "in 3 days"). Beyond a week the
 * target date is shown in `zone`.
 */
export function formatRelative(
  date: DateInput,
  zone: string,
  relativeTo: DateInput = new Date()
): string {
  const targetDate = normalizeToDate(date)
  const diffMs = targetDate.getTime() - normalizeToDate(relativeTo).getTime()
  const isPast = diffMs < 0

  const seconds = Math.floor(Math.abs(diffMs) / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  let value: number
  let unit: string
  if (seconds < 60) {
    value = seconds
    unit = 'second'
  } else if (minutes < 60) {
    value = minutes
    unit = 'minute'
  } else if (hours < 24) {
    value = hours
    unit = 'hour'
  } else if (days < 7) {
    value = days
    unit = 'day'
  } else {
    return format(targetDate, zone, FORMAT_PATTERNS.dateOnly)
  }

  const text = `${value} ${unit}${value === 1 ? '' : 's'}`
  return isPast ? `${text} ago` : `in ${text}`
}

/**
 * Format timezone offset in minutes as ±HH:mm
 */
export function formatOffset(offsetMinutes: number): string {
  return formatOffsetToken(Math.round(offsetMinutes * 60), 'x', 3)
}

/**
 * Validate a format pattern
 */
export function isValidFormatPattern(pattern: string): boolean {
  try {
    tokenize(pattern)
    return true
  } catch {
    return false
  }
}
