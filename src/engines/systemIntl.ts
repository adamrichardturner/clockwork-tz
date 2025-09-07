/**
 * System Intl engine implementation using platform Intl API and date-fns-tz
 */

import { formatInTimeZone, toZonedTime, fromZonedTime } from 'date-fns-tz'
import type {
  TzEngine,
  ClockworkTime,
  Disambiguation,
  ListOptions,
  TimeZoneItem,
} from '../data/types.js'
import { TimezoneError, AmbiguousTimeError, InvalidTimeError } from '../data/types.js'
import { parseLocalISOString, componentsToDate, formatAsUTC } from '../utils/iso.js'

/**
 * System Intl timezone engine using platform APIs
 */
export class SystemIntlEngine implements TzEngine {
  readonly kind = 'system-intl' as const

  getVersion(): string | undefined {
    // System Intl doesn't have a version
    return undefined
  }

  isValidTimeZone(zone: string): boolean {
    try {
      // Try to create a DateTimeFormat with the zone
      new Intl.DateTimeFormat('en', { timeZone: zone })
      return true
    } catch {
      return false
    }
  }

  getUserTimeZone(): string {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone
    } catch {
      // Fallback for older environments
      return 'UTC'
    }
  }

  fromUTC(utc: Date, zone: string): ClockworkTime {
    if (!this.isValidTimeZone(zone)) {
      throw new TimezoneError(`Invalid timezone: ${zone}`)
    }

    const offsetMinutes = this.getOffset(utc, zone)
    const isDST = this.isDST(utc, zone)
    const local = formatInTimeZone(utc, zone, 'yyyy-MM-dd HH:mm:ss.SSS')

    return {
      utc: formatAsUTC(utc),
      zone,
      local,
      offsetMinutes,
      isDST,
      source: this.kind,
    }
  }

  interpretLocal(localISO: string, zone: string, disambiguation: Disambiguation): ClockworkTime {
    if (!this.isValidTimeZone(zone)) {
      throw new TimezoneError(`Invalid timezone: ${zone}`)
    }

    try {
      const components = parseLocalISOString(localISO)
      const localDate = componentsToDate(components)

      // Check for invalid time (spring forward gap)
      const utcFromLocal = fromZonedTime(localDate, zone)
      const backToLocal = toZonedTime(utcFromLocal, zone)

      // If the round trip doesn't match, we have an invalid or ambiguous time
      const originalMs = localDate.getTime()
      const roundTripMs = backToLocal.getTime()

      if (Math.abs(originalMs - roundTripMs) > 1000) {
        // Check if it's invalid (spring forward) or ambiguous (fall back)
        const hourBefore = new Date(localDate.getTime() - 60 * 60 * 1000)
        const hourAfter = new Date(localDate.getTime() + 60 * 60 * 1000)

        try {
          const utcBefore = fromZonedTime(hourBefore, zone)
          const utcAfter = fromZonedTime(hourAfter, zone)
          const offsetBefore = this.getOffset(utcBefore, zone)
          const offsetAfter = this.getOffset(utcAfter, zone)

          if (offsetBefore !== offsetAfter) {
            // We're in a transition period
            if (offsetBefore < offsetAfter) {
              // Spring forward - invalid time
              if (disambiguation === 'reject') {
                throw new InvalidTimeError(localISO, zone)
              }
              // Use the time after the gap
              const adjustedLocal = new Date(
                localDate.getTime() + (offsetAfter - offsetBefore) * 60 * 1000
              )
              return this.fromUTC(fromZonedTime(adjustedLocal, zone), zone)
            } else {
              // Fall back - ambiguous time
              if (disambiguation === 'reject') {
                throw new AmbiguousTimeError(localISO, zone)
              }

              // For ambiguous times, we need to choose between two possible UTC times
              const earlierUtc = new Date(
                utcFromLocal.getTime() - Math.abs(offsetBefore - offsetAfter) * 60 * 1000
              )
              const laterUtc = utcFromLocal

              const targetUtc = disambiguation === 'earliest' ? earlierUtc : laterUtc
              return this.fromUTC(targetUtc, zone)
            }
          }
        } catch {
          // If we can't determine the transition, fall back to the original interpretation
        }
      }

      return this.fromUTC(utcFromLocal, zone)
    } catch (error) {
      if (error instanceof InvalidTimeError || error instanceof AmbiguousTimeError) {
        throw error
      }
      throw new TimezoneError(
        `Failed to interpret local time "${localISO}" in zone "${zone}": ${error}`
      )
    }
  }

  getOffset(time: Date, zone: string): number {
    if (!this.isValidTimeZone(zone)) {
      throw new TimezoneError(`Invalid timezone: ${zone}`)
    }

    try {
      // Use formatInTimeZone to get the local time, then compare with UTC
      const zonedTime = toZonedTime(time, zone)
      const utcTime = time

      // Calculate offset in minutes
      const offsetMs = zonedTime.getTime() - utcTime.getTime()
      return Math.round(offsetMs / (60 * 1000))
    } catch {
      // Fallback: try using Intl.DateTimeFormat with shortOffset
      try {
        const formatter = new Intl.DateTimeFormat('en', {
          timeZone: zone,
          timeZoneName: 'shortOffset',
        })

        const parts = formatter.formatToParts(time)
        const offsetPart = parts.find(part => part.type === 'timeZoneName')

        if (offsetPart?.value) {
          return this.parseOffsetString(offsetPart.value)
        }
      } catch {
        // Final fallback - return 0
      }

      return 0
    }
  }

  isDST(time: Date, zone: string): boolean {
    if (!this.isValidTimeZone(zone)) {
      return false
    }

    try {
      // Compare offset with January (assumed standard time)
      const january = new Date(time.getFullYear(), 0, 1)
      const currentOffset = this.getOffset(time, zone)
      const winterOffset = this.getOffset(january, zone)

      // DST typically means a higher offset (more positive)
      return currentOffset > winterOffset
    } catch {
      return false
    }
  }

  listTimeZones(options: ListOptions = {}): TimeZoneItem[] {
    const { labelStyle = 'original', forZone } = options

    // Get common timezone identifiers
    const commonZones = this.getCommonTimeZones()
    const now = new Date()

    return commonZones
      .map(zone => {
        const offsetMinutes = this.getOffset(now, zone)
        const label = this.formatZoneLabel(zone, offsetMinutes, labelStyle, forZone)

        return {
          value: zone,
          label,
          offsetMinutes,
        }
      })
      .sort((a, b) => {
        // Sort by offset, then by name
        if (a.offsetMinutes !== b.offsetMinutes) {
          return a.offsetMinutes - b.offsetMinutes
        }
        return a.value.localeCompare(b.value)
      })
  }

  format(time: Date, zone: string, pattern: string): string {
    if (!this.isValidTimeZone(zone)) {
      throw new TimezoneError(`Invalid timezone: ${zone}`)
    }

    try {
      return formatInTimeZone(time, zone, pattern)
    } catch (error) {
      throw new TimezoneError(`Failed to format time in zone "${zone}": ${error}`)
    }
  }

  private parseOffsetString(offsetStr: string): number {
    // Parse offset strings like "+10:30", "-05:00", "GMT+5"
    const match = offsetStr.match(/([+-])(\d{1,2}):?(\d{2})?/)
    if (!match) {
      return 0
    }

    const [, sign, hours, minutes = '0'] = match
    const offsetMinutes = parseInt(hours!, 10) * 60 + parseInt(minutes ?? '0', 10)
    return sign === '+' ? offsetMinutes : -offsetMinutes
  }

  private formatZoneLabel(
    zone: string,
    offsetMinutes: number,
    style: string,
    _forZone?: string
  ): string {
    const offsetHours = Math.floor(Math.abs(offsetMinutes) / 60)
    const offsetMins = Math.abs(offsetMinutes) % 60
    const offsetSign = offsetMinutes >= 0 ? '+' : '-'
    const offsetStr = `${offsetSign}${offsetHours.toString().padStart(2, '0')}:${offsetMins.toString().padStart(2, '0')}`

    switch (style) {
      case 'offset': {
        return `(UTC${offsetStr}) ${zone}`
      }
      case 'abbrev': {
        try {
          const formatter = new Intl.DateTimeFormat('en', {
            timeZone: zone,
            timeZoneName: 'short',
          })
          const parts = formatter.formatToParts(new Date())
          const abbrev = parts.find(part => part.type === 'timeZoneName')?.value
          return abbrev ? `${zone} (${abbrev})` : zone
        } catch {
          return zone
        }
      }
      case 'altName': {
        try {
          const formatter = new Intl.DateTimeFormat('en', {
            timeZone: zone,
            timeZoneName: 'long',
          })
          const parts = formatter.formatToParts(new Date())
          const longName = parts.find(part => part.type === 'timeZoneName')?.value
          return longName && longName !== zone ? `${zone} (${longName})` : zone
        } catch {
          return zone
        }
      }
      default: {
        return zone
      }
    }
  }

  private getCommonTimeZones(): string[] {
    // Return a curated list of common timezone identifiers
    return [
      'UTC',
      'America/New_York',
      'America/Chicago',
      'America/Denver',
      'America/Los_Angeles',
      'America/Anchorage',
      'Pacific/Honolulu',
      'America/St_Johns',
      'America/Halifax',
      'America/Toronto',
      'America/Winnipeg',
      'America/Edmonton',
      'America/Vancouver',
      'Europe/London',
      'Europe/Paris',
      'Europe/Berlin',
      'Europe/Rome',
      'Europe/Madrid',
      'Europe/Amsterdam',
      'Europe/Brussels',
      'Europe/Zurich',
      'Europe/Vienna',
      'Europe/Prague',
      'Europe/Warsaw',
      'Europe/Stockholm',
      'Europe/Oslo',
      'Europe/Copenhagen',
      'Europe/Helsinki',
      'Europe/Moscow',
      'Europe/Kiev',
      'Europe/Istanbul',
      'Europe/Athens',
      'Asia/Tokyo',
      'Asia/Seoul',
      'Asia/Shanghai',
      'Asia/Hong_Kong',
      'Asia/Singapore',
      'Asia/Bangkok',
      'Asia/Jakarta',
      'Asia/Manila',
      'Asia/Taipei',
      'Asia/Kuala_Lumpur',
      'Asia/Kolkata',
      'Asia/Dubai',
      'Asia/Karachi',
      'Asia/Dhaka',
      'Asia/Kathmandu',
      'Asia/Colombo',
      'Australia/Sydney',
      'Australia/Melbourne',
      'Australia/Brisbane',
      'Australia/Perth',
      'Australia/Adelaide',
      'Australia/Darwin',
      'Australia/Lord_Howe',
      'Australia/Eucla',
      'Pacific/Auckland',
      'Pacific/Fiji',
      'Pacific/Chatham',
      'Pacific/Tahiti',
      'Pacific/Marquesas',
      'Pacific/Pitcairn',
      'Africa/Cairo',
      'Africa/Lagos',
      'Africa/Johannesburg',
      'Africa/Nairobi',
      'Africa/Casablanca',
      'America/Sao_Paulo',
      'America/Argentina/Buenos_Aires',
      'America/Santiago',
      'America/Lima',
      'America/Bogota',
      'America/Caracas',
      'America/Mexico_City',
      'America/Guatemala',
      'America/Jamaica',
    ]
  }
}

/**
 * Create and return a new SystemIntl engine instance
 */
export function createSystemIntlEngine(): SystemIntlEngine {
  return new SystemIntlEngine()
}
