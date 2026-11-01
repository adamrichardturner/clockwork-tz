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
 * A change of offset, DST or abbreviation in a zone, as returned by
 * {@link getNextTransition}, {@link getPreviousTransition} and {@link getTransitions}.
 */
export interface TransitionInfo {
  /** The instant of the transition */
  date: Date
  /** Offset from UTC before the transition, in minutes */
  fromOffset: number
  /** Offset from UTC from the transition onwards, in minutes */
  toOffset: number
  /** Whether DST starts here (clocks usually go forward) */
  isDSTStart: boolean
  /** Whether DST ends here (clocks usually go back) */
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
  timeoutId: ReturnType<typeof setTimeout> | undefined
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
 * The next DST or offset transition in a zone after an instant.
 *
 * Exact to the second with both engines: `embedded-tzdb` reads the tzdb,
 * `system-intl` samples each day and bisects.
 *
 * @param zone - An IANA zone.
 * @param from - Search after this instant (default: now).
 * @param engine - Engine to use (default: the current one).
 * @param searchDays - How far ahead to look (default about two years).
 * @returns The transition, or `null` if there's none in range, the zone has no
 *   DST (such as `Asia/Kolkata`) or is a fixed offset, or the zone is invalid.
 *
 * @example
 * ```ts
 * getNextTransition('Australia/Lord_Howe', '2024-07-15T14:00:00Z')?.date.toISOString() // '2024-10-05T15:30:00.000Z'
 * getNextTransition('Australia/Lord_Howe', '2024-07-15T14:00:00Z')?.toOffset // 660
 * ```
 *
 * @see {@link https://clockworktz.dev/docs/transitions | Transitions}
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
 * The most recent DST or offset transition in a zone at or before an instant.
 *
 * @param zone - An IANA zone.
 * @param from - Search at or before this instant (default: now).
 * @param engine - Engine to use (default: the current one).
 * @param searchDays - How far back to look (default about two years).
 * @returns The transition, or `null` if there's none in range or the zone is invalid.
 *
 * @example
 * ```ts
 * getPreviousTransition('Europe/London', '2024-07-01T00:00:00Z')?.date.toISOString() // '2024-03-31T01:00:00.000Z'
 * ```
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
 * Every DST or offset transition in a zone between two instants, in order.
 *
 * @param zone - An IANA zone.
 * @param from - Start of the range (inclusive).
 * @param to - End of the range (exclusive).
 * @param engine - Engine to use (default: the current one).
 * @returns The transitions; `[]` for an invalid zone or a fixed offset.
 *
 * @example
 * ```ts
 * getTransitions('Pacific/Chatham', '2024-01-01T00:00:00Z', '2025-01-01T00:00:00Z').map(t => t.date.toISOString()) // ['2024-04-06T14:00:00.000Z', '2024-09-28T14:00:00.000Z']
 * ```
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
 * Whether an instant is within `windowHours` of a transition in a zone, for
 * warning users about times that may be skipped or repeated.
 *
 * @param date - The instant to check.
 * @param zone - An IANA zone.
 * @param engine - Engine to use (default: the current one).
 * @param windowHours - How close counts as near (default `24`).
 * @returns `false` for invalid zones.
 *
 * @example
 * ```ts
 * isNearTransition('2024-03-10T12:00:00Z', 'America/New_York') // true
 * ```
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
 * Call `callback` immediately and then on every multiple of `granularityMs`
 * of wall-clock time (minimum 100ms), so a 1000ms clock ticks exactly on each
 * second instead of drifting.
 */
export function onTick(callback: (now: Date) => void, granularityMs: number = 1000): () => void {
  if (!Number.isFinite(granularityMs) || granularityMs < 100) {
    console.warn('Tick granularity below 100ms is clamped to 100ms')
    granularityMs = 100
  }

  const watcher = {
    callback,
    interval: granularityMs,
    timeoutId: undefined as ReturnType<typeof setTimeout> | undefined,
  }

  const schedule = () => {
    const delay = granularityMs - (Date.now() % granularityMs)
    watcher.timeoutId = setTimeout(() => {
      if (!activeTickWatchers.has(watcher)) {
        return
      }
      callback(new Date())
      schedule()
    }, delay)
  }

  activeTickWatchers.add(watcher)
  callback(new Date())
  schedule()

  return () => {
    clearTimeout(watcher.timeoutId)
    activeTickWatchers.delete(watcher)
  }
}

/**
 * Stop every watcher started by {@link watchZoneTransitions} and {@link onTick},
 * for example in test teardown or on shutdown.
 */
export function cleanupAllWatchers(): void {
  for (const cleanup of activeWatchers) {
    cleanup()
  }
  activeWatchers.clear()

  for (const watcher of activeTickWatchers) {
    clearTimeout(watcher.timeoutId)
  }
  activeTickWatchers.clear()
}

/**
 * How many {@link watchZoneTransitions} and {@link onTick} watchers are running.
 *
 * @example
 * ```ts
 * getWatcherStats() // { transitionWatchers: 0, tickWatchers: 0 }
 * ```
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
