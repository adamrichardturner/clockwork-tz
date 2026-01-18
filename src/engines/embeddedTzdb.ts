/**
 * Embedded TZDB engine - deterministic timezone calculations using IANA data
 *
 * This engine provides deterministic timezone calculations by using a specific
 * version of the IANA timezone database, ensuring consistent behavior across
 * different platforms and over time.
 */

import type {
  TzEngine,
  ClockworkTime,
  Disambiguation,
  ListOptions,
  TimeZoneItem,
} from '../data/types.js'
import { TimezoneError, AmbiguousTimeError, InvalidTimeError } from '../data/types.js'
import type {
  TzdbData,
  ParsedTzdbData,
  ParsedZone,
  ParsedTransition,
  TzdbCalculationResult,
  TimeAmbiguityInfo,
} from '../data/tzdbStructures.js'
import { parseLocalISOString, componentsToDate, formatAsUTC, formatAsLocalISO } from '../utils/iso.js'

/**
 * Embedded TZDB engine for deterministic timezone calculations
 *
 * This engine provides deterministic results by using a specific version
 * of the IANA timezone database, ensuring consistent behavior across
 * different platforms and over time.
 */
export class EmbeddedTzdbEngine implements TzEngine {
  readonly kind = 'embedded-tzdb' as const

  private tzdbVersion?: string | undefined
  private parsedData?: ParsedTzdbData
  private userTimezone?: string
  private tzdbData?: unknown

  constructor(tzdbData?: unknown, version?: string | undefined) {
    this.tzdbVersion = version
    if (tzdbData) {
      this.tzdbData = tzdbData
      this.parsedData = this.parseTzdbData(tzdbData as TzdbData)
    }
  }

  getVersion(): string | undefined {
    return this.tzdbVersion
  }

  isValidTimeZone(zone: string): boolean {
    if (!this.parsedData) {
      return false
    }
    
    // Check both canonical zones and aliases
    return this.parsedData.identifiers.has(zone)
  }

  getUserTimeZone(): string {
    if (this.userTimezone) {
      return this.userTimezone
    }

    try {
      this.userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
      return this.userTimezone
    } catch {
      this.userTimezone = 'UTC'
      return this.userTimezone
    }
  }

  fromUTC(utc: Date, zone: string): ClockworkTime {
    if (!this.parsedData) {
      throw new TimezoneError('TZDB data not loaded')
    }

    const parsedZone = this.getCanonicalZone(zone)
    if (!parsedZone) {
      throw new TimezoneError(`Unknown timezone: ${zone}`)
    }

    const utcTimestamp = utc.getTime()
    const calculation = this.calculateOffset(utcTimestamp, parsedZone)
    
    const localTimestamp = utcTimestamp + calculation.offsetMinutes * 60 * 1000
    const localDate = new Date(localTimestamp)
    
    const localISO = formatAsLocalISO(localDate)

    const result: ClockworkTime = {
      utc: formatAsUTC(utc),
      zone,
      local: localISO,
      offsetMinutes: calculation.offsetMinutes,
      isDST: calculation.isDst,
      source: 'embedded-tzdb',
    }

    if (this.tzdbVersion) {
      result.tzdbVersion = this.tzdbVersion
    }

    return result
  }

  interpretLocal(localISO: string, zone: string, disambiguation: Disambiguation): ClockworkTime {
    if (!this.parsedData) {
      throw new TimezoneError('TZDB data not loaded')
    }

    const parsedZone = this.getCanonicalZone(zone)
    if (!parsedZone) {
      throw new TimezoneError(`Unknown timezone: ${zone}`)
    }

    const components = parseLocalISOString(localISO)
    const localDate = componentsToDate(components)
    const localTimestamp = localDate.getTime()

    const ambiguityInfo = this.checkAmbiguity(localTimestamp, parsedZone)

    if (ambiguityInfo.isInvalid) {
      if (disambiguation === 'reject') {
        throw new InvalidTimeError(localISO, zone)
      }

      const suggestedTimestamp =
        disambiguation === 'earliest'
          ? ambiguityInfo.suggestedTime!.earliest.getTime()
          : ambiguityInfo.suggestedTime!.latest.getTime()
      
      return this.fromUTC(new Date(suggestedTimestamp), zone)
    }

    if (ambiguityInfo.isAmbiguous) {
      if (disambiguation === 'reject') {
        throw new AmbiguousTimeError(localISO, zone)
      }

      const interpretation =
        disambiguation === 'earliest'
          ? ambiguityInfo.interpretations!.earlier
          : ambiguityInfo.interpretations!.later

      const utcTimestamp = localTimestamp - interpretation.offsetMinutes * 60 * 1000
      return this.fromUTC(new Date(utcTimestamp), zone)
    }

    const calculation = this.calculateOffsetForLocal(localTimestamp, parsedZone)
    const utcTimestamp = localTimestamp - calculation.offsetMinutes * 60 * 1000

    return this.fromUTC(new Date(utcTimestamp), zone)
  }

