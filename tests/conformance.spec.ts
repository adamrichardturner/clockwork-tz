/**
 * The embedded engine must agree with the platform's ICU data. Releases differ
 * in future rules, so instants are compared up to the start of the older
 * release's year, from 1970 (ICU and tzdb differ on some pre-1970 history).
 */

import { describe, expect, it } from 'vitest'
import { createEmbeddedTzdbEngine, createSystemIntlEngine } from '../src/index.js'
import { tzdb } from '../src/tzdb.js'

const icuVersion = (process.versions as { tz?: string }).tz ?? '2000a'
const cutoffYear = Math.min(parseInt(icuVersion, 10), parseInt(tzdb.version, 10))
const FROM = Date.UTC(1970, 0, 1)
const TO = Date.UTC(cutoffYear, 0, 1)
// An odd step samples every month, weekday and hour over the decades
const STEP = 9 * 86_400_000 + 7 * 3_600_000 + 17 * 60_000

describe(`embedded tzdb ${tzdb.version} vs ICU ${icuVersion}`, () => {
  const intl = createSystemIntlEngine()
  const embedded = createEmbeddedTzdbEngine(tzdb)
  const zones = embedded.listZoneIds().filter(zone => intl.isValidTimeZone(zone))

  it('lists zones the platform knows', () => {
    expect(zones.length).toBeGreaterThan(250)
  })

  it.each(zones)('%s offsets match', zone => {
    const mismatches: string[] = []
    for (let t = FROM; t < TO && mismatches.length < 3; t += STEP) {
      const expected = intl.getZoneInfo(t, zone).offsetSeconds
      const actual = embedded.getZoneInfo(t, zone).offsetSeconds
      if (expected !== actual) {
        mismatches.push(`${new Date(t).toISOString()}: ICU ${expected}, embedded ${actual}`)
      }
    }
    expect(mismatches).toEqual([])
  })

  it.each([
    'America/New_York',
    'Australia/Lord_Howe',
    'Pacific/Chatham',
    'Europe/London',
    'America/Santiago',
  ])('%s transitions match', zone => {
    const from = Date.UTC(2000, 0, 1)
    const to = Date.UTC(Math.min(cutoffYear, 2025), 0, 1)
    const exact = embedded.getTransitions(zone, from, to).map(t => t.at)
    // Intl has no transition API; sample offsets around each embedded transition
    for (const at of exact) {
      expect(intl.getZoneInfo(at - 1000, zone).offsetSeconds).not.toBe(
        intl.getZoneInfo(at, zone).offsetSeconds
      )
    }
    expect(exact.length).toBeGreaterThan(0)
  })
})
