/**
 * Comprehensive test suite for EmbeddedTzdbEngine
 * 
 * These tests validate the deterministic timezone calculations provided by the
 * embedded TZDB engine using sample timezone data.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { createEmbeddedTzdbEngine } from '../src/engines/embeddedTzdb.js'
import type { TzdbData } from '../src/data/tzdbStructures.js'

// Sample TZDB data for testing
const sampleTzdbData: TzdbData = {
  version: 'test-2024',
  zones: {
    'UTC': {
      name: 'UTC',
      transitions: [
        {
          timestamp: 0,
          rule: {
            offsetMinutes: 0,
            abbreviation: 'UTC',
            isDst: false,
          },
          type: 'standard',
        },
      ],
    },
    'America/New_York': {
      name: 'America/New_York',
      transitions: [
        // Standard time (winter)
        {
          timestamp: Date.UTC(2024, 0, 1) / 1000,
          rule: {
            offsetMinutes: -300, // EST: UTC-5
            abbreviation: 'EST',
            isDst: false,
          },
          type: 'standard',
        },
        // DST starts (spring forward)
        {
          timestamp: Date.UTC(2024, 2, 10, 7) / 1000, // 2024-03-10 07:00 UTC (02:00 EST -> 03:00 EDT)
          rule: {
            offsetMinutes: -300,
            dstOffsetMinutes: 60,
            abbreviation: 'EDT',
            isDst: true,
          },
          type: 'daylight',
        },
        // DST ends (fall back)
        {
          timestamp: Date.UTC(2024, 10, 3, 6) / 1000, // 2024-11-03 06:00 UTC (02:00 EDT -> 01:00 EST)
          rule: {
            offsetMinutes: -300,
            abbreviation: 'EST',
            isDst: false,
          },
          type: 'standard',
        },
      ],
    },
    'Australia/Lord_Howe': {
      name: 'Australia/Lord_Howe',
      transitions: [
        // DST (summer): +11:00
        {
          timestamp: Date.UTC(2024, 0, 1) / 1000,
          rule: {
            offsetMinutes: 630, // +10:30
            dstOffsetMinutes: 30, // +0:30 DST shift
            abbreviation: 'LHDT',
            isDst: true,
          },
          type: 'daylight',
        },
        // Standard time: +10:30
        {
          timestamp: Date.UTC(2024, 3, 1) / 1000,
          rule: {
            offsetMinutes: 630,
            abbreviation: 'LHST',
            isDst: false,
          },
          type: 'standard',
        },
      ],
    },
    'Australia/Eucla': {
      name: 'Australia/Eucla',
      transitions: [
        {
          timestamp: 0,
          rule: {
            offsetMinutes: 525, // +8:45
            abbreviation: 'ACWST',
            isDst: false,
          },
          type: 'standard',
        },
      ],
    },
  },
  rules: {},
  links: {
    'US/Eastern': 'America/New_York',
  },
  metadata: {
    buildTime: '2024-01-01T00:00:00Z',
    dataHash: 'test-hash',
    dateRange: {
      start: '2024-01-01T00:00:00Z',
      end: '2025-01-01T00:00:00Z',
    },
    zoneCount: 4,
    ruleCount: 0,
  },
}

describe('EmbeddedTzdbEngine', () => {
  let engine: ReturnType<typeof createEmbeddedTzdbEngine>

  beforeAll(() => {
    engine = createEmbeddedTzdbEngine(sampleTzdbData, 'test-2024')
  })

  describe('Engine Properties', () => {
    it('should have correct engine kind', () => {
      expect(engine.kind).toBe('embedded-tzdb')
    })

    it('should return correct version', () => {
      expect(engine.getVersion()).toBe('test-2024')
    })

    it('should indicate data is loaded', () => {
      expect(engine.isDataLoaded()).toBe(true)
    })

    it('should return loaded tzdb data', () => {
      const data = engine.getTzdbData()
      expect(data).toBeDefined()
      expect((data as TzdbData).version).toBe('test-2024')
    })
  })

  describe('Timezone Validation', () => {
    it('should validate canonical timezone names', () => {
      expect(engine.isValidTimeZone('UTC')).toBe(true)
      expect(engine.isValidTimeZone('America/New_York')).toBe(true)
      expect(engine.isValidTimeZone('Australia/Lord_Howe')).toBe(true)
      expect(engine.isValidTimeZone('Australia/Eucla')).toBe(true)
    })

    it('should validate timezone aliases', () => {
      expect(engine.isValidTimeZone('US/Eastern')).toBe(true)
    })

    it('should reject invalid timezone names', () => {
      expect(engine.isValidTimeZone('Invalid/Zone')).toBe(false)
      expect(engine.isValidTimeZone('America/FakeCity')).toBe(false)
      expect(engine.isValidTimeZone('')).toBe(false)
    })
  })

  describe('UTC to Timezone Conversion', () => {
    it('should convert UTC to UTC', () => {
      const result = engine.fromUTC(new Date('2024-07-15T12:00:00Z'), 'UTC')
      
      expect(result.zone).toBe('UTC')
      expect(result.offsetMinutes).toBe(0)
      expect(result.isDST).toBe(false)
      expect(result.source).toBe('embedded-tzdb')
      expect(result.tzdbVersion).toBe('test-2024')
    })

    it('should convert UTC to America/New_York during EST', () => {
      const result = engine.fromUTC(new Date('2024-01-15T12:00:00Z'), 'America/New_York')
      
      expect(result.zone).toBe('America/New_York')
      expect(result.offsetMinutes).toBe(-300) // -5 hours
      expect(result.isDST).toBe(false)
    })

    it('should convert UTC to America/New_York during EDT', () => {
      const result = engine.fromUTC(new Date('2024-07-15T12:00:00Z'), 'America/New_York')
      
      expect(result.zone).toBe('America/New_York')
      expect(result.offsetMinutes).toBe(-240) // -4 hours (-5 + 1 DST)
      expect(result.isDST).toBe(true)
    })

    it('should handle Australia/Lord_Howe 30-minute DST shift', () => {
      const resultDST = engine.fromUTC(new Date('2024-01-15T12:00:00Z'), 'Australia/Lord_Howe')
      const resultStd = engine.fromUTC(new Date('2024-05-15T12:00:00Z'), 'Australia/Lord_Howe')
      
      expect(resultDST.offsetMinutes).toBe(660) // +11:00
      expect(resultDST.isDST).toBe(true)
      
      expect(resultStd.offsetMinutes).toBe(630) // +10:30
      expect(resultStd.isDST).toBe(false)
    })

    it('should handle Australia/Eucla fixed +8:45 offset', () => {
      const result = engine.fromUTC(new Date('2024-07-15T12:00:00Z'), 'Australia/Eucla')
      
      expect(result.offsetMinutes).toBe(525) // +8:45
      expect(result.isDST).toBe(false)
    })
  })

  describe('Offset Calculation', () => {
    it('should calculate correct offset for UTC', () => {
      const offset = engine.getOffset(new Date('2024-07-15T12:00:00Z'), 'UTC')
      expect(offset).toBe(0)
    })

    it('should calculate correct offset for America/New_York in winter', () => {
      const offset = engine.getOffset(new Date('2024-01-15T12:00:00Z'), 'America/New_York')
      expect(offset).toBe(-300)
    })

    it('should calculate correct offset for America/New_York in summer', () => {
      const offset = engine.getOffset(new Date('2024-07-15T12:00:00Z'), 'America/New_York')
      expect(offset).toBe(-240)
    })

    it('should calculate correct offset for fractional offsets', () => {
      const offset = engine.getOffset(new Date('2024-07-15T12:00:00Z'), 'Australia/Eucla')
      expect(offset).toBe(525) // +8:45
    })
  })

  describe('DST Detection', () => {
    it('should detect no DST for UTC', () => {
      const isDST = engine.isDST(new Date('2024-07-15T12:00:00Z'), 'UTC')
      expect(isDST).toBe(false)
    })

    it('should detect DST correctly for America/New_York', () => {
      const winterDST = engine.isDST(new Date('2024-01-15T12:00:00Z'), 'America/New_York')
      const summerDST = engine.isDST(new Date('2024-07-15T12:00:00Z'), 'America/New_York')
      
      expect(winterDST).toBe(false)
      expect(summerDST).toBe(true)
    })

    it('should detect DST for Lord Howe Island', () => {
      const summerDST = engine.isDST(new Date('2024-01-15T12:00:00Z'), 'Australia/Lord_Howe')
      const winterDST = engine.isDST(new Date('2024-05-15T12:00:00Z'), 'Australia/Lord_Howe')
      
      expect(summerDST).toBe(true)
      expect(winterDST).toBe(false)
    })
  })

  describe('Timezone Listing', () => {
    it('should list all available timezones', () => {
      const zones = engine.listTimeZones()
      
      expect(zones.length).toBeGreaterThan(0)
      expect(zones.some(z => z.value === 'UTC')).toBe(true)
      expect(zones.some(z => z.value === 'America/New_York')).toBe(true)
      expect(zones.some(z => z.value === 'Australia/Lord_Howe')).toBe(true)
      expect(zones.some(z => z.value === 'Australia/Eucla')).toBe(true)
    })

    it('should provide correct offset for each timezone', () => {
      const zones = engine.listTimeZones()
      
      const utc = zones.find(z => z.value === 'UTC')
      expect(utc?.offsetMinutes).toBe(0)
      
      const eucla = zones.find(z => z.value === 'Australia/Eucla')
      expect(eucla?.offsetMinutes).toBe(525)
    })

    it('should format labels with offset style', () => {
      const zones = engine.listTimeZones({ labelStyle: 'offset' })
      
      const utc = zones.find(z => z.value === 'UTC')
      expect(utc?.label).toContain('UTC')
      expect(utc?.label).toContain('+00:00')
    })

    it('should format labels with abbreviation style', () => {
      const zones = engine.listTimeZones({ labelStyle: 'abbrev' })
      
      const utc = zones.find(z => z.value === 'UTC')
      expect(utc?.label).toContain('UTC')
    })

    it('should sort timezones alphabetically', () => {
      const zones = engine.listTimeZones()
      
      for (let i = 1; i < zones.length; i++) {
        expect(zones[i].value.localeCompare(zones[i - 1].value)).toBeGreaterThanOrEqual(0)
      }
    })
  })

  describe('Format', () => {
    it('should format time with default pattern', () => {
      const formatted = engine.format(new Date('2024-07-15T12:00:00Z'), 'America/New_York', 'yyyy-MM-dd HH:mm:ss')
      
      // Should match ISO-8601 format with T separator or space
      expect(formatted).toMatch(/2024-07-15[T ]\d{2}:\d{2}:\d{2}/)
    })

    it('should format time with timezone abbreviation', () => {
      const formatted = engine.format(new Date('2024-07-15T12:00:00Z'), 'America/New_York', 'yyyy-MM-dd z')
      
      expect(formatted).toContain('America/New_York')
    })

    it('should format time with offset', () => {
      const formatted = engine.format(new Date('2024-07-15T12:00:00Z'), 'America/New_York', 'yyyy-MM-dd Z')
      
      expect(formatted).toMatch(/-\d{2}:\d{2}/)
    })
  })

  describe('Data Loading', () => {
    it('should load new timezone data', async () => {
      const newEngine = createEmbeddedTzdbEngine()
      
      expect(newEngine.isDataLoaded()).toBe(false)
      
      await newEngine.loadTzdbData(sampleTzdbData, 'test-2024')
      
      expect(newEngine.isDataLoaded()).toBe(true)
      expect(newEngine.getVersion()).toBe('test-2024')
    })

    it('should replace existing data when loading new data', async () => {
      const engine = createEmbeddedTzdbEngine(sampleTzdbData, 'test-2024')
      
      const newData: TzdbData = {
        ...sampleTzdbData,
        version: 'test-2025',
      }
      
      await engine.loadTzdbData(newData, 'test-2025')
      
      expect(engine.getVersion()).toBe('test-2025')
    })
  })

  describe('User Timezone Detection', () => {
    it('should return a valid timezone identifier', () => {
      const userZone = engine.getUserTimeZone()
      
      expect(userZone).toBeDefined()
      expect(typeof userZone).toBe('string')
      expect(userZone.length).toBeGreaterThan(0)
    })
  })

  describe('Error Handling', () => {
    it('should throw error when converting with invalid timezone', () => {
      expect(() => {
        engine.fromUTC(new Date(), 'Invalid/Zone')
      }).toThrow()
    })

    it('should throw error when getting offset for invalid timezone', () => {
      expect(() => {
        engine.getOffset(new Date(), 'Invalid/Zone')
      }).toThrow()
    })

    it('should throw error when data is not loaded', () => {
      const emptyEngine = createEmbeddedTzdbEngine()
      
      expect(() => {
        emptyEngine.fromUTC(new Date(), 'UTC')
      }).toThrow('TZDB data not loaded')
    })
  })
})
