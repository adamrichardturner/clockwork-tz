/**
 * Timezone transition detection and watching
 */

import type { DateInput, Transition, TzEngine, ZoneInfo } from './data/types.js'
import { getEngine } from './core/state.js'
import { isFixedOffsetZone, isValidZone, zoneInfoAt } from './core/zone.js'
import { normalizeToDate } from './utils/iso.js'

const DAY_MS = 24 * 60 * 60 * 1000
const MAX_TIMEOUT_MS = 2 ** 31 - 1
const DEFAULT_SEARCH_DAYS = 2 * 366

/**
 * Public description of a transition
 */
export interface TransitionInfo {
  /** Instant of the transition */
  date: Date
  /** Offset before the transition, in minutes */
  fromOffset: number
  /** Offset from the transition onwards, in minutes */
  toOffset: number
  /** Whether DST starts at this transition */
  isDSTStart: boolean
  /** Whether DST ends at this transition */
  isDSTEnd: boolean
  /** Abbreviation before the transition */
  fromAbbreviation: string
  /** Abbreviation from the transition onwards */
  toAbbreviation: string
}

/**
 * Active watchers for cleanup
 */
const activeWatchers = new Set<() => void>()

/**
 * Active tick watchers
 */
const activeTickWatchers = new Set<{
  callback: (now: Date) => void
  interval: number
  timeoutId: ReturnType<typeof setInterval>
}>()

function sameInfo(a: ZoneInfo, b: ZoneInfo): boolean {
  return (
    a.offsetSeconds === b.offsetSeconds && a.isDST === b.isDST && a.abbreviation === b.abbreviation
  )
}

/**
 * Binary search for the first second in (lo, hi] whose info differs from `before`
 */
function bisect(
  lo: number,
  hi: number,
  zone: string,
  engine: TzEngine,
  before: ZoneInfo
): Transition {
  lo = Math.floor(lo / 1000) * 1000
  hi = Math.ceil(hi / 1000) * 1000
  while (hi - lo > 1000) {
    const mid = lo + Math.floor((hi - lo) / 2000) * 1000
    if (sameInfo(zoneInfoAt(mid, zone, engine), before)) {
      lo = mid
    } else {
      hi = mid
    }
  }
  return { at: hi, before, after: zoneInfoAt(hi, zone, engine) }
}

/**
 * All transitions in [fromMs, toMs). Exact when the engine knows its
 * transitions; otherwise found by daily sampling and bisection to the second.
 */
export function findTransitions(
  zone: string,
  fromMs: number,
  toMs: number,
  engine: TzEngine = getEngine()
): Transition[] {
  if (isFixedOffsetZone(zone) || toMs <= fromMs) {
    return []
  }
  if (engine.getTransitions) {
    return engine.getTransitions(zone, fromMs, toMs)
  }

  const transitions: Transition[] = []
  let prevMs = fromMs
  let prevInfo = zoneInfoAt(prevMs, zone, engine)
  while (prevMs < toMs) {
    const nextMs = Math.min(prevMs + DAY_MS, toMs)
    const nextInfo = zoneInfoAt(nextMs, zone, engine)
    if (!sameInfo(prevInfo, nextInfo)) {
      // There may be more than one change in the window; walk them in order
      let cursor = prevMs
      let cursorInfo = prevInfo
      while (!sameInfo(cursorInfo, nextInfo)) {
        const transition = bisect(cursor, nextMs, zone, engine, cursorInfo)
        if (transition.at > fromMs && transition.at < toMs) {
          transitions.push(transition)
        }
        cursor = transition.at
        cursorInfo = transition.after
      }
    }
    prevMs = nextMs
    prevInfo = nextInfo
  }
  return transitions
}

function toInfo(transition: Transition): TransitionInfo {
  return {
    date: new Date(transition.at),
    fromOffset: transition.before.offsetSeconds / 60,
    toOffset: transition.after.offsetSeconds / 60,
    isDSTStart: !transition.before.isDST && transition.after.isDST,
    isDSTEnd: transition.before.isDST && !transition.after.isDST,
    fromAbbreviation: transition.before.abbreviation,
    toAbbreviation: transition.after.abbreviation,
  }
}

function nextTransition(zone: string, fromMs: number, engine: TzEngine, days: number) {
  return findTransitions(zone, fromMs + 1, fromMs + days * DAY_MS, engine).find(t => t.at > fromMs)
}

/**
 * Get information about the next timezone transition after `from`
 */
