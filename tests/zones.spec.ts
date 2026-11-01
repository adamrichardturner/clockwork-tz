import { beforeEach, describe, expect, it } from 'vitest'
import {
  canonicalizeTimeZone,
  convert,
  fromUTC,
  getOffset,
  getZoneInfo,
  isDST,
  isValidTimeZone,
  TimezoneError,
} from '../src/index.js'
import { OFFSET_FIXTURES } from './fixtures/weird-zones.js'
import { ENGINES } from './helpers.js'

describe.each(ENGINES)('$name engine: unusual zones', ({ name, init }) => {
  beforeEach(init)

  const fixtures = OFFSET_FIXTURES.filter(f => name === 'embedded-tzdb' || !f.embeddedOnly)

  it.each(fixtures)('$zone at $at is $offsetMinutes ($note)', fixture => {
    expect(getOffset(fixture.at, fixture.zone)).toBeCloseTo(fixture.offsetMinutes, 10)
    const isHeuristicDst = name === 'system-intl' && fixture.zone === 'Africa/Casablanca'
    if (fixture.isDST !== undefined && !isHeuristicDst) {
      expect(isDST(fixture.at, fixture.zone)).toBe(fixture.isDST)
    }
  })

  it('formats local time consistently with the offset', () => {
    const result = fromUTC('2024-07-15T14:00:00.000Z', 'Pacific/Chatham')
    expect(result.local).toBe('2024-07-16 02:45:00.000')
    expect(result.offsetMinutes).toBe(765)
    expect(result.utc).toBe('2024-07-15T14:00:00.000Z')
    expect(result.source).toBe(name)
  })

  it('converts local wall time between half-hour and 45-minute zones', () => {
    const result = convert('2024-07-15T16:30:00', 'Asia/Kathmandu', 'America/St_Johns')
    expect(result.utc).toBe('2024-07-15T10:45:00.000Z')
    expect(result.local).toBe('2024-07-15 08:15:00.000')
  })

  it('converts instants without reinterpreting them', () => {
    const fromDate = convert(new Date('2024-07-15T10:45:00Z'), 'Asia/Tokyo', 'Australia/Eucla')
    const fromString = convert('2024-07-15T19:45:00+09:00', 'Asia/Tokyo', 'Australia/Eucla')
    expect(fromDate.local).toBe('2024-07-15 19:30:00.000')
    expect(fromString.local).toBe(fromDate.local)
  })

  it('accepts epoch milliseconds', () => {
    expect(fromUTC(Date.UTC(2024, 6, 15, 14), 'Asia/Kolkata').local).toBe('2024-07-15 19:30:00.000')
  })

  it('supports fixed-offset zones', () => {
    const result = fromUTC('2024-07-15T14:00:00Z', '+05:30')
    expect(result.local).toBe('2024-07-15 19:30:00.000')
    expect(result.isDST).toBe(false)
    expect(getZoneInfo('2024-07-15T14:00:00Z', '-0930').offsetSeconds).toBe(-34200)
  })

  it('validates and canonicalizes identifiers', () => {
    expect(isValidTimeZone('America/Argentina/Buenos_Aires')).toBe(true)
    expect(isValidTimeZone('Mars/Olympus_Mons')).toBe(false)
    expect(isValidTimeZone('')).toBe(false)
    expect(canonicalizeTimeZone('Asia/Calcutta')).toBe('Asia/Kolkata')
    expect(canonicalizeTimeZone('Europe/Kiev')).toBe('Europe/Kyiv')
    expect(canonicalizeTimeZone('+0530')).toBe('+05:30')
    expect(() => fromUTC('2024-01-01T00:00:00Z', 'Mars/Olympus_Mons')).toThrow(TimezoneError)
  })

  it('reports abbreviations', () => {
    expect(getZoneInfo('2024-01-15T12:00:00Z', 'America/New_York').abbreviation).toBe('EST')
    expect(getZoneInfo('2024-07-15T12:00:00Z', 'America/New_York').abbreviation).toBe('EDT')
    expect(getZoneInfo('2024-07-15T12:00:00Z', 'Australia/Lord_Howe').abbreviation).toBe('+1030')
  })
})
