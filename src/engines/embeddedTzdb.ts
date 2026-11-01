/**
 * Embedded TZDB engine: deterministic results from a specific IANA tzdb
 * release, independent of the platform's ICU data.
 */

import type { LoadableEngine, Transition, ZoneInfo } from '../data/types.js'
import { TimezoneError } from '../data/types.js'
import type { CompactZone, TzdbData } from '../tzdb/types.js'
import { parsePosixTz, posixTransitions, posixZoneInfo, type PosixTz } from '../tzdb/posixTz.js'

interface ZoneRecord {
  /** Transition instants in epoch ms, ascending */
  times: number[]
  /** ZoneInfo in effect from each transition */
  infos: ZoneInfo[]
  /** ZoneInfo before the first transition */
  initial: ZoneInfo
  /** Rule for instants after the last transition */
  footer: PosixTz | null
}

function isCompactZone(value: unknown): value is CompactZone {
  const zone = value as Partial<CompactZone> | null
  return (
    typeof zone === 'object' &&
    zone !== null &&
    typeof zone.t === 'string' &&
    typeof zone.i === 'string' &&
    Array.isArray(zone.y) &&
    zone.y.length > 0 &&
    typeof zone.f === 'string'
  )
}

/**
 * Whether a value has the shape of clockworktz tzdb data. Zone contents are
 * checked when each zone is first used.
 */
export function isTzdbData(value: unknown): value is TzdbData {
  const data = value as Partial<TzdbData> | null
  return (
    typeof data === 'object' &&
    data !== null &&
    typeof data.version === 'string' &&
    typeof data.zones === 'object' &&
    data.zones !== null &&
    typeof data.links === 'object' &&
    data.links !== null &&
    Array.isArray(data.listed)
  )
}

function decodeZone(name: string, zone: unknown): ZoneRecord {
  if (!isCompactZone(zone)) {
    throw new TimezoneError(`Malformed timezone data for ${name}`)
  }

  const types: ZoneInfo[] = zone.y.map(([offsetSeconds, isDST, abbreviation]) => ({
    offsetSeconds,
    isDST: isDST === 1,
    abbreviation,
  }))

  const times: number[] = []
  const infos: ZoneInfo[] = []
  if (zone.t) {
    let seconds = 0
    zone.t.split(',').forEach((part, index) => {
      const value = parseInt(part, 36)
      seconds = index === 0 ? value : seconds + value
      const info = types[parseInt(zone.i[index] ?? '', 36)]
      if (!info || Number.isNaN(value)) {
        throw new TimezoneError(`Malformed transition data for ${name}`)
      }
      times.push(seconds * 1000)
      infos.push(info)
    })
  }

  return { times, infos, initial: types[0]!, footer: parsePosixTz(zone.f) }
}

function sameInfo(a: ZoneInfo, b: ZoneInfo): boolean {
  return (
    a.offsetSeconds === b.offsetSeconds && a.isDST === b.isDST && a.abbreviation === b.abbreviation
  )
}

/**
 * An engine backed by a compiled IANA tzdb release, for identical results on
 * every platform: exact DST flags and abbreviations, local mean time before
 * standardization, every transition, and rules past 2100.
 *
 * Zones are decoded on first use. Links (`US/Eastern`) and lookups are
 * case-insensitive.
 *
 * Usually created for you by `initClockworkTZ({ engine: 'embedded-tzdb', data: tzdb })`.
 */
export class EmbeddedTzdbEngine implements LoadableEngine {
  readonly kind = 'embedded-tzdb' as const

  private data: TzdbData | null = null
  private records = new Map<string, ZoneRecord>()
  /** Lower-cased identifier to canonical zone name */
  private lookup = new Map<string, string>()
  /** Lower-cased identifier to the listed spelling users know (e.g. "UTC") */
  private listedNames = new Map<string, string>()

  constructor(data?: unknown) {
    if (data !== undefined) {
      this.loadTzdbData(data)
    }
  }

  /** The loaded tzdb release, such as `'2026f'`, or `undefined` before data is loaded */
  getVersion(): string | undefined {
    return this.data?.version
  }

  /**
   * Replace the engine's data, for example with a newer release.
   *
   * @throws {@link TimezoneError} if `data` isn't valid clockworktz tzdb data;
   *   the current data is kept.
   */
  loadTzdbData(data: unknown): void {
    if (!isTzdbData(data)) {
      throw new TimezoneError('Invalid timezone data: expected clockworktz tzdb JSON')
    }
    const lookup = new Map<string, string>()
    for (const zone of Object.keys(data.zones)) {
      lookup.set(zone.toLowerCase(), zone)
    }
    for (const [alias, target] of Object.entries(data.links)) {
      if (target in data.zones) {
        lookup.set(alias.toLowerCase(), target)
      }
    }
    this.data = data
    this.lookup = lookup
    this.listedNames = new Map(data.listed.map(zone => [zone.toLowerCase(), zone]))
    this.records = new Map()
  }

