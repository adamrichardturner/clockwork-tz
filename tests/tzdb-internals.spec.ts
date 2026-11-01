import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseTzif } from '../scripts/lib/tzif.ts'
import { packageVersion } from '../scripts/sign-tzdb.ts'
import { parsePosixTz, posixTransitions, posixZoneInfo } from '../src/tzdb/posixTz.js'
import { tzdb } from '../src/tzdb.js'

describe('POSIX TZ footers', () => {
  it('parses fixed offsets with quoted names', () => {
    const tz = parsePosixTz('<+0545>-5:45')!
    expect(tz.std).toEqual({ offsetSeconds: 20700, isDST: false, abbreviation: '+0545' })
    expect(tz.dst).toBeNull()
    expect(parsePosixTz('')).toBeNull()
    expect(parsePosixTz('<+00>0')!.std.offsetSeconds).toBe(0)
    expect(Object.is(parsePosixTz('<+00>0')!.std.offsetSeconds, -0)).toBe(false)
  })

  it('evaluates northern hemisphere rules', () => {
    const tz = parsePosixTz('EST5EDT,M3.2.0,M11.1.0')!
    expect(posixZoneInfo(tz, Date.UTC(2030, 2, 10, 6, 59, 59)).abbreviation).toBe('EST')
    expect(posixZoneInfo(tz, Date.UTC(2030, 2, 10, 7)).abbreviation).toBe('EDT')
    expect(posixZoneInfo(tz, Date.UTC(2030, 10, 3, 5, 59, 59)).abbreviation).toBe('EDT')
    expect(posixZoneInfo(tz, Date.UTC(2030, 10, 3, 6)).abbreviation).toBe('EST')
  })

  it('evaluates southern hemisphere rules with half-hour DST', () => {
    const tz = parsePosixTz('<+1030>-10:30<+11>-11,M10.1.0,M4.1.0')!
    expect(tz.dst?.offsetSeconds).toBe(39600)
    expect(posixZoneInfo(tz, Date.UTC(2030, 0, 15)).isDST).toBe(true)
    expect(posixZoneInfo(tz, Date.UTC(2030, 6, 15)).isDST).toBe(false)
  })

  it('handles Julian days, zero-based days, negative and extended times', () => {
    const julian = parsePosixTz('XXX3YYY,J60/2,J300/2')!
    const [start] = posixTransitions(julian, 2024, 2024)
    // J60 is always 1 March, even in leap years
    expect(new Date(start!.at + julian.std.offsetSeconds * 1000).toISOString()).toBe(
      '2024-03-01T02:00:00.000Z'
    )
    const zero = parsePosixTz('XXX3YYY,59/2,300/2')!
    expect(new Date(posixTransitions(zero, 2024, 2024)[0]!.at - 3 * 3600_000).toISOString()).toBe(
      '2024-02-29T02:00:00.000Z'
    )
    const greenland = parsePosixTz('<-02>2<-01>,M3.5.0/-1,M10.5.0/0')!
    expect(new Date(posixTransitions(greenland, 2030, 2030)[0]!.at).toISOString()).toBe(
      '2030-03-31T01:00:00.000Z'
    )
    const extended = parsePosixTz('<-03>3<-02>,M3.5.0/-2,M10.5.0/-1')!
    expect(posixTransitions(extended, 2030, 2030)).toHaveLength(2)
  })

  it('treats all-year DST as permanent', () => {
    const tz = parsePosixTz('EST5EDT,0/0,J365/25')!
    expect(tz.permanentDst).toBe(true)
    expect(posixZoneInfo(tz, Date.UTC(2030, 0, 1)).abbreviation).toBe('EDT')
    expect(posixTransitions(tz, 2030, 2031)).toEqual([])
  })

  it('rejects malformed strings', () => {
    expect(() => parsePosixTz('5EST')).toThrow()
    expect(() => parsePosixTz('EST5EDT,M3.2')).toThrow()
    expect(() => parsePosixTz('<EST5')).toThrow()
  })

  it('parses every footer in the bundled data', () => {
    for (const [zone, data] of Object.entries(tzdb.zones)) {
      expect(() => parsePosixTz(data.f), zone).not.toThrow()
    }
  })
})

describe('TZif reader', () => {
  const path = [
    '/usr/share/zoneinfo/America/New_York',
    '/usr/share/zoneinfo.default/America/New_York',
  ].find(existsSync)

  it.runIf(path)('reads system TZif files', () => {
    const tzif = parseTzif(new Uint8Array(readFileSync(path!)))
    expect(tzif.version).toBeGreaterThanOrEqual(2)
    expect(tzif.types.some(t => t.abbr === 'EDT' && t.isdst && t.utoff === -14400)).toBe(true)
    expect(tzif.footer).toBe('EST5EDT,M3.2.0,M11.1.0')
    expect(tzif.times.length).toBe(tzif.typeIndices.length)
  })

  it('rejects other files', () => {
    expect(() =>
      parseTzif(new TextEncoder().encode('not a tzif file at all, really not'))
    ).toThrow()
  })
})

describe('data package versions', () => {
  it('maps tzdb releases to semver', () => {
    expect(packageVersion('2026a')).toBe('1.2026.1')
    expect(packageVersion('2026f')).toBe('1.2026.6')
    expect(packageVersion('2026za')).toBe('1.2026.27')
    expect(() => packageVersion('latest')).toThrow()
  })
})
