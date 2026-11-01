/**
 * Timezone transition detection and watching
 */

import type { TzEngine } from './data/types.js'

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
  timeoutId: ReturnType<typeof setTimeout>
}>()

/**
 * Watch for timezone transitions in a specific zone
 *
 * This function detects when a timezone transitions (DST changes)
 * and calls the callback at the exact moment of transition.
 */
export function watchZoneTransitions(
  zone: string,
  callback: (at: Date) => void,
  engine?: TzEngine
): () => void {
  if (!engine) {
    console.warn('No engine provided to watchZoneTransitions, cannot detect transitions')
    return () => {}
  }

  if (!engine.isValidTimeZone(zone)) {
    console.warn(`Invalid timezone "${zone}" for transition watching`)
    return () => {}
  }

  let isActive = true
  let currentTimeoutId: ReturnType<typeof setTimeout> | null = null

  const scheduleNextCheck = () => {
    if (!isActive) {
      return
    }

    const now = new Date()
    const nextTransition = findNextTransition(now, zone, engine)

    if (nextTransition) {
      const msUntilTransition = nextTransition.getTime() - now.getTime()

      // Schedule callback slightly after the transition
      const callbackDelay = Math.max(0, msUntilTransition + 1000) // +1 second buffer

      currentTimeoutId = setTimeout(() => {
        if (!isActive) {
          return
        }

        callback(nextTransition)
        scheduleNextCheck() // Schedule next transition
      }, callbackDelay)
    } else {
      // No transition found, check again in 24 hours
      currentTimeoutId = setTimeout(scheduleNextCheck, 24 * 60 * 60 * 1000)
    }
  }

  // Start watching
  scheduleNextCheck()

  // Return cleanup function
  const cleanup = () => {
    isActive = false
    if (currentTimeoutId) {
      clearTimeout(currentTimeoutId)
      currentTimeoutId = null
    }
    activeWatchers.delete(cleanup)
  }

  activeWatchers.add(cleanup)
  return cleanup
}

/**
 * Find the next timezone transition after the given date
 */
function findNextTransition(from: Date, zone: string, engine: TzEngine): Date | null {
  try {
    const currentOffset = engine.getOffset(from, zone)
    const searchStart = new Date(from.getTime())

    // Search forward in weekly increments to find offset change
    const searchDate = new Date(searchStart.getTime())
    const maxSearchWeeks = 104 // Search up to 2 years ahead

    for (let week = 0; week < maxSearchWeeks; week++) {
      searchDate.setTime(searchStart.getTime() + week * 7 * 24 * 60 * 60 * 1000)

      const searchOffset = engine.getOffset(searchDate, zone)
      if (searchOffset !== currentOffset) {
        // Found a transition, now binary search to find exact time
        return binarySearchTransition(
          new Date(searchStart.getTime() + (week - 1) * 7 * 24 * 60 * 60 * 1000),
          searchDate,
          zone,
          engine,
          currentOffset
        )
      }
    }

    return null
  } catch (error) {
    console.warn(`Failed to find next transition for zone "${zone}":`, error)
    return null
  }
}

/**
 * Binary search to find the exact transition time within a range
 */
function binarySearchTransition(
  start: Date,
  end: Date,
  zone: string,
  engine: TzEngine,
  expectedStartOffset: number
): Date | null {
  try {
    let left = start.getTime()
    let right = end.getTime()
    const precision = 60 * 1000 // 1 minute precision

    while (right - left > precision) {
      const mid = Math.floor((left + right) / 2)
      const midDate = new Date(mid)
      const midOffset = engine.getOffset(midDate, zone)

      if (midOffset === expectedStartOffset) {
        left = mid
      } else {
        right = mid
      }
    }

    // Return the transition point
    return new Date(right)
  } catch (error) {
    console.warn(`Failed to binary search transition for zone "${zone}":`, error)
    return null
  }
}

/**
 * Watch for regular time ticks
 *
 * This function calls the callback at regular intervals, useful for
 * updating clocks or other time-dependent UI elements.
 */