  /** Whether tzdb data has been loaded */
  isDataLoaded(): boolean {
    return this.data !== null
  }

  /** Whether the loaded data has a zone or link with this name (case-insensitive) */
  isValidTimeZone(zone: string): boolean {
    return typeof zone === 'string' && this.lookup.has(zone.toLowerCase())
  }

  /** The canonical name of a zone: links resolve, and listed names keep their spelling (`'utc'` → `'UTC'`) */
  canonicalize(zone: string): string {
    const key = String(zone).toLowerCase()
    const canonical = this.lookup.get(key)
    if (!canonical) {
      throw new TimezoneError(this.data ? `Invalid timezone: ${zone}` : this.noDataMessage())
    }
    // Present listed identifiers as listed: "utc" -> "UTC" rather than "Etc/UTC"
    return this.listedNames.get(key) ?? canonical
  }

  /** ISO 3166 codes of the countries using a zone, from `zone1970.tab` */
  getCountryCodes(zone: string): string[] {
    this.record(zone)
    const canonical = this.lookup.get(String(zone).toLowerCase())!
    return [...(this.data?.countries?.[canonical] ?? [])]
  }

  /** The zones in `zone1970.tab`, plus `UTC`: one per region, for pickers */
  listZoneIds(): string[] {
    return this.data ? [...this.data.listed] : []
  }

  /** The offset, DST flag and abbreviation in effect in `zone` at `epochMs` */
  getZoneInfo(epochMs: number, zone: string): ZoneInfo {
    const record = this.record(zone)
    const { times, infos } = record

    if (times.length === 0 || epochMs < times[0]!) {
      if (times.length === 0 && record.footer) {
        return posixZoneInfo(record.footer, epochMs)
      }
      return record.initial
    }

    const last = times.length - 1
    if (epochMs >= times[last]! && record.footer) {
      return posixZoneInfo(record.footer, epochMs)
    }

    // Last transition at or before epochMs
    let lo = 0
    let hi = last
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (times[mid]! <= epochMs) {
        lo = mid
      } else {
        hi = mid - 1
      }
    }
    return infos[lo]!
  }

  /** Every transition in [`fromMs`, `toMs`), from the tzdb table and its POSIX rule */
  getTransitions(zone: string, fromMs: number, toMs: number): Transition[] {
    const record = this.record(zone)
    const result: Transition[] = []
    let before = this.getZoneInfo(fromMs - 1, zone)

    const push = (at: number, after: ZoneInfo) => {
      if (at >= fromMs && at < toMs && !sameInfo(before, after)) {
        result.push({ at, before, after })
      }
      if (at >= fromMs && at < toMs) {
        before = after
      }
    }

    record.times.forEach((at, index) => push(at, record.infos[index]!))

    const lastTable = record.times[record.times.length - 1] ?? -Infinity
    if (record.footer && toMs > lastTable) {
      const fromYear = new Date(
        Math.max(fromMs, lastTable === -Infinity ? fromMs : lastTable)
      ).getUTCFullYear()
      const toYear = new Date(toMs).getUTCFullYear() + 1
      for (const transition of posixTransitions(record.footer, fromYear - 1, toYear)) {
        if (transition.at > lastTable) {
          push(transition.at, transition.info)
        }
      }
    }

    return result
  }

  private noDataMessage(): string {
    return 'No timezone data loaded: pass `data` (e.g. from "clockworktz/tzdb") or a manifestURL to initClockworkTZ'
  }

  private record(zone: string): ZoneRecord {
    if (!this.data) {
      throw new TimezoneError(this.noDataMessage())
    }
    const canonical = this.lookup.get(String(zone).toLowerCase())
    if (!canonical) {
      throw new TimezoneError(`Invalid timezone: ${zone}`)
    }
    let record = this.records.get(canonical)
    if (!record) {
      record = decodeZone(canonical, this.data.zones[canonical])
      this.records.set(canonical, record)
    }
    return record
  }
}

/**
 * Create an {@link EmbeddedTzdbEngine}, optionally with data already loaded.
 *
 * @param data - tzdb data, usually `tzdb` from `'clockworktz/tzdb'`.
 * @throws {@link TimezoneError} if `data` isn't valid clockworktz tzdb data.
 *
 * @example
 * ```ts
 * import { createEmbeddedTzdbEngine } from 'clockworktz'
 * import { tzdb } from 'clockworktz/tzdb'
 *
 * const engine = createEmbeddedTzdbEngine(tzdb)
 * engine.getVersion() // '2026f'
 * ```
 */
export function createEmbeddedTzdbEngine(data?: unknown): EmbeddedTzdbEngine {
  return new EmbeddedTzdbEngine(data)
}
