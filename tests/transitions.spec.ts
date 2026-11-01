import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cleanupAllWatchers,
  getNextTransition,
  getPreviousTransition,
  getTransitions,
  getWatcherStats,
  isNearTransition,
  onTick,
  watchZoneTransitions,
} from '../src/index.js'
import { ENGINES } from './helpers.js'

describe.each(ENGINES)('$name engine: transitions', ({ init }) => {
  beforeEach(init)
  afterEach(() => {
    cleanupAllWatchers()
    vi.useRealTimers()
  })

  it('finds the next DST start to the second', () => {
    const next = getNextTransition('America/New_York', '2024-01-01T00:00:00Z')
    expect(next).toMatchObject({
      fromOffset: -300,
      toOffset: -240,
      isDSTStart: true,
      isDSTEnd: false,
    })
    expect(next?.date.toISOString()).toBe('2024-03-10T07:00:00.000Z')
  })

  it('finds the previous transition', () => {
    const previous = getPreviousTransition('Europe/London', '2024-07-01T00:00:00Z')
    expect(previous?.date.toISOString()).toBe('2024-03-31T01:00:00.000Z')
    expect(previous?.isDSTStart).toBe(true)
  })

  it('handles 30-minute transitions', () => {
    const next = getNextTransition('Australia/Lord_Howe', '2024-07-15T14:00:00Z')
    expect(next?.date.toISOString()).toBe('2024-10-05T15:30:00.000Z')
    expect(next).toMatchObject({ fromOffset: 630, toOffset: 660 })
  })

  it('lists every transition in a range', () => {
    const transitions = getTransitions(
      'Pacific/Chatham',
      '2024-01-01T00:00:00Z',
      '2025-01-01T00:00:00Z'
    )
    expect(transitions.map(t => t.date.toISOString())).toEqual([
      '2024-04-06T14:00:00.000Z',
      '2024-09-28T14:00:00.000Z',
    ])
  })

  it('finds transitions far in the future', () => {
    const transitions = getTransitions(
      'America/New_York',
      '2100-01-01T00:00:00Z',
      '2101-01-01T00:00:00Z'
    )
    expect(transitions.map(t => t.date.toISOString())).toEqual([
      '2100-03-14T07:00:00.000Z',
      '2100-11-07T06:00:00.000Z',
    ])
  })

  it('finds the skipped day in Samoa', () => {
    const [transition] = getTransitions(
      'Pacific/Apia',
      '2011-12-29T00:00:00Z',
      '2011-12-31T00:00:00Z'
    )
    expect(transition?.date.toISOString()).toBe('2011-12-30T10:00:00.000Z')
    expect(transition?.toOffset).toBe(840)
  })

  it('reports none for zones without DST', () => {
    expect(getNextTransition('Asia/Kolkata', '2024-01-01T00:00:00Z')).toBeNull()
    expect(getNextTransition('+05:30', '2024-01-01T00:00:00Z')).toBeNull()
    expect(getNextTransition('Not/AZone')).toBeNull()
  })

  it('detects proximity to a transition', () => {
    expect(isNearTransition('2024-03-10T12:00:00Z', 'America/New_York')).toBe(true)
    expect(isNearTransition('2024-06-10T12:00:00Z', 'America/New_York')).toBe(false)
  })

  it('fires watchers at the transition', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    vi.setSystemTime(new Date('2024-03-10T06:59:00Z'))
    const seen: string[] = []
    const stop = watchZoneTransitions('America/New_York', at => seen.push(at.toISOString()))
    expect(getWatcherStats().transitionWatchers).toBe(1)

    vi.advanceTimersByTime(2 * 60 * 1000)
    expect(seen).toEqual(['2024-03-10T07:00:00.000Z'])

    stop()
    expect(getWatcherStats().transitionWatchers).toBe(0)
  })

  it('re-arms watchers for transitions beyond the timer limit', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    vi.setSystemTime(new Date('2024-07-01T00:00:00Z'))
    const seen: string[] = []
    watchZoneTransitions('America/New_York', at => seen.push(at.toISOString()))
    vi.advanceTimersByTime(130 * 86_400_000)
    expect(seen).toEqual(['2024-11-03T06:00:00.000Z'])
  })

  it('ticks immediately and on an interval', () => {
    vi.useFakeTimers()
    let ticks = 0
    const stop = onTick(() => ticks++, 1000)
    vi.advanceTimersByTime(3000)
    stop()
    vi.advanceTimersByTime(3000)
    expect(ticks).toBe(4)
  })
})
