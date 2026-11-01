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
 * The result of {@link parse}: the instant, plus whether the input carried its
 * own offset.
 */
export interface ParseResult {
  /** The instant; an invalid `Date` when `isValid` is false */
  date: Date
  /** Whether the input carried its own offset or `Z` (otherwise it was read in `defaultTimezone`) */
  hasTimezone: boolean
  /** The input as given */
  original: string
  /** Whether parsing produced a real date (always true in strict mode, which throws instead) */
  isValid: boolean
}

/**
 * Options for {@link parse} and the other parsing functions.
 */
export interface ParseOptions {
  /** Throw on anything that isn't ISO 8601 (default `true`). When `false`, return `isValid: false` instead, and accept other platform-parseable strings that carry an offset. */
  strict?: boolean
  /** Zone used to read wall times and plain dates (default `'UTC'`); never the host's zone */
  defaultTimezone?: string
}

/**
 * Parse an ISO 8601 date-time strictly, never using the host's timezone.
 *
 * Accepted forms:
 * - With an offset or `Z` (an instant): `2024-07-15T14:00:00Z`, `2024-07-15 14:00+05:45`,
 *   `…+0545`, `…-03`, `…+00:19:32`, with 1–9 fractional digits
 * - Without an offset (a wall time), read in `defaultTimezone` (default `'UTC'`):
 *   `2024-07-15T14:00`, `2024-07-15 14:00:00.123`
 * - A date alone, as midnight in `defaultTimezone`: `2024-07-15`
 *
 * With `strict: false`, other formats the platform can parse are accepted only
 * when they carry their own offset (`'Mon, 15 Jul 2024 14:00:00 GMT'`), and
 * failures return `isValid: false` instead of throwing.
 *
 * @param input - The string to parse.
 * @param options - `strict` (default `true`) and `defaultTimezone`.
 * @throws {@link TimezoneError} in strict mode for unparseable or impossible
 *   dates (such as 30 February) or an invalid `defaultTimezone`.
 *
 * @example
 * ```ts
 * parse('2024-07-15T14:00:00+05:45').date.toISOString() // '2024-07-15T08:15:00.000Z'
 * parse('2024-07-15T14:00:00', { defaultTimezone: 'Asia/Kathmandu' }).hasTimezone // false
 * ```
 *
 * @see {@link https://clockworktz.dev/docs/parsing | Parsing}
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
 * Like {@link parse}, but returns just the `Date`.
 *
 * @throws {@link TimezoneError} if the input can't be parsed, even with `strict: false`.
 *
 * @example
 * ```ts
 * parseDate('2024-07-15', { defaultTimezone: 'America/New_York' }).toISOString() // '2024-07-15T04:00:00.000Z'
 * ```
 */
export function parseDate(input: string, options: ParseOptions = {}): Date {
  const result = parse(input, options)

  if (!result.isValid) {
    throw new TimezoneError(`Invalid date: ${input}`)
  }

  return result.date
}

/**
 * Split a wall-time string (no offset) into its fields, without reading it in
 * any zone. `month` is 1–12.
 *
 * @throws {@link TimezoneError} for an invalid or impossible wall time.
 *
 * @example
 * ```ts
 * parseComponents('2024-07-15T14:30:05.250') // { year: 2024, month: 7, day: 15, hour: 14, minute: 30, second: 5, millisecond: 250 }
 * ```
 */
export function parseComponents(input: string): DateComponents {
  if (!isValidLocalISOString(input)) {
    throw new TimezoneError(`Invalid local ISO format: ${input}`)
  }

  return parseLocalISOString(input)
}

/**
 * Like {@link parse} with `strict: false`: never throws, and reports failures
 * with `isValid: false`.
 *
 * @returns The parse result, or `null` only for unexpected errors.
 *
 * @example
 * ```ts
 * safeParse('not a date')?.isValid // false
 * ```
 */
export function safeParse(input: string, options: ParseOptions = {}): ParseResult | null {
  try {
    return parse(input, { ...options, strict: false })
  } catch {
    return null
  }
}

/**
 * Whether {@link safeParse} can parse a string into a valid date.
 *
 * @example
 * ```ts
 * isParseable('2024-07-15T14:00:00Z') // true
 * isParseable('July 15') // false
 * ```
 */
export function isParseable(input: string, options: ParseOptions = {}): boolean {
  const result = safeParse(input, options)
  return result?.isValid ?? false
}

/**
 * Try several {@link ParseOptions} in turn and return the first valid result.
 *
 * @param formats - Options to try (default: strict, then non-strict).
 * @throws {@link TimezoneError} if none of them parses the input.
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
 * Parse a range written as `<start> to <end>` (or separated by `–`, `—` or `-`
 * with spaces around it).
 *
 * @param options - Parse options, plus `separator` (string or RegExp).
 * @returns The start and end as `Date`s.
 * @throws {@link TimezoneError} if either end is invalid, or the start is after the end.
 *
 * @example
 * ```ts
 * parseRange('2024-01-01T00:00:00Z to 2024-01-31T00:00:00Z').end.toISOString() // '2024-01-31T00:00:00.000Z'
 * ```
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
 * Parse a time of day: `H:mm`, `HH:mm:ss` or `HH:mm:ss.SSS`.
 *
 * @throws {@link TimezoneError} for an invalid format or out-of-range field.
 *
 * @example
 * ```ts
 * parseTime('9:05') // { hour: 9, minute: 5, second: 0, millisecond: 0 }
 * ```
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
 * Parse a UTC offset into minutes: `±HH:mm`, `±HHmm`, `±HH`, `±H:mm`,
 * `±HH:mm:ss`, `Z` or `UTC`.
 *
 * @returns The offset in minutes; fractional when it has seconds.
 * @throws {@link TimezoneError} for an invalid offset.
 *
 * @example
 * ```ts
 * parseOffset('+05:45') // 345
 * parseOffset('-0930') // -570
 * ```
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
 * Turn any accepted input into a `Date`: a `Date` is returned as-is, a number is
 * epoch milliseconds, and a string goes through {@link parseDate} with
 * `strict: false`.
 *
 * @throws {@link TimezoneError} for an invalid date or number, or an unparseable string.
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
