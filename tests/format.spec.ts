import { beforeEach, describe, expect, it } from 'vitest'
import {
  format,
  formatDuration,
  formatFor,
  formatOffset,
  formatRange,
  formatRelative,
  formatWithPattern,
  fromUTC,
  isValidFormatPattern,
  FORMAT_PATTERNS,
  TimezoneError,
} from '../src/index.js'
import { ENGINES } from './helpers.js'

const INSTANT = '2024-07-15T14:00:00.123Z'

describe.each(ENGINES)('$name engine: formatting', ({ name, init }) => {
  beforeEach(init)

  it.each([
    ['yyyy-MM-dd HH:mm:ss', '2024-07-15 19:45:00'],
    ['yy M d H h m s', '24 7 15 19 7 45 0'],
    ['S SS SSS', '1 12 123'],
    ['MMM MMMM EEE EEEE', 'Jul July Mon Monday'],
    ['h:mm a', '7:45 PM'],
    ['x xx xxx xxxx xxxxx', '+0545 +0545 +05:45 +0545 +05:45'],
    ['X XX XXX', '+0545 +0545 +05:45'],
    ['O OOOO', 'GMT+5:45 GMT+05:45'],
    ["yyyy-MM-dd'T'HH:mm:ssxxx", '2024-07-15T19:45:00+05:45'],
    ["h 'o''clock'", "7 o'clock"],
  ])('%s', (pattern, expected) => {
    expect(format(INSTANT, 'Asia/Kathmandu', pattern)).toBe(expected)
  })

  it('uses Z for zero offsets with X', () => {
    expect(format(INSTANT, 'UTC', 'XXX')).toBe('Z')
    expect(format(INSTANT, 'UTC', 'xxx')).toBe('+00:00')
    expect(format(INSTANT, 'UTC', 'O')).toBe('GMT')
  })

  it('formats negative half-hour offsets', () => {
    expect(format(INSTANT, 'Pacific/Marquesas', 'HH:mm xxx')).toBe('04:30 -09:30')
  })

  it('formats midnight and noon in 12-hour time', () => {
    expect(format('2024-07-15T00:05:00Z', 'UTC', 'h:mm a')).toBe('12:05 AM')
    expect(format('2024-07-15T12:05:00Z', 'UTC', 'hh:mm a')).toBe('12:05 PM')
  })

  it('localizes names', () => {
    expect(format(INSTANT, 'Europe/Paris', 'EEEE d MMMM', 'fr')).toBe('lundi 15 juillet')
  })

  it('names zones with zzz and zzzz', () => {
    expect(format(INSTANT, 'America/New_York', 'zzz')).toBe('EDT')
    expect(format(INSTANT, 'America/New_York', 'zzzz')).toBe('Eastern Daylight Time')
  })

  it('applies custom formats to conversion results', () => {
    expect(fromUTC(INSTANT, 'Australia/Lord_Howe', { format: 'HH:mm xxx' }).local).toBe(
      '00:30 +10:30'
    )
  })

  if (name === 'embedded-tzdb') {
    it('prints LMT offsets with seconds', () => {
      expect(format('1850-01-01T00:00:00Z', 'Asia/Kolkata', 'HH:mm:ss xxxxx')).toBe(
        '05:53:28 +05:53:28'
      )
    })
  }

  it('rejects unsupported tokens', () => {
    expect(() => format(INSTANT, 'UTC', 'QQQ')).toThrow(TimezoneError)
    expect(() => format(INSTANT, 'UTC', "'unterminated")).toThrow(TimezoneError)
    expect(isValidFormatPattern('QQQ')).toBe(false)
    expect(isValidFormatPattern(FORMAT_PATTERNS.long)).toBe(true)
  })

  it('provides named patterns and use cases', () => {
    expect(formatWithPattern(INSTANT, 'Asia/Tokyo', 'iso8601')).toBe('2024-07-15T23:00:00+09:00')
    expect(formatFor(INSTANT, 'Asia/Tokyo', 'filename')).toBe('2024-07-15_23-00-00')
    expect(formatWithPattern(INSTANT, 'Asia/Tokyo', 'rfc2822')).toBe(
      'Mon, 15 Jul 2024 23:00:00 +0900'
    )
  })

  it('formats ranges, durations, relative times and offsets', () => {
    expect(formatRange('2024-07-15T01:00:00Z', '2024-07-15T03:30:00Z', 'Asia/Tokyo')).toBe(
      `2024-07-15 10:00 – 12:30 ${format(INSTANT, 'Asia/Tokyo', 'zzz')}`
    )
    expect(formatDuration('2024-07-15T00:00:00Z', '2024-07-16T02:30:00Z')).toBe('1 day, 2 hours')
    expect(formatDuration(0, 0)).toBe('0 minutes')
    expect(formatRelative('2024-07-15T12:00:00Z', 'UTC', '2024-07-15T14:00:00Z')).toBe(
      '2 hours ago'
    )
    expect(formatRelative('2024-07-18T14:00:00Z', 'UTC', '2024-07-15T14:00:00Z')).toBe('in 3 days')
    expect(formatRelative('2024-08-15T14:00:00Z', 'UTC', '2024-07-15T14:00:00Z')).toBe('2024-08-15')
    expect(formatOffset(345)).toBe('+05:45')
    expect(formatOffset(-570)).toBe('-09:30')
  })
})