export function onTick(callback: (now: Date) => void, granularityMs: number = 1000): () => void {
  if (granularityMs < 100) {
    console.warn('Tick granularity less than 100ms may impact performance')
    granularityMs = 100
  }

  const tick = () => {
    callback(new Date())
  }

  // Start with immediate tick
  tick()

  // Schedule recurring ticks
  const intervalId = setInterval(tick, granularityMs)

  const watcher = {
    callback,
    interval: granularityMs,
    timeoutId: intervalId,
  }

  activeTickWatchers.add(watcher)

  // Return cleanup function
  const cleanup = () => {
    clearInterval(intervalId)
    activeTickWatchers.delete(watcher)
  }

  return cleanup
}

/**
 * Get information about the next timezone transition
 */
export function getNextTransition(
  zone: string,
  from: Date = new Date(),
  engine?: TzEngine
): {
  date: Date
  fromOffset: number
  toOffset: number
  isDSTStart: boolean
} | null {
  if (!engine) {
    return null
  }

  if (!engine.isValidTimeZone(zone)) {
    return null
  }

  try {
    const currentOffset = engine.getOffset(from, zone)
    const transitionDate = findNextTransition(from, zone, engine)

    if (!transitionDate) {
      return null
    }

    const newOffset = engine.getOffset(transitionDate, zone)
    const isDSTStart = newOffset > currentOffset

    return {
      date: transitionDate,
      fromOffset: currentOffset,
      toOffset: newOffset,
      isDSTStart,
    }
  } catch (error) {
    console.warn(`Failed to get next transition for zone "${zone}":`, error)
    return null
  }
}

/**
 * Get information about the previous timezone transition
 */
export function getPreviousTransition(
  zone: string,
  from: Date = new Date(),
  engine?: TzEngine
): {
  date: Date
  fromOffset: number
  toOffset: number
  isDSTStart: boolean
} | null {
  if (!engine) {
    return null
  }

  if (!engine.isValidTimeZone(zone)) {
    return null
  }

  try {
    const currentOffset = engine.getOffset(from, zone)
    const searchStart = new Date(from.getTime())

    // Search backward in weekly increments to find offset change
    const searchDate = new Date(searchStart.getTime())
    const maxSearchWeeks = 104 // Search up to 2 years back

    for (let week = 1; week <= maxSearchWeeks; week++) {
      searchDate.setTime(searchStart.getTime() - week * 7 * 24 * 60 * 60 * 1000)

      const searchOffset = engine.getOffset(searchDate, zone)
      if (searchOffset !== currentOffset) {
        // Found a transition, now binary search to find exact time
        const transitionDate = binarySearchTransition(
          searchDate,
          new Date(searchStart.getTime() - (week - 1) * 7 * 24 * 60 * 60 * 1000),
          zone,
          engine,
          searchOffset
        )

        if (transitionDate) {
          const isDSTStart = currentOffset > searchOffset

          return {
            date: transitionDate,
            fromOffset: searchOffset,
            toOffset: currentOffset,
            isDSTStart,
          }
        }
      }
    }

    return null
  } catch (error) {
    console.warn(`Failed to get previous transition for zone "${zone}":`, error)
    return null
  }
}

/**
 * Check if a date is near a timezone transition (within 24 hours)
 */
export function isNearTransition(
  date: Date,
  zone: string,
  engine?: TzEngine,
  windowHours: number = 24
): boolean {
  if (!engine?.isValidTimeZone(zone)) {
    return false
  }

  try {
    const windowMs = windowHours * 60 * 60 * 1000
    const before = new Date(date.getTime() - windowMs)
    const after = new Date(date.getTime() + windowMs)

    const offsetBefore = engine.getOffset(before, zone)
    const offsetAt = engine.getOffset(date, zone)
    const offsetAfter = engine.getOffset(after, zone)

    return offsetBefore !== offsetAt || offsetAt !== offsetAfter
  } catch {
    return false
  }
}

/**
 * Cleanup all active watchers (useful for testing or app shutdown)
 */
export function cleanupAllWatchers(): void {
  // Clean up transition watchers
  for (const cleanup of activeWatchers) {
    try {
      cleanup()
    } catch (error) {
      console.warn('Error cleaning up transition watcher:', error)
    }
  }
  activeWatchers.clear()

  // Clean up tick watchers
  for (const watcher of activeTickWatchers) {
    try {
      clearInterval(watcher.timeoutId)
    } catch (error) {
      console.warn('Error cleaning up tick watcher:', error)
    }
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
