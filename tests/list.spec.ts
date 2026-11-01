import { beforeEach, describe, expect, it } from 'vitest'
import { listTimeZones } from '../src/index.js'
import { ENGINES } from './helpers.js'

describe.each(ENGINES)('$name engine: listing', ({ init }) => {
  beforeEach(init)

  it('lists canonical IANA zones including unusual ones', () => {
    const zones = listTimeZones().map(z => z.value)
    expect(zones.length).toBeGreaterThan(250)
    for (const zone of [
      'UTC',
      'Asia/Kathmandu',
      'Asia/Kolkata',
      'Australia/Lord_Howe',
      'Pacific/Chatham',
    ]) {
      expect(zones).toContain(zone)
    }
    expect(zones).not.toContain('Asia/Calcutta')
    expect(new Set(zones).size).toBe(zones.length)
  })

  it('sorts by offset, then name', () => {
    const items = listTimeZones({ at: '2024-07-15T00:00:00Z' })
    for (let i = 1; i < items.length; i++) {
      const a = items[i - 1]!
      const b = items[i]!
      expect(
        a.offsetMinutes < b.offsetMinutes ||
          (a.offsetMinutes === b.offsetMinutes && a.value.localeCompare(b.value) <= 0)
      ).toBe(true)
    }
    expect(items[0]!.offsetMinutes).toBeGreaterThanOrEqual(-720)
    expect(items[items.length - 1]!.offsetMinutes).toBe(840)
  })

  it('labels zones in each style', () => {
    const at = '2024-07-15T00:00:00Z'
    const find = (style: 'original' | 'offset' | 'abbrev' | 'altName') =>
      listTimeZones({ labelStyle: style, at }).find(z => z.value === 'Asia/Kathmandu')!.label
    expect(find('original')).toBe('Asia/Kathmandu')
    expect(find('offset')).toBe('(UTC+05:45) Asia/Kathmandu')
    expect(find('abbrev')).toBe('Asia/Kathmandu (+0545)')
    expect(find('altName')).toBe('Asia/Kathmandu (Nepal Time)')
  })
})
