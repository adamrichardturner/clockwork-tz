import { beforeEach, describe, expect, it } from 'vitest'
import { getZoneCountries, listTimeZones, TimezoneError } from '../src/index.js'
import { ENGINES } from './helpers.js'

// Intl only knows countries where Intl.Locale#getTimeZones is implemented
const intlHasCountries =
  typeof (Intl.Locale.prototype as { getTimeZones?: unknown }).getTimeZones === 'function' ||
  'timeZones' in Intl.Locale.prototype

describe.each(ENGINES)('$name engine: countries', ({ name, init }) => {
  beforeEach(init)

  if (name === 'system-intl' && !intlHasCountries) {
    it('reports no countries without Intl.Locale#getTimeZones', () => {
      expect(getZoneCountries('Asia/Kathmandu')).toEqual([])
    })
    return
  }

  it('maps zones to ISO country codes', () => {
    expect(getZoneCountries('Asia/Kathmandu')).toEqual(['NP'])
    expect(getZoneCountries('Australia/Lord_Howe')).toEqual(['AU'])
    expect(getZoneCountries('Europe/Zurich')).toContain('CH')
    expect(getZoneCountries('Asia/Calcutta')).toEqual(['IN'])
  })

  it('returns no countries for UTC and fixed offsets', () => {
    expect(getZoneCountries('UTC')).toEqual([])
    expect(getZoneCountries('+05:30')).toEqual([])
    expect(() => getZoneCountries('Not/AZone')).toThrow(TimezoneError)
  })

  it('filters the zone list by country', () => {
    const australia = listTimeZones({ country: 'au' }).map(z => z.value)
    expect(australia).toEqual(
      expect.arrayContaining(['Australia/Lord_Howe', 'Australia/Eucla', 'Australia/Sydney'])
    )
    expect(australia).not.toContain('Asia/Kathmandu')
    expect(listTimeZones({ country: 'NP' }).map(z => z.value)).toEqual(['Asia/Kathmandu'])
  })

  it('reports country codes on list items', () => {
    const item = listTimeZones().find(z => z.value === 'Pacific/Chatham')
    expect(item?.countryCodes).toEqual(['NZ'])
    if (name === 'embedded-tzdb') {
      // tzdb knows Europe/Zurich also covers Büsingen (DE) and Liechtenstein
      expect(getZoneCountries('Europe/Zurich')).toEqual(['CH', 'DE', 'LI'])
    }
  })
})
