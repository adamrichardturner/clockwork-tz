import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createEmbeddedTzdbEngine,
  dispose,
  engine,
  fromUTC,
  getCurrentEngine,
  getStatus,
  getUserTimeZone,
  formatWithPattern,
  initClockworkTZ,
  interpretLocal,
  isDST,
  refreshTimezoneData,
  setEngine,
  TimezoneError,
  tzdbVersion,
  VERSION,
} from '../src/index.js'
import { tzdb, TZDB_VERSION } from '../src/tzdb.js'

describe('API', () => {
  afterEach(() => {
    dispose()
  })

  it('exposes the package version', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
    expect(VERSION).toBe(pkg.version)
  })

  it('defaults to the system-intl engine', async () => {
    await initClockworkTZ()
    expect(engine()).toBe('system-intl')
    expect(getStatus()).toMatchObject({ engine: 'system-intl', dataLoaded: true })
    expect(fromUTC('2024-01-01T00:00:00Z', 'UTC').tzdbVersion).toBeUndefined()
  })

  it('switches to the embedded engine with bundled data', async () => {
    await initClockworkTZ({ engine: 'embedded-tzdb', data: tzdb })
    expect(engine()).toBe('embedded-tzdb')
    expect(getStatus().tzdbVersion).toBe(TZDB_VERSION)
    expect(getStatus().lastUpdate).toBeInstanceOf(Date)
    expect(fromUTC('2024-01-01T00:00:00Z', 'UTC').tzdbVersion).toBe(TZDB_VERSION)
  })

  it('explains how to load data when the embedded engine has none', async () => {
    await initClockworkTZ({ engine: 'embedded-tzdb' })
    expect(getStatus().dataLoaded).toBe(false)
    expect(() => getCurrentEngine().getZoneInfo(0, 'UTC')).toThrow(/clockwork-tz\/tzdb/)
    await expect(refreshTimezoneData()).rejects.toThrow(TimezoneError)
  })

  it('rejects invalid data, engines and option combinations', async () => {
    expect(() => createEmbeddedTzdbEngine({ version: 1 })).toThrow(TimezoneError)
    expect(() => initClockworkTZ({ engine: 'nope' as never })).toThrow(TimezoneError)
    expect(() => initClockworkTZ({ data: tzdb })).toThrow(/embedded-tzdb/)
    expect(() => initClockworkTZ({ manifestURL: 'https://example.test/m.json' })).toThrow(
      /embedded-tzdb/
    )
    expect(() =>
      initClockworkTZ({ engine: 'embedded-tzdb', data: tzdb, autoUpdateIntervalMs: -1 })
    ).toThrow(TimezoneError)
  })

  it('leaves the current engine in place when new data is invalid', async () => {
    await initClockworkTZ({ engine: 'embedded-tzdb', data: tzdb })
    expect(() => initClockworkTZ({ engine: 'embedded-tzdb', data: { nope: true } })).toThrow(
      TimezoneError
    )
    expect(tzdbVersion()).toBe(TZDB_VERSION)
  })

  it('resets lastUpdate when switching engines', async () => {
    await initClockworkTZ({ engine: 'embedded-tzdb', data: tzdb })
    expect(getStatus().lastUpdate).toBeInstanceOf(Date)
    await initClockworkTZ()
    expect(getStatus().lastUpdate).toBeUndefined()
  })

  it('canonicalizes the user timezone', async () => {
    await initClockworkTZ()
    const spy = vi
      .spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions')
      .mockReturnValue({ timeZone: 'Asia/Calcutta' } as Intl.ResolvedDateTimeFormatOptions)
    try {
      expect(getUserTimeZone()).toBe('Asia/Kolkata')
    } finally {
      spy.mockRestore()
    }
  })

  it('throws TimezoneError for every kind of bad input', async () => {
    await initClockworkTZ()
    expect(() => fromUTC('not a date', 'UTC')).toThrow(TimezoneError)
    expect(() => fromUTC(NaN, 'UTC')).toThrow(TimezoneError)
    expect(() => fromUTC('2024-07-15T10:00:00', 'UTC')).toThrow(TimezoneError)
    expect(() => interpretLocal('2024-07-15T10:00:00', 'Not/AZone')).toThrow(TimezoneError)
    expect(() => formatWithPattern(0, 'UTC', 'nope' as never)).toThrow(TimezoneError)
  })

  it('allows a custom engine', async () => {
    await initClockworkTZ()
    const embedded = createEmbeddedTzdbEngine(tzdb)
    setEngine(embedded)
    expect(getCurrentEngine()).toBe(embedded)
  })

  it('returns false from isDST for invalid zones and detects the user zone', async () => {
    await initClockworkTZ()
    expect(isDST('2024-07-01T00:00:00Z', 'Not/AZone')).toBe(false)
    expect(typeof getUserTimeZone()).toBe('string')
  })
})
