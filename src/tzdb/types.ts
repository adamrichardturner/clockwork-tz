/**
 * Compact timezone data format produced by scripts/build-tzdb.ts
 */

/**
 * One zone, compiled from a slim TZif file
 */
export interface CompactZone {
  /** Transition times in seconds, base36, comma-separated: first absolute, then deltas */
  t: string
  /** Local time type index in effect from each transition, one base36 digit each */
  i: string
  /** Local time types: [UT offset in seconds, isDST 0|1, abbreviation]; type 0 applies before the first transition */
  y: Array<[number, 0 | 1, string]>
  /** POSIX TZ string for instants after the last transition ('' when absent) */
  f: string
}

/**
 * A complete tzdb release
 */
export interface TzdbData {
  /** IANA release, e.g. "2026a" */
  version: string
  /** Zones by canonical identifier */
  zones: Record<string, CompactZone>
  /** Alias identifier to canonical zone identifier */
  links: Record<string, string>
  /** Identifiers suitable for user-facing lists (zone1970.tab plus UTC) */
  listed: string[]
  /** ISO 3166 country codes per zone, from zone1970.tab */
  countries?: Record<string, string[]>
}
