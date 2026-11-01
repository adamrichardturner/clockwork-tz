import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createEmbeddedTzdbEngine,
  dispose,
  engine,
  fromUTC,
  getCurrentEngine,
  getStatus,
  getUserTimeZone,
  initClockworkTZ,
  isDST,
  refreshTimezoneData,
  setEngine,
  TimezoneError,
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

  it('rejects invalid data and engines', () => {
    expect(() => createEmbeddedTzdbEngine({ version: 1 })).toThrow(TimezoneError)
    expect(() => initClockworkTZ({ engine: 'nope' as never })).toThrow(TimezoneError)
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