  getOffset(time: Date, zone: string): number {
    if (!this.parsedData) {
      throw new TimezoneError('TZDB data not loaded')
    }

    const parsedZone = this.getCanonicalZone(zone)
    if (!parsedZone) {
      throw new TimezoneError(`Unknown timezone: ${zone}`)
    }

    const timestamp = time.getTime()
    const calculation = this.calculateOffset(timestamp, parsedZone)
    return calculation.offsetMinutes
  }

  isDST(time: Date, zone: string): boolean {
    if (!this.parsedData) {
      return false
    }

    const parsedZone = this.getCanonicalZone(zone)
    if (!parsedZone) {
      return false
    }

    const timestamp = time.getTime()
    const calculation = this.calculateOffset(timestamp, parsedZone)
    return calculation.isDst
  }

  listTimeZones(options: ListOptions = {}): TimeZoneItem[] {
    if (!this.parsedData) {
      return []
    }

    const { labelStyle = 'original' } = options
    const now = Date.now()
    const result: TimeZoneItem[] = []

    for (const [zoneName, parsedZone] of this.parsedData.zones) {
      const calculation = this.calculateOffset(now, parsedZone)
      
      let label = zoneName
      if (labelStyle === 'offset') {
        const offsetHours = Math.floor(Math.abs(calculation.offsetMinutes) / 60)
        const offsetMins = Math.abs(calculation.offsetMinutes) % 60
        const sign = calculation.offsetMinutes >= 0 ? '+' : '-'
        label = `${zoneName} (UTC${sign}${String(offsetHours).padStart(2, '0')}:${String(offsetMins).padStart(2, '0')})`
      } else if (labelStyle === 'abbrev') {
        label = `${zoneName} (${calculation.abbreviation})`
      }

      result.push({
        value: zoneName,
        label,
        offsetMinutes: calculation.offsetMinutes,
      })
    }

    return result.sort((a, b) => a.value.localeCompare(b.value))
  }

  format(time: Date, zone: string, pattern: string): string {
    const result = this.fromUTC(time, zone)
    
    if (pattern === 'yyyy-MM-dd HH:mm:ss') {
      return result.local
    }

    const localDate = new Date(time.getTime() + result.offsetMinutes * 60 * 1000)
    
    return pattern
      .replace('yyyy', String(localDate.getUTCFullYear()))
      .replace('MM', String(localDate.getUTCMonth() + 1).padStart(2, '0'))
      .replace('dd', String(localDate.getUTCDate()).padStart(2, '0'))
      .replace('HH', String(localDate.getUTCHours()).padStart(2, '0'))
      .replace('mm', String(localDate.getUTCMinutes()).padStart(2, '0'))
      .replace('ss', String(localDate.getUTCSeconds()).padStart(2, '0'))
      .replace('z', zone)
      .replace('Z', this.formatOffset(result.offsetMinutes))
  }

  async loadTzdbData(data: unknown, version: string): Promise<void> {
    this.tzdbData = data
    this.tzdbVersion = version
    this.parsedData = this.parseTzdbData(data as TzdbData)
  }

  getTzdbData(): unknown {
    return this.tzdbData
  }

  isDataLoaded(): boolean {
    return this.tzdbData != null && this.tzdbVersion != null
  }