export function getNextTransition(
  zone: string,
  from: DateInput = new Date(),
  engine: TzEngine = getEngine(),
  searchDays = DEFAULT_SEARCH_DAYS
): TransitionInfo | null {
  if (!isValidZone(zone, engine)) {
    return null
  }
  const fromMs = normalizeToDate(from).getTime()
  const transition = nextTransition(zone, fromMs, engine, searchDays)
  return transition ? toInfo(transition) : null
}

/**
 * Get information about the most recent transition at or before `from`
 */
export function getPreviousTransition(
  zone: string,
  from: DateInput = new Date(),
  engine: TzEngine = getEngine(),
  searchDays = DEFAULT_SEARCH_DAYS
): TransitionInfo | null {
  if (!isValidZone(zone, engine)) {
    return null
  }
  const fromMs = normalizeToDate(from).getTime()
  const transitions = findTransitions(zone, fromMs - searchDays * DAY_MS, fromMs + 1, engine)
  const last = transitions[transitions.length - 1]
  return last ? toInfo(last) : null
}

/**
 * List every transition between two instants
 */
export function getTransitions(
  zone: string,
  from: DateInput,
  to: DateInput,
  engine: TzEngine = getEngine()
): TransitionInfo[] {
  if (!isValidZone(zone, engine)) {
    return []
  }
  return findTransitions(
    zone,
    normalizeToDate(from).getTime(),
    normalizeToDate(to).getTime(),
    engine
  ).map(toInfo)
}

/**
 * Check if a date is within `windowHours` of a timezone transition
 */
export function isNearTransition(
  date: DateInput,
  zone: string,
  engine: TzEngine = getEngine(),
  windowHours: number = 24
): boolean {
  if (!isValidZone(zone, engine)) {
    return false
  }
  const ms = normalizeToDate(date).getTime()
  const windowMs = windowHours * 60 * 60 * 1000
  return findTransitions(zone, ms - windowMs, ms + windowMs, engine).length > 0
}

/**
 * Watch for timezone transitions in a specific zone and call `callback` just
 * after each one happens.
 */
export function watchZoneTransitions(
  zone: string,
  callback: (at: Date) => void,
  engine: TzEngine = getEngine()
): () => void {
  if (!isValidZone(zone, engine)) {
    console.warn(`Invalid timezone "${zone}" for transition watching`)
    return () => {}
  }

  let isActive = true
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  const schedule = (delay: number, fn: () => void) => {
    timeoutId = setTimeout(fn, Math.min(Math.max(0, delay), MAX_TIMEOUT_MS))
    ;(timeoutId as { unref?: () => void }).unref?.()
  }

  const scheduleNext = () => {
    if (!isActive) {
      return
    }
    const now = Date.now()
    const transition = nextTransition(zone, now, engine, DEFAULT_SEARCH_DAYS)

    if (!transition) {
      schedule(DAY_MS, scheduleNext)
      return
    }

    const waitUntil = () => {
      if (!isActive) {
        return
      }
      const remaining = transition.at - Date.now()
      if (remaining > 0) {
        // Timers cap out around 24.8 days; re-arm until the transition arrives
        schedule(remaining + 1000, waitUntil)
        return
      }
      callback(new Date(transition.at))
      scheduleNext()
    }
    waitUntil()
  }

  scheduleNext()

  const cleanup = () => {
    isActive = false
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
    activeWatchers.delete(cleanup)
  }

  activeWatchers.add(cleanup)
  return cleanup
}

/**
 * Call `callback` immediately and then every `granularityMs` (minimum 100ms),
 * useful for updating clocks.
 */
export function onTick(callback: (now: Date) => void, granularityMs: number = 1000): () => void {
  if (granularityMs < 100) {
    console.warn('Tick granularity less than 100ms may impact performance')
    granularityMs = 100
  }

  const tick = () => {
    callback(new Date())
  }

  tick()

  const intervalId = setInterval(tick, granularityMs)

  const watcher = {
    callback,
    interval: granularityMs,
    timeoutId: intervalId,
  }

  activeTickWatchers.add(watcher)

  return () => {
    clearInterval(intervalId)
    activeTickWatchers.delete(watcher)
  }
}

/**
 * Cleanup all active watchers (useful for testing or app shutdown)
 */
export function cleanupAllWatchers(): void {
  for (const cleanup of activeWatchers) {
    cleanup()
  }
  activeWatchers.clear()

  for (const watcher of activeTickWatchers) {
    clearInterval(watcher.timeoutId)
  }
  activeTickWatchers.clear()
}

/**
 * Get statistics about active watchers
 */
export function getWatcherStats(): {
  transitionWatchers: number
  tickWatchers: number
} {
  return {
    transitionWatchers: activeWatchers.size,
    tickWatchers: activeTickWatchers.size,
  }
}
