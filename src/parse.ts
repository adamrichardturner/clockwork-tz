/**
 * Date parsing utilities with strict ISO validation
 */

import type { DateInput } from './data/types.js'
import {
  parseISODate,
  parseLocalISOString,
  componentsToWallMs,
  isValidISOString,
  isValidLocalISOString,
  type DateComponents,
} from './utils/iso.js'
import { getEngine } from './core/state.js'
import { assertValidZone } from './core/zone.js'
import { wallMsToInstant } from './core/localTime.js'

/**
 * Resolve a local ISO string to a Date, reading it in `zone` (default UTC)
 */
function localToDate(input: string, zone: string | undefined): Date {
  const wallMs = componentsToWallMs(parseLocalISOString(input))
  if (zone === undefined || zone === 'UTC') {
    return new Date(wallMs)
  }
  const engine = getEngine()
  assertValidZone(zone, engine)
  return new Date(wallMsToInstant(wallMs, zone, engine, 'compatible', input))
}

/**
 * Parse result with metadata
 */
export interface ParseResult {
  /** Parsed date */
  date: Date
  /** Whether the input had timezone information */
  hasTimezone: boolean
  /** Original input string */
  original: string
  /** Whether the date is valid */
  isValid: boolean
}

/**
 * Parsing options
 */
export interface ParseOptions {
  /** Strict mode - reject non-ISO formats */
  strict?: boolean
  /** Zone used to read times without an offset (default: UTC) */
  defaultTimezone?: string
  /** Allow flexible separators (space instead of T) */
  allowFlexible?: boolean
}

/**
 * Parse a date string with validation and metadata
 *
 * @param input - Date string to parse
 * @param options - Parsing options
 * @returns Parse result with date and metadata
 * @throws Error for invalid input in strict mode
 */
export function parse(input: string, options: ParseOptions = {}): ParseResult {
  const { strict = true, allowFlexible = false } = options

  if (typeof input !== 'string' || input.trim() === '') {
    const error = new Error('Input must be a non-empty string')
    if (strict) {
      throw error
    }

    return {
      date: new Date(NaN),
      hasTimezone: false,
      original: input,
      isValid: false,
    }
  }

  const trimmedInput = input.trim()

  // Try ISO with timezone first
  if (isValidISOString(trimmedInput)) {
    try {
      const date = parseISODate(trimmedInput)
      return {
        date,
        hasTimezone: true,
        original: input,
        isValid: !isNaN(date.getTime()),
      }
    } catch (error) {
      if (strict) {
        throw new Error(`Failed to parse ISO date: ${input}`, { cause: error })
      }
    }
  }

  // Try local ISO format
  if (isValidLocalISOString(trimmedInput)) {
    try {
      const date = localToDate(trimmedInput, options.defaultTimezone)
      return {
        date,
        hasTimezone: false,
        original: input,
        isValid: !isNaN(date.getTime()),
      }
    } catch (error) {
      if (strict) {
        throw new Error(`Failed to parse local ISO date: ${input}`, { cause: error })
      }
    }
  }

  // Try flexible format if allowed (space instead of T)
  if (allowFlexible && trimmedInput.includes(' ')) {
    const flexibleInput = trimmedInput.replace(' ', 'T')
    if (isValidLocalISOString(flexibleInput)) {
      try {
        const date = localToDate(flexibleInput, options.defaultTimezone)
        return {
          date,
          hasTimezone: false,
          original: input,
          isValid: !isNaN(date.getTime()),
        }
      } catch (error) {
        if (strict) {
          throw new Error(`Failed to parse flexible date: ${input}`, { cause: error })
        }
      }
    }
  }

  // Date-only strings are midnight wall time in the default timezone
  if (
    /^-?\d{4,6}-\d{2}-\d{2}$/.test(trimmedInput) &&
    isValidLocalISOString(`${trimmedInput}T00:00`)
  ) {
    const date = localToDate(`${trimmedInput}T00:00`, options.defaultTimezone)
    return { date, hasTimezone: false, original: input, isValid: !isNaN(date.getTime()) }
  }

  // In non-strict mode, accept other formats the platform parses, but only
  // when they carry their own offset (otherwise the result depends on the host)
  if (!strict) {
    const hasTimezone = /(?:[+-]\d{2}:?\d{2}|Z|\b(?:GMT|UTC))$/i.test(trimmedInput)
    const date = hasTimezone ? new Date(trimmedInput) : new Date(NaN)
    return {
      date,
      hasTimezone,
      original: input,
      isValid: !isNaN(date.getTime()),
    }
  }

  throw new Error(`Invalid date format: ${input}. Expected ISO 8601 format.`)
}

/**
 * Parse a date string and return only the Date object
 *
 * @param input - Date string to parse
 * @param options - Parsing options
 * @returns Parsed Date object
 * @throws Error for invalid input
 */
export function parseDate(input: string, options: ParseOptions = {}): Date {
  const result = parse(input, options)

  if (!result.isValid) {
    throw new Error(`Invalid date: ${input}`)
  }

  return result.date
}