  private parseTzdbData(data: TzdbData): ParsedTzdbData {
    const zones = new Map<string, ParsedZone>()
    const aliases = new Map<string, string>()
    const identifiers = new Set<string>()

    for (const [zoneName, zoneData] of Object.entries(data.zones)) {
      identifiers.add(zoneName)
      
      const transitions: ParsedTransition[] = zoneData.transitions.map((trans, index) => {
        const prevTrans = index > 0 ? zoneData.transitions[index - 1] : null
        
        let createsGap = false
        let createsOverlap = false
        let gapOverlapMinutes = 0

        if (prevTrans) {
          const offsetChange = trans.rule.offsetMinutes - prevTrans.rule.offsetMinutes
          const dstChange = (trans.rule.dstOffsetMinutes ?? 0) - (prevTrans.rule.dstOffsetMinutes ?? 0)
          const totalChange = offsetChange + dstChange

          if (totalChange > 0) {
            createsGap = true
            gapOverlapMinutes = totalChange
          } else if (totalChange < 0) {
            createsOverlap = true
            gapOverlapMinutes = Math.abs(totalChange)
          }
        }

        const totalOffset = trans.rule.offsetMinutes + (trans.rule.dstOffsetMinutes ?? 0)
        const localTimestamp = trans.timestamp + totalOffset * 60 * 1000

        return {
          timestamp: trans.timestamp,
          rule: trans.rule,
          type: trans.type,
          localTimestamp,
          createsGap,
          createsOverlap,
          gapOverlapMinutes,
        }
      })

      const parsedZone: ParsedZone = {
        name: zoneName,
        transitions,
        displayNames: zoneData.displayNames ?? {},
      }

      if (transitions.length > 0) {
        const first = transitions[0]
        const last = transitions[transitions.length - 1]
        if (first) {
          parsedZone.earliestTransition = first.timestamp
        }
        if (last) {
          parsedZone.latestTransition = last.timestamp
        }
      }

      zones.set(zoneName, parsedZone)
    }

    for (const [alias, target] of Object.entries(data.links)) {
      aliases.set(alias, target)
      identifiers.add(alias)
    }

    return {
      version: data.version,
      zones,
      aliases,
      identifiers,
      metadata: data.metadata,
      leapSeconds: data.leapSeconds ?? [],
    }
  }

  private getCanonicalZone(zone: string): ParsedZone | undefined {
    if (!this.parsedData) {
      return undefined
    }

    let canonicalName = zone
    if (this.parsedData.aliases.has(zone)) {
      canonicalName = this.parsedData.aliases.get(zone)!
    }

    return this.parsedData.zones.get(canonicalName)
  }

  private calculateOffset(utcTimestamp: number, zone: ParsedZone): TzdbCalculationResult {
    if (zone.transitions.length === 0) {
      return {
        offsetMinutes: 0,
        isDst: false,
        abbreviation: 'UTC',
      }
    }

    // Convert timestamp to seconds for comparison with transition timestamps
    const utcSeconds = Math.floor(utcTimestamp / 1000)

    let applicableTransition: ParsedTransition = zone.transitions[0]!
    
    for (let i = zone.transitions.length - 1; i >= 0; i--) {
      const trans = zone.transitions[i]
      if (trans && trans.timestamp <= utcSeconds) {
        applicableTransition = trans
        break
      }
    }

    const currentIndex = zone.transitions.indexOf(applicableTransition)
    const nextTransitionIndex = currentIndex + 1
    const nextTransition = nextTransitionIndex < zone.transitions.length
      ? zone.transitions[nextTransitionIndex]
      : undefined

    const totalOffset = applicableTransition.rule.offsetMinutes + (applicableTransition.rule.dstOffsetMinutes ?? 0)

    const result: TzdbCalculationResult = {
      offsetMinutes: totalOffset,
      isDst: applicableTransition.rule.isDst,
      abbreviation: applicableTransition.rule.abbreviation,
    }

    result.transition = applicableTransition
    if (nextTransition) {
      result.nextTransition = nextTransition
    }

    return result
  }

