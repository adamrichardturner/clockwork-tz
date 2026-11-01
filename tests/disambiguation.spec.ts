import { beforeEach, describe, expect, it } from 'vitest'
import {
  AmbiguousTimeError,
  InvalidTimeError,
  interpretLocal,
  TimezoneError,
  type Disambiguation,
} from '../src/index.js'
import { ENGINES } from './helpers.js'

interface Case {
  zone: string
  wall: string
  kind: 'gap' | 'overlap'
  expected: Record<Exclude<Disambiguation, 'reject'>, string>
}

const CASES: Case[] = [
  {
    zone: 'America/New_York',
    wall: '2024-03-10T02:30:00',
    kind: 'gap',
    expected: {
      compatible: '2024-03-10T07:30:00.000Z',
      latest: '2024-03-10T07:30:00.000Z',
      earliest: '2024-03-10T06:30:00.000Z',
    },
  },
  {
    zone: 'America/New_York',
    wall: '2024-11-03T01:30:00',
    kind: 'overlap',
    expected: {
      compatible: '2024-11-03T05:30:00.000Z',
      earliest: '2024-11-03T05:30:00.000Z',
      latest: '2024-11-03T06:30:00.000Z',
    },
  },
  {
    zone: 'Europe/London',
    wall: '2024-03-31T01:30:00',
    kind: 'gap',
    expected: {
      compatible: '2024-03-31T01:30:00.000Z',
      latest: '2024-03-31T01:30:00.000Z',
      earliest: '2024-03-31T00:30:00.000Z',
    },
  },
  {
    zone: 'Australia/Lord_Howe',
    wall: '2024-04-07T01:45:00',
    kind: 'overlap',
    expected: {
      compatible: '2024-04-06T14:45:00.000Z',
      earliest: '2024-04-06T14:45:00.000Z',
      latest: '2024-04-06T15:15:00.000Z',
    },
  },
  {
    zone: 'Australia/Lord_Howe',
    wall: '2024-10-06T02:15:00',
    kind: 'gap',
    expected: {
      compatible: '2024-10-05T15:45:00.000Z',
      latest: '2024-10-05T15:45:00.000Z',
      earliest: '2024-10-05T15:15:00.000Z',
    },
  },
  {
    zone: 'Pacific/Chatham',
    wall: '2024-09-29T03:00:00',
    kind: 'gap',
    expected: {
      compatible: '2024-09-28T14:15:00.000Z',
      latest: '2024-09-28T14:15:00.000Z',
      earliest: '2024-09-28T13:15:00.000Z',
    },
  },
  {
    zone: 'Pacific/Apia',
    wall: '2011-12-30T12:00:00',
    kind: 'gap',
    expected: {
      compatible: '2011-12-30T22:00:00.000Z',
      latest: '2011-12-30T22:00:00.000Z',
      earliest: '2011-12-29T22:00:00.000Z',
    },
  },
]

describe.each(ENGINES)('$name engine: local time disambiguation', ({ init }) => {
  beforeEach(init)

  describe.each(CASES)('$zone $wall ($kind)', ({ zone, wall, kind, expected }) => {
    it.each(Object.entries(expected))('%s -> %s', (disambiguation, utc) => {
      const result = interpretLocal(wall, zone, {
        disambiguation: disambiguation as Disambiguation,
      })
      expect(result.utc).toBe(utc)
    })

    it('reject throws', () => {
      const ErrorType = kind === 'gap' ? InvalidTimeError : AmbiguousTimeError
      expect(() => interpretLocal(wall, zone, { disambiguation: 'reject' })).toThrow(ErrorType)
    })
  })

  it('defaults to compatible', () => {
    expect(interpretLocal('2024-11-03T01:30:00', 'America/New_York').utc).toBe(
      '2024-11-03T05:30:00.000Z'
    )
  })

  it('resolves unambiguous times exactly', () => {
    const result = interpretLocal('2024-07-15T09:00:00', 'Asia/Kathmandu', {
      disambiguation: 'reject',
    })
    expect(result.utc).toBe('2024-07-15T03:15:00.000Z')
    expect(result.local).toBe('2024-07-15 09:00:00.000')
  })

  it('accepts a space separator, minutes-only and fractional seconds', () => {
    expect(interpretLocal('2024-07-15 09:00', 'UTC').utc).toBe('2024-07-15T09:00:00.000Z')
    expect(interpretLocal('2024-07-15T09:00:00.123456', 'UTC').utc).toBe('2024-07-15T09:00:00.123Z')
  })

  it('rejects malformed or impossible local times', () => {
    expect(() => interpretLocal('2024-02-30T10:00:00', 'UTC')).toThrow(TimezoneError)
    expect(() => interpretLocal('2024-07-15T10:00:00Z', 'UTC')).toThrow(TimezoneError)
    expect(() => interpretLocal('yesterday', 'UTC')).toThrow(TimezoneError)
  })
})