/**
 * Parse date components from a string
 *
 * @param input - Local date string (without timezone)
 * @returns Date components
 * @throws Error for invalid input
 */
export function parseComponents(input: string): DateComponents {
  if (!isValidLocalISOString(input)) {
    throw new Error(`Invalid local ISO format: ${input}`)
  }

  return parseLocalISOString(input)
}

/**
 * Safely parse a date string without throwing
 *
 * @param input - Date string to parse
 * @param options - Parsing options
 * @returns Parse result or null if parsing failed
 */
export function safeParse(input: string, options: ParseOptions = {}): ParseResult | null {
  try {
    return parse(input, { ...options, strict: false })
  } catch {
    return null
  }
}

/**
 * Check if a string can be parsed as a date
 *
 * @param input - String to test
 * @param options - Parsing options
 * @returns True if parseable
 */
export function isParseable(input: string, options: ParseOptions = {}): boolean {
  const result = safeParse(input, options)
  return result?.isValid ?? false
}

/**
 * Parse multiple date formats and return the first successful one
 *
 * @param input - Date string to parse
 * @param formats - Array of format options to try
 * @returns First successful parse result
 * @throws Error if none of the formats work
 */
export function parseAny(
  input: string,
  formats: ParseOptions[] = [
    { strict: true },
    { strict: true, allowFlexible: true },
    { strict: false },
  ]
): ParseResult {
  for (const format of formats) {
    const result = safeParse(input, format)
    if (result?.isValid) {
      return result
    }
  }

  throw new Error(`Unable to parse date with any format: ${input}`)
}

/**
 * Parse a date range from a string
 *
 * @param input - Range string (e.g., "2024-01-01 to 2024-01-31")
 * @param options - Parsing options
 * @returns Object with start and end dates
 */
export function parseRange(
  input: string,
  options: ParseOptions & {
    separator?: string | RegExp
  } = {}
): { start: Date; end: Date } {
  const { separator = /\s+(?:to|–|—|-)\s+/i, ...parseOptions } = options

  const parts = input.split(separator)
  if (parts.length !== 2) {
    throw new Error(`Invalid date range format: ${input}`)
  }

  const start = parseDate(parts[0]!.trim(), parseOptions)
  const end = parseDate(parts[1]!.trim(), parseOptions)

  if (start > end) {
    throw new Error(`Invalid date range: start date is after end date`)
  }

  return { start, end }
}

/**
 * Parse a time-only string (HH:mm:ss format)
 *
 * @param input - Time string
 * @returns Object with hour, minute, second
 */
export function parseTime(input: string): {
  hour: number
  minute: number
  second: number
  millisecond: number
} {
  const timePattern = /^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{3}))?)?$/
  const match = timePattern.exec(input.trim())

  if (!match) {
    throw new Error(`Invalid time format: ${input}`)
  }

  const [, hourStr, minuteStr, secondStr = '0', msStr = '0'] = match

  const hour = parseInt(hourStr!, 10)
  const minute = parseInt(minuteStr!, 10)
  const second = parseInt(secondStr, 10)
  const millisecond = parseInt(msStr.padEnd(3, '0'), 10)

  if (hour < 0 || hour > 23) {
    throw new Error(`Invalid hour: ${hour}`)
  }
  if (minute < 0 || minute > 59) {
    throw new Error(`Invalid minute: ${minute}`)
  }
  if (second < 0 || second > 59) {
    throw new Error(`Invalid second: ${second}`)
  }

  return { hour, minute, second, millisecond }
}

/**
 * Parse timezone offset from a string
 *
 * @param input - Offset string (e.g., "+05:30", "-08:00", "Z")
 * @returns Offset in minutes
 */
export function parseOffset(input: string): number {
  const trimmed = input.trim()

  if (trimmed === 'Z' || trimmed.toLowerCase() === 'utc') {
    return 0
  }

  const offsetPattern = /^([+-])(\d{1,2}):?(\d{2})$/
  const match = offsetPattern.exec(trimmed)

  if (!match) {
    throw new Error(`Invalid timezone offset format: ${input}`)
  }

  const [, sign, hourStr, minuteStr] = match
  const hours = parseInt(hourStr!, 10)
  const minutes = parseInt(minuteStr!, 10)

  if (hours > 18 || minutes > 59) {
    throw new Error(`Invalid timezone offset: ${input}`)
  }

  const totalMinutes = hours * 60 + minutes
  return sign === '+' ? totalMinutes : -totalMinutes
}

/**
 * Normalize various date inputs to a consistent Date object
 *
 * @param input - Date, string, or number input
 * @returns Normalized Date object
 */
export function normalize(input: DateInput): Date {
  if (input instanceof Date) {
    return input
  }

  if (typeof input === 'number') {
    return new Date(input)
  }

  if (typeof input === 'string') {
    return parseDate(input, { strict: false })
  }

  throw new Error(`Cannot normalize input of type ${typeof input}`)
}
