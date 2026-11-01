/**
 * Engine-independent conversion between wall-clock times and instants.
 *
 * Uses the same approach as Temporal's GetPossibleEpochNanoseconds: the offsets
 * a day either side of the wall time bound every candidate instant, so each
 * candidate is checked by converting it back to wall time.
 */

import type { Disambiguation, TzEngine } from '../data/types.js'
import { AmbiguousTimeError, InvalidTimeError } from '../data/types.js'
import { offsetSecondsAt } from './zone.js'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Wall-clock milliseconds (wall time read as UTC) at an instant in a zone
 */
export function instantToWallMs(epochMs: number, zone: string, engine: TzEngine): number {
  return epochMs + offsetSecondsAt(epochMs, zone, engine) * 1000
}

/**
 * Every instant whose wall time in `zone` equals `wallMs`, in ascending order:
 * none for a skipped time, one normally, two for a repeated time.
 */
export function possibleInstants(wallMs: number, zone: string, engine: TzEngine): number[] {
  const offsetBefore = offsetSecondsAt(wallMs - DAY_MS, zone, engine)
  const offsetAfter = offsetSecondsAt(wallMs + DAY_MS, zone, engine)

  const candidates = new Set<number>()
  for (const offset of [offsetBefore, offsetAfter]) {
    const candidate = wallMs - offset * 1000
    if (instantToWallMs(candidate, zone, engine) === wallMs) {
      candidates.add(candidate)
    }
  }

  return [...candidates].sort((a, b) => a - b)
}

/**
 * Resolve a wall time in a zone to a single instant
 */
export function wallMsToInstant(
  wallMs: number,
  zone: string,
  engine: TzEngine,
  disambiguation: Disambiguation,
  label: string
): number {
  const candidates = possibleInstants(wallMs, zone, engine)

  if (candidates.length === 1) {
    return candidates[0]!
  }

  if (candidates.length > 1) {
    switch (disambiguation) {
      case 'reject': {
        throw new AmbiguousTimeError(label, zone)
      }
      case 'latest': {
        return candidates[candidates.length - 1]!
      }
      default: {
        return candidates[0]!
      }
    }
  }

  // Skipped wall time: measure the gap from the offsets either side of it
  if (disambiguation === 'reject') {
    throw new InvalidTimeError(label, zone)
  }

  const offsetBefore = offsetSecondsAt(wallMs - DAY_MS, zone, engine)
  const offsetAfter = offsetSecondsAt(wallMs + DAY_MS, zone, engine)

  // Read with the pre-gap offset, the wall time lands after the gap (pushed forward);
  // read with the post-gap offset, it lands before it (pulled back).
  const later = wallMs - offsetBefore * 1000
  const earlier = wallMs - offsetAfter * 1000

  return disambiguation === 'earliest' ? Math.min(earlier, later) : Math.max(earlier, later)
}