  private calculateOffsetForLocal(localTimestamp: number, zone: ParsedZone): TzdbCalculationResult {
    if (zone.transitions.length === 0) {
      return {
        offsetMinutes: 0,
        isDst: false,
        abbreviation: 'UTC',
      }
    }

    for (let i = zone.transitions.length - 1; i >= 0; i--) {
      const trans = zone.transitions[i]
      if (trans && trans.localTimestamp <= localTimestamp) {
        const nextTransitionIndex = i + 1
        const nextTransition = nextTransitionIndex < zone.transitions.length
          ? zone.transitions[nextTransitionIndex]
          : undefined

        const totalOffset = trans.rule.offsetMinutes + (trans.rule.dstOffsetMinutes ?? 0)

        const result: TzdbCalculationResult = {
          offsetMinutes: totalOffset,
          isDst: trans.rule.isDst,
          abbreviation: trans.rule.abbreviation,
        }

        if (trans) {
          result.transition = trans
        }
        if (nextTransition) {
          result.nextTransition = nextTransition
        }

        return result
      }
    }

    const firstTrans = zone.transitions[0]
    if (!firstTrans) {
      return {
        offsetMinutes: 0,
        isDst: false,
        abbreviation: 'UTC',
      }
    }

    const totalOffset = firstTrans.rule.offsetMinutes + (firstTrans.rule.dstOffsetMinutes ?? 0)

    const result: TzdbCalculationResult = {
      offsetMinutes: totalOffset,
      isDst: firstTrans.rule.isDst,
      abbreviation: firstTrans.rule.abbreviation,
    }

    if (firstTrans) {
      result.transition = firstTrans
    }

    return result
  }

  private checkAmbiguity(localTimestamp: number, zone: ParsedZone): TimeAmbiguityInfo {
    for (const trans of zone.transitions) {
      if (trans.createsGap) {
        const gapStart = trans.localTimestamp - trans.gapOverlapMinutes! * 60 * 1000
        const gapEnd = trans.localTimestamp

        if (localTimestamp >= gapStart && localTimestamp < gapEnd) {
          return {
            isAmbiguous: false,
            isInvalid: true,
            suggestedTime: {
              earliest: new Date(trans.timestamp),
              latest: new Date(trans.timestamp + trans.gapOverlapMinutes! * 60 * 1000),
            },
          }
        }
      }

      if (trans.createsOverlap) {
        const overlapStart = trans.localTimestamp
        const overlapEnd = trans.localTimestamp + trans.gapOverlapMinutes! * 60 * 1000

        if (localTimestamp >= overlapStart && localTimestamp < overlapEnd) {
          const prevIndex = zone.transitions.indexOf(trans) - 1
          const prevTrans = prevIndex >= 0 ? zone.transitions[prevIndex] : trans
          
          if (prevTrans) {
            const earlierOffset = prevTrans.rule.offsetMinutes + (prevTrans.rule.dstOffsetMinutes ?? 0)
            const laterOffset = trans.rule.offsetMinutes + (trans.rule.dstOffsetMinutes ?? 0)

            return {
              isAmbiguous: true,
              isInvalid: false,
              interpretations: {
                earlier: {
                  offsetMinutes: earlierOffset,
                  isDst: prevTrans.rule.isDst,
                  abbreviation: prevTrans.rule.abbreviation,
                },
                later: {
                  offsetMinutes: laterOffset,
                  isDst: trans.rule.isDst,
                  abbreviation: trans.rule.abbreviation,
                },
              },
            }
          }
        }
      }
    }

    return {
      isAmbiguous: false,
      isInvalid: false,
    }
  }

  private formatOffset(offsetMinutes: number): string {
    const sign = offsetMinutes >= 0 ? '+' : '-'
    const absMinutes = Math.abs(offsetMinutes)
    const hours = Math.floor(absMinutes / 60)
    const minutes = absMinutes % 60
    return `${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
  }
}

/**
 * Create and return a new EmbeddedTzdb engine instance
 */
export function createEmbeddedTzdbEngine(tzdbData?: unknown, version?: string): EmbeddedTzdbEngine {
  return new EmbeddedTzdbEngine(tzdbData, version)
}
