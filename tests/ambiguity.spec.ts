/**
 * Tests for handling ambiguous and invalid times during DST transitions
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  initClockworkTZ,
  interpretLocal,
  AmbiguousTimeError,
  InvalidTimeError,
  type Disambiguation,
} from '../src/index.js'
import {
  getCurrentEngine,
  isAmbiguousTimeHandlingSupported,
  isInvalidTimeDetectionSupported,
} from './utils/testHelpers.js'

describe('DST Transition Ambiguity Handling', () => {
  beforeEach(() => {
    initClockworkTZ({ engine: 'system-intl' })
  })

  // Add a placeholder test to prevent "no tests found" error
  it('should initialize engine', () => {
    expect(getCurrentEngine()).toBe('system-intl')
  })

  // Only run ambiguity tests if supported by current engine
  if (isAmbiguousTimeHandlingSupported() || isInvalidTimeDetectionSupported()) {
    describe('Spring Forward (Invalid Times)', () => {
      // In spring, clocks "spring forward" creating a gap of invalid times

      it('should handle invalid time during US spring forward', () => {
        if (!isInvalidTimeDetectionSupported()) {
          console.log(`Skipping invalid time test - not supported by ${getCurrentEngine()} engine`)
          return
        }

        // March 10, 2024 - US DST begins (2:00 AM -> 3:00 AM)
        const invalidTime = '2024-03-10T02:30:00' // This time doesn't exist
        const zone = 'America/New_York'

        // With 'earliest' - should use the time after the gap
        const earliestResult = interpretLocal(invalidTime, zone, { disambiguation: 'earliest' })
        expect(earliestResult.zone).toBe(zone)
        expect(earliestResult.isDST).toBe(true)

        // With 'latest' - should use the time after the gap
        const latestResult = interpretLocal(invalidTime, zone, { disambiguation: 'latest' })
        expect(latestResult.zone).toBe(zone)
        expect(latestResult.isDST).toBe(true)

        // With 'reject' - should throw InvalidTimeError
        expect(() => {
          interpretLocal(invalidTime, zone, { disambiguation: 'reject' })
        }).toThrow(InvalidTimeError)
      })

      it('should handle invalid time during Europe spring forward', () => {
        // March 31, 2024 - EU DST begins (2:00 AM -> 3:00 AM)
        const invalidTime = '2024-03-31T02:30:00'
        const zone = 'Europe/London'

        const result = interpretLocal(invalidTime, zone, { disambiguation: 'earliest' })
        expect(result.zone).toBe(zone)
        expect(result.isDST).toBe(true)

        expect(() => {
          interpretLocal(invalidTime, zone, { disambiguation: 'reject' })
        }).toThrow(InvalidTimeError)
      })

      it('should handle invalid time in Southern Hemisphere', () => {
        // October 6, 2024 - Australia DST begins (2:00 AM -> 3:00 AM)
        const invalidTime = '2024-10-06T02:30:00'
        const zone = 'Australia/Sydney'

        const result = interpretLocal(invalidTime, zone, { disambiguation: 'latest' })
        expect(result.zone).toBe(zone)
        expect(result.isDST).toBe(true)

        expect(() => {
          interpretLocal(invalidTime, zone, { disambiguation: 'reject' })
        }).toThrow(InvalidTimeError)
      })
    })

    describe('Fall Back (Ambiguous Times)', () => {
      // In fall, clocks "fall back" creating duplicate times

      it('should handle ambiguous time during US fall back', () => {
        // November 3, 2024 - US DST ends (2:00 AM -> 1:00 AM)
        const ambiguousTime = '2024-11-03T01:30:00' // This time occurs twice
        const zone = 'America/New_York'

        // With 'earliest' - should use the first occurrence (DST)
        const earliestResult = interpretLocal(ambiguousTime, zone, { disambiguation: 'earliest' })
        expect(earliestResult.zone).toBe(zone)
        expect(earliestResult.isDST).toBe(true)

        // With 'latest' - should use the second occurrence (standard)
        const latestResult = interpretLocal(ambiguousTime, zone, { disambiguation: 'latest' })
        expect(latestResult.zone).toBe(zone)
        expect(latestResult.isDST).toBe(false)

        // The UTC times should be different by 1 hour
        const earliestUTC = new Date(earliestResult.utc).getTime()
        const latestUTC = new Date(latestResult.utc).getTime()
        expect(latestUTC - earliestUTC).toBe(60 * 60 * 1000) // 1 hour

        // With 'reject' - should throw AmbiguousTimeError
        expect(() => {
          interpretLocal(ambiguousTime, zone, { disambiguation: 'reject' })
        }).toThrow(AmbiguousTimeError)
      })

      it('should handle ambiguous time during Europe fall back', () => {
        // October 27, 2024 - EU DST ends (3:00 AM -> 2:00 AM)
        const ambiguousTime = '2024-10-27T02:30:00'
        const zone = 'Europe/London'

        const earliestResult = interpretLocal(ambiguousTime, zone, { disambiguation: 'earliest' })
        expect(earliestResult.isDST).toBe(true)

        const latestResult = interpretLocal(ambiguousTime, zone, { disambiguation: 'latest' })
        expect(latestResult.isDST).toBe(false)

        expect(() => {
          interpretLocal(ambiguousTime, zone, { disambiguation: 'reject' })
        }).toThrow(AmbiguousTimeError)
      })

      it('should handle ambiguous time in Southern Hemisphere', () => {
        // April 7, 2024 - Australia DST ends (3:00 AM -> 2:00 AM)
        const ambiguousTime = '2024-04-07T02:30:00'
        const zone = 'Australia/Sydney'

        const earliestResult = interpretLocal(ambiguousTime, zone, { disambiguation: 'earliest' })
        expect(earliestResult.isDST).toBe(true)

        const latestResult = interpretLocal(ambiguousTime, zone, { disambiguation: 'latest' })
        expect(latestResult.isDST).toBe(false)

        expect(() => {
          interpretLocal(ambiguousTime, zone, { disambiguation: 'reject' })
        }).toThrow(AmbiguousTimeError)
      })
    })

    describe('Unusual Offset Zones DST Transitions', () => {
      it('should handle Lord Howe Island unique 30-minute DST shift', () => {
        // Lord Howe Island has a unique DST where clocks move forward 30 minutes
        // instead of the usual 1 hour

        // Spring forward: October 6, 2024 (2:00 AM -> 2:30 AM)
        const invalidTime = '2024-10-06T02:15:00'
        const zone = 'Australia/Lord_Howe'

        const result = interpretLocal(invalidTime, zone, { disambiguation: 'earliest' })
        expect(result.zone).toBe(zone)

        expect(() => {
          interpretLocal(invalidTime, zone, { disambiguation: 'reject' })
        }).toThrow(InvalidTimeError)

        // Fall back: April 7, 2024 (2:30 AM -> 2:00 AM)
        const ambiguousTime = '2024-04-07T02:15:00'

        const earliestResult = interpretLocal(ambiguousTime, zone, { disambiguation: 'earliest' })
        const latestResult = interpretLocal(ambiguousTime, zone, { disambiguation: 'latest' })

        // Should have different UTC times
        expect(earliestResult.utc).not.toBe(latestResult.utc)

        expect(() => {
          interpretLocal(ambiguousTime, zone, { disambiguation: 'reject' })
        }).toThrow(AmbiguousTimeError)
      })

      it('should handle Chatham Islands 45-minute DST shift', () => {
        // Chatham Islands uses a 45-minute DST shift
        const zone = 'Pacific/Chatham'

        // Spring forward: September 29, 2024 (2:45 AM -> 3:45 AM)
        const invalidTime = '2024-09-29T03:00:00'

        const result = interpretLocal(invalidTime, zone, { disambiguation: 'latest' })
        expect(result.zone).toBe(zone)

        expect(() => {
          interpretLocal(invalidTime, zone, { disambiguation: 'reject' })
        }).toThrow(InvalidTimeError)
      })
    })

    describe('Edge Cases and Error Handling', () => {
      it('should handle times exactly at transition boundaries', () => {
        // Test time exactly when spring forward happens
        const springForwardTime = '2024-03-10T02:00:00'
        const zone = 'America/New_York'

        // This should be handled as an invalid time
        expect(() => {
          interpretLocal(springForwardTime, zone, { disambiguation: 'reject' })
        }).toThrow(InvalidTimeError)
      })

      it('should handle normal times correctly', () => {
        // Test a normal time that's not during any transition
        const normalTime = '2024-06-15T14:30:00'
        const zone = 'America/New_York'

        const result = interpretLocal(normalTime, zone, { disambiguation: 'reject' })
        expect(result.zone).toBe(zone)
        expect(result.isDST).toBe(true) // June is DST
      })

      it('should handle times in non-DST zones', () => {
        // Test zones that don't observe DST
        const time = '2024-03-10T02:30:00'
        const zone = 'Asia/Kathmandu' // Nepal doesn't use DST

        const result = interpretLocal(time, zone, { disambiguation: 'reject' })
        expect(result.zone).toBe(zone)
        expect(result.isDST).toBe(false)
      })

      it('should provide meaningful error messages', () => {
        const invalidTime = '2024-03-10T02:30:00'
        const ambiguousTime = '2024-11-03T01:30:00'
        const zone = 'America/New_York'

        try {
          interpretLocal(invalidTime, zone, { disambiguation: 'reject' })
        } catch (error) {
          expect(error).toBeInstanceOf(InvalidTimeError)
          expect((error as Error).message).toContain(invalidTime)
          expect((error as Error).message).toContain(zone)
        }

        try {
          interpretLocal(ambiguousTime, zone, { disambiguation: 'reject' })
        } catch (error) {
          expect(error).toBeInstanceOf(AmbiguousTimeError)
          expect((error as Error).message).toContain(ambiguousTime)
          expect((error as Error).message).toContain(zone)
        }
      })
    })

    describe('Default Disambiguation Behavior', () => {
      it('should use "latest" as default disambiguation', () => {
        const ambiguousTime = '2024-11-03T01:30:00'
        const zone = 'America/New_York'

        // Without explicit disambiguation option
        const defaultResult = interpretLocal(ambiguousTime, zone)

        // With explicit 'latest'
        const latestResult = interpretLocal(ambiguousTime, zone, { disambiguation: 'latest' })

        expect(defaultResult.utc).toBe(latestResult.utc)
        expect(defaultResult.isDST).toBe(latestResult.isDST)
      })
    })

    describe('Multiple Disambiguation Strategies', () => {
      const testCases: Array<{
        time: string
        zone: string
        type: 'invalid' | 'ambiguous'
        date: string
      }> = [
        {
          time: '2024-03-10T02:30:00',
          zone: 'America/New_York',
          type: 'invalid',
          date: 'US Spring Forward',
        },
        {
          time: '2024-11-03T01:30:00',
          zone: 'America/New_York',
          type: 'ambiguous',
          date: 'US Fall Back',
        },
        {
          time: '2024-03-31T02:30:00',
          zone: 'Europe/London',
          type: 'invalid',
          date: 'EU Spring Forward',
        },
        {
          time: '2024-10-27T02:30:00',
          zone: 'Europe/London',
          type: 'ambiguous',
          date: 'EU Fall Back',
        },
      ]

      testCases.forEach(({ time, zone, type, date }) => {
        it(`should handle ${type} time consistently for ${date}`, () => {
          const strategies: Disambiguation[] = ['earliest', 'latest']

          strategies.forEach(strategy => {
            const result = interpretLocal(time, zone, { disambiguation: strategy })
            expect(result.zone).toBe(zone)
            expect(result.source).toBe('system-intl')
            expect(typeof result.offsetMinutes).toBe('number')
            expect(typeof result.isDST).toBe('boolean')
            expect(result.utc).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
          })

          // 'reject' should always throw for problematic times
          expect(() => {
            interpretLocal(time, zone, { disambiguation: 'reject' })
          }).toThrow(type === 'invalid' ? InvalidTimeError : AmbiguousTimeError)
        })
      })
    })
  } // End conditional ambiguity tests
})
