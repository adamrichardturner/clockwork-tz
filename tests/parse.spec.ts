import { describe, expect, it } from 'vitest'
import {
  isParseable,
  isValidISOString,
  isValidLocalISOString,
  normalize,
  parse,
  parseAny,
  parseComponents,
  parseDate,
  parseOffset,
  parseRange,
  parseTime,
  safeParse,
  TimezoneError,
} from '../src/index.js'

describe('ISO parsing', () => {
  it.each([
    ['2024-07-15T14:00:00Z', '2024-07-15T14:00:00.000Z'],
    ['2024-07-15T14:00:00.5Z', '2024-07-15T14:00:00.500Z'],
    ['2024-07-15T14:00:00.123456789Z', '2024-07-15T14:00:00.123Z'],
    ['2024-07-15T19:45:00+05:45', '2024-07-15T14:00:00.000Z'],
    ['2024-07-15T19:45:00+0545', '2024-07-15T14:00:00.000Z'],
    ['2024-07-15T11:00:00-03', '2024-07-15T14:00:00.000Z'],
    ['2024-07-15 14:00Z', '2024-07-15T14:00:00.000Z'],
    ['1850-01-01T05:53:28+05:53:28', '1850-01-01T00:00:00.000Z'],
    ['0099-01-01T00:00:00Z', '0099-01-01T00:00:00.000Z'],
  ])('%s', (input, expected) => {
    expect(parseDate(input).toISOString()).toBe(expected)
    expect(isValidISOString(input)).toBe(true)
  })

  it('reads strings without an offset as UTC wall time by default', () => {
    const result = parse('2024-07-15T14:00:00')
    expect(result.hasTimezone).toBe(false)
    expect(result.date.toISOString()).toBe('2024-07-15T14:00:00.000Z')
  })

  it('reads strings without an offset in a default timezone', () => {
    expect(
      parseDate('2024-07-15T14:00:00', { defaultTimezone: 'Asia/Kathmandu' }).toISOString()
    ).toBe('2024-07-15T08:15:00.000Z')
    expect(parseDate('2024-07-15', { defaultTimezone: 'America/New_York' }).toISOString()).toBe(
      '2024-07-15T04:00:00.000Z'
    )
  })

  it('rejects impossible dates', () => {
    expect(isValidISOString('2023-02-29T00:00:00Z')).toBe(false)
    expect(isValidLocalISOString('2024-13-01T00:00:00')).toBe(false)
    expect(isValidLocalISOString('2024-01-01T24:00:00')).toBe(false)
    expect(() => parseDate('2023-02-29T00:00:00Z')).toThrow(TimezoneError)
    expect(() => parse('not a date')).toThrow(TimezoneError)
    expect(() => parse('')).toThrow(TimezoneError)
    expect(parse('', { strict: false }).isValid).toBe(false)
    expect(() => parse('2024-07-15T10:00:00', { defaultTimezone: 'Not/AZone' })).toThrow(
      TimezoneError
    )
    expect(safeParse('not a date')?.isValid).toBe(false)
    expect(isParseable('not a date')).toBe(false)
  })

  it('only falls back to platform parsing when an offset is present', () => {
    expect(parse('Mon, 15 Jul 2024 14:00:00 GMT', { strict: false }).date.toISOString()).toBe(
      '2024-07-15T14:00:00.000Z'
    )
    expect(parse('July 15 2024', { strict: false }).isValid).toBe(false)
    expect(parseAny('2024-07-15 14:00:00').isValid).toBe(true)
  })

  it('normalizes dates, numbers and strings', () => {
    expect(normalize(0).toISOString()).toBe('1970-01-01T00:00:00.000Z')
    expect(() => normalize(NaN)).toThrow(TimezoneError)
    expect(() => normalize(new Date('nope'))).toThrow(TimezoneError)
    const d = new Date()
    expect(normalize(d)).toBe(d)
    expect(normalize('2024-07-15T14:00:00Z').getTime()).toBe(Date.UTC(2024, 6, 15, 14))
  })

  it('parses components, ranges, times and offsets', () => {
    expect(parseComponents('2024-07-15T14:30:05.250')).toEqual({
      year: 2024,
      month: 7,
      day: 15,
      hour: 14,
      minute: 30,
      second: 5,
      millisecond: 250,
    })
    const range = parseRange('2024-01-01T00:00:00Z to 2024-01-31T00:00:00Z')
    expect(range.end.getTime() - range.start.getTime()).toBe(30 * 86_400_000)
    expect(parseTime('9:05')).toEqual({ hour: 9, minute: 5, second: 0, millisecond: 0 })
    expect(parseOffset('+05:45')).toBe(345)
    expect(parseOffset('-0930')).toBe(-570)
    expect(parseOffset('Z')).toBe(0)
    expect(parseOffset('UTC')).toBe(0)
    expect(parseOffset('+5:30')).toBe(330)
    expect(parseOffset('+05')).toBe(300)
    expect(parseOffset('+00:19:32')).toBeCloseTo(19 + 32 / 60, 10)
    expect(() => parseOffset('+25:00')).toThrow(TimezoneError)
  })
})
