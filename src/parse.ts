/**
 * Date parsing utilities with strict ISO validation
 */

import type { DateInput } from './data/types.js'
import { TimezoneError } from './data/types.js'
import {
  parseISODate,
  parseOffsetSeconds,
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
  const { strict = true } = options
  const invalid = (): ParseResult => ({
    date: new Date(NaN),
    hasTimezone: false,
    original: input,
    isValid: false,
  })

  if (typeof input !== 'string' || input.trim() === '') {
    if (strict) {
      throw new TimezoneError('Input must be a non-empty string')
    }
    return invalid()
  }

  const trimmed = input.trim()

  // ISO 8601 with an offset or Z ("T" or space between date and time)
  if (isValidISOString(trimmed)) {
    return { date: parseISODate(trimmed), hasTimezone: true, original: input, isValid: true }
  }

  // Wall time without an offset, or a date alone (midnight), read in the default zone
  const local = /^-?\d{4,6}-\d{2}-\d{2}$/.test(trimmed) ? `${trimmed}T00:00` : trimmed
  if (isValidLocalISOString(local)) {
    try {
      const date = localToDate(local, options.defaultTimezone)
      return { date, hasTimezone: false, original: input, isValid: true }
    } catch (error) {
      if (strict) {
        throw new TimezoneError(`Failed to parse "${input}"`, { cause: error })
      }
      return invalid()
    }
  }

  // In non-strict mode, accept other formats the platform parses, but only
  // when they carry their own offset (otherwise the result depends on the host)
  if (!strict) {
    const hasTimezone = /(?:[+-]\d{2}:?\d{2}|Z|\b(?:GMT|UTC))$/i.test(trimmed)
    const date = hasTimezone ? new Date(trimmed) : new Date(NaN)
    return { date, hasTimezone, original: input, isValid: !isNaN(date.getTime()) }
  }

  throw new TimezoneError(`Invalid date format: ${input}. Expected ISO 8601.`)
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
    throw new TimezoneError(`Invalid date: ${input}`)
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
    throw new TimezoneError(`Invalid local ISO format: ${input}`)
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
  formats: ParseOptions[] = [{ strict: true }, { strict: false }]
): ParseResult {
  for (const format of formats) {
    const result = safeParse(input, format)
    if (result?.isValid) {
      return result
    }
  }

  throw new TimezoneError(`Unable to parse date with any format: ${input}`)
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
    throw new TimezoneError(`Invalid date range format: ${input}`)
  }

  const start = parseDate(parts[0]!.trim(), parseOptions)
  const end = parseDate(parts[1]!.trim(), parseOptions)

  if (start > end) {
    throw new TimezoneError(`Invalid date range: start date is after end date`)
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
    throw new TimezoneError(`Invalid time format: ${input}`)
  }

  const [, hourStr, minuteStr, secondStr = '0', msStr = '0'] = match

  const hour = parseInt(hourStr!, 10)
  const minute = parseInt(minuteStr!, 10)
  const second = parseInt(secondStr, 10)
  const millisecond = parseInt(msStr.padEnd(3, '0'), 10)

  if (hour < 0 || hour > 23) {
    throw new TimezoneError(`Invalid hour: ${hour}`)
  }
  if (minute < 0 || minute > 59) {
    throw new TimezoneError(`Invalid minute: ${minute}`)
  }
  if (second < 0 || second > 59) {
    throw new TimezoneError(`Invalid second: ${second}`)
  }

  return { hour, minute, second, millisecond }
}

/**
 * Parse timezone offset from a string
 *
 * @param input - Offset string ("+05:30", "-0800", "+05", "+00:19:32", "Z" or "UTC")
 * @returns Offset in minutes (fractional when the offset has seconds)
 */
export function parseOffset(input: string): number {
  const trimmed = input.trim()
  if (trimmed.toUpperCase() === 'UTC') {
    return 0
  }
  // Accept single-digit hours ("+5:30") as well as the ISO forms
  return parseOffsetSeconds(trimmed.replace(/^([+-])(\d)(?!\d)/, '$10$2')) / 60
}

/**
 * Normalize various date inputs to a consistent Date object
 *
 * @param input - Date, string, or number input
 * @returns Normalized Date object
 */
export function normalize(input: DateInput): Date {
  if (input instanceof Date || typeof input === 'number') {
    const date = new Date(input instanceof Date ? input.getTime() : input)
    if (isNaN(date.getTime())) {
      throw new TimezoneError(`Invalid date: ${String(input)}`)
    }
    return input instanceof Date ? input : date
  }

  if (typeof input === 'string') {
    return parseDate(input, { strict: false })
  }

  throw new TimezoneError(`Cannot normalize input of type ${typeof input}`)
}
