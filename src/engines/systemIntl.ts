/**
 * System Intl engine: timezone data comes from the platform's Intl API
 * (ICU in Node and browsers). No dependencies and no data to ship.
 */

import type { TzEngine, ZoneInfo } from '../data/types.js'
import { TimezoneError } from '../data/types.js'

/**
 * Curated fallback list for runtimes without Intl.supportedValuesOf
 */
const FALLBACK_ZONES = [
  'UTC',
  'Africa/Cairo',
  'Africa/Casablanca',
  'Africa/Johannesburg',
  'Africa/Lagos',
  'Africa/Nairobi',
  'America/Anchorage',
  'America/Argentina/Buenos_Aires',
  'America/Bogota',
  'America/Caracas',
  'America/Chicago',
  'America/Denver',
  'America/Halifax',
  'America/Lima',
  'America/Los_Angeles',
  'America/Mexico_City',
  'America/New_York',
  'America/Santiago',
  'America/Sao_Paulo',
  'America/St_Johns',
  'America/Toronto',
  'America/Vancouver',
  'Asia/Bangkok',
  'Asia/Colombo',
  'Asia/Dhaka',
  'Asia/Dubai',
  'Asia/Hong_Kong',
  'Asia/Jakarta',
  'Asia/Karachi',
  'Asia/Kathmandu',
  'Asia/Kolkata',
  'Asia/Seoul',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Asia/Tehran',
  'Asia/Tokyo',
  'Australia/Adelaide',
  'Australia/Brisbane',
  'Australia/Darwin',
  'Australia/Eucla',
  'Australia/Lord_Howe',
  'Australia/Perth',
  'Australia/Sydney',
  'Europe/Amsterdam',
  'Europe/Athens',
  'Europe/Berlin',
  'Europe/Dublin',
  'Europe/Istanbul',
  'Europe/London',
  'Europe/Madrid',
  'Europe/Moscow',
  'Europe/Paris',
  'Pacific/Apia',
  'Pacific/Auckland',
  'Pacific/Chatham',
  'Pacific/Honolulu',
  'Pacific/Kiritimati',
  'Pacific/Marquesas',
]

/**
 * ICU (CLDR) keeps legacy spellings as canonical for some zones; map them to
 * the primary IANA identifiers so both engines agree on names.
 */
const CLDR_TO_IANA: Record<string, string> = {
  'Africa/Asmera': 'Africa/Asmara',
  'America/Buenos_Aires': 'America/Argentina/Buenos_Aires',
  'America/Catamarca': 'America/Argentina/Catamarca',
  'America/Coral_Harbour': 'America/Atikokan',
  'America/Cordoba': 'America/Argentina/Cordoba',
  'America/Godthab': 'America/Nuuk',
  'America/Indianapolis': 'America/Indiana/Indianapolis',
  'America/Jujuy': 'America/Argentina/Jujuy',
  'America/Louisville': 'America/Kentucky/Louisville',
  'America/Mendoza': 'America/Argentina/Mendoza',
  'Asia/Calcutta': 'Asia/Kolkata',
  'Asia/Katmandu': 'Asia/Kathmandu',
  'Asia/Rangoon': 'Asia/Yangon',
  'Asia/Saigon': 'Asia/Ho_Chi_Minh',
  'Atlantic/Faeroe': 'Atlantic/Faroe',
  'Europe/Kiev': 'Europe/Kyiv',
  'Pacific/Enderbury': 'Pacific/Kanton',
  'Pacific/Ponape': 'Pacific/Pohnpei',
  'Pacific/Truk': 'Pacific/Chuuk',
}

function toIana(zone: string): string {
  return CLDR_TO_IANA[zone] ?? zone
}

/** ISO 3166-1 alpha-2 region codes, used to ask Intl which zones each region uses */
const REGION_CODES =
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'

const MAX_CACHED_ZONES = 1024

/**
 * System Intl timezone engine using platform APIs
 */
export class SystemIntlEngine implements TzEngine {
  readonly kind = 'system-intl' as const

  private readonly wallFormatters = new Map<string, Intl.DateTimeFormat>()
  private readonly abbrevFormatters = new Map<string, Intl.DateTimeFormat>()
  private readonly validity = new Map<string, boolean>()
  private readonly standardOffsets = new Map<string, number>()
  private countries: Map<string, string[]> | null = null

  getVersion(): string | undefined {
    return undefined
  }

  isValidTimeZone(zone: string): boolean {
    if (typeof zone !== 'string' || zone.trim() === '') {
      return false
    }
    let valid = this.validity.get(zone)
    if (valid === undefined) {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: zone })
        valid = true
      } catch {
        valid = false
      }
      if (this.validity.size >= MAX_CACHED_ZONES) {
        this.validity.clear()
      }
      this.validity.set(zone, valid)
    }
    return valid
  }

  canonicalize(zone: string): string {
    this.assertValid(zone)
    return toIana(new Intl.DateTimeFormat('en-US', { timeZone: zone }).resolvedOptions().timeZone)
  }

  listZoneIds(): string[] {
    const supportedValuesOf = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] })
      .supportedValuesOf
    if (typeof supportedValuesOf === 'function') {
      try {
        const zones = new Set(supportedValuesOf('timeZone').map(toIana))
        zones.add('UTC')
        return [...zones].filter(zone => this.isValidTimeZone(zone))
      } catch {
        // Fall through to curated list
      }
    }
    return [...FALLBACK_ZONES]
  }

  /**
   * ISO country codes using a zone, from Intl.Locale#getTimeZones where the
   * runtime supports it (empty otherwise)
   */
  getCountryCodes(zone: string): string[] {
    this.assertValid(zone)
    if (!this.countries) {
      const countries = new Map<string, string[]>()
      for (const region of REGION_CODES.split(' ')) {
        let zones: string[] = []
        try {
          const locale = new Intl.Locale(`und-${region}`) as Intl.Locale & {
            getTimeZones?: () => string[] | undefined
            timeZones?: string[]
          }
          zones = locale.getTimeZones?.() ?? locale.timeZones ?? []
        } catch {
          // Region unknown to this runtime
        }
        for (const id of zones) {
          const key = toIana(id)
          countries.set(key, [...(countries.get(key) ?? []), region])
        }
      }
      this.countries = countries
    }
    return [...(this.countries.get(this.canonicalize(zone)) ?? [])]
  }

  getZoneInfo(epochMs: number, zone: string): ZoneInfo {
    this.assertValid(zone)
    const offsetSeconds = this.offsetSeconds(epochMs, zone)
    return {
      offsetSeconds,
      isDST: offsetSeconds > this.standardOffsetForYear(epochMs, zone),
      abbreviation: this.abbreviation(epochMs, zone),
    }
  }

  private assertValid(zone: string): void {
    if (!this.isValidTimeZone(zone)) {
      throw new TimezoneError(`Invalid timezone: ${zone}`)
    }
  }

  /**
   * Offset in seconds: wall time in the zone (read as UTC) minus the instant
   */
  private offsetSeconds(epochMs: number, zone: string): number {
    let formatter = this.wallFormatters.get(zone)
    if (!formatter) {
      if (this.wallFormatters.size >= MAX_CACHED_ZONES) {
        this.wallFormatters.clear()
      }
      formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: zone,
        hourCycle: 'h23',
        era: 'short',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
      })
      this.wallFormatters.set(zone, formatter)
    }

    const wholeSecond = Math.floor(epochMs / 1000) * 1000
    const fields: Record<string, string> = {}
    for (const part of formatter.formatToParts(wholeSecond)) {
      fields[part.type] = part.value
    }

    let year = parseInt(fields.year ?? '1970', 10)
    if (fields.era === 'BC' || fields.era === 'B') {
      year = 1 - year
    }
    const wall = new Date(0)
    wall.setUTCFullYear(
      year,
      parseInt(fields.month ?? '1', 10) - 1,
      parseInt(fields.day ?? '1', 10)
    )
    wall.setUTCHours(
      parseInt(fields.hour ?? '0', 10) % 24,
      parseInt(fields.minute ?? '0', 10),
      parseInt(fields.second ?? '0', 10),
      0
    )

    return Math.round((wall.getTime() - wholeSecond) / 1000)
  }

  /**
   * Standard offset for the zone's year: the smaller of the January and July
   * offsets. A heuristic, since Intl does not expose the DST flag; it treats
   * the summer offset as DST even for zones (Europe/Dublin, Africa/Casablanca)
   * whose tzdb rules model winter as negative DST.
   */
  private standardOffsetForYear(epochMs: number, zone: string): number {
    const year = new Date(epochMs).getUTCFullYear()
    const key = `${zone}|${year}`
    let standard = this.standardOffsets.get(key)
    if (standard === undefined) {
      const january = Date.UTC(year, 0, 1)
      const july = Date.UTC(year, 6, 1)
      standard = Math.min(this.offsetSeconds(january, zone), this.offsetSeconds(july, zone))
      if (this.standardOffsets.size > 4096) {
        this.standardOffsets.clear()
      }
      this.standardOffsets.set(key, standard)
    }
    return standard
  }

  private abbreviation(epochMs: number, zone: string): string {
    let formatter = this.abbrevFormatters.get(zone)
    if (!formatter) {
      if (this.abbrevFormatters.size >= MAX_CACHED_ZONES) {
        this.abbrevFormatters.clear()
      }
      formatter = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'short' })
      this.abbrevFormatters.set(zone, formatter)
    }
    const value = formatter.formatToParts(epochMs).find(p => p.type === 'timeZoneName')?.value
    if (!value) {
      return zone
    }
    // ICU spells unnamed offsets "GMT+5:45"; tzdb spells them "+0545"
    const match = /^GMT([+-])(\d{1,2})(?::(\d{2}))?$/.exec(value)
    if (match) {
      const [, sign, hours, minutes] = match
      return `${sign}${hours!.padStart(2, '0')}${minutes && minutes !== '00' ? minutes : ''}`
    }
    return value
  }
}

/**
 * Create and return a new SystemIntl engine instance
 */
export function createSystemIntlEngine(): SystemIntlEngine {
  return new SystemIntlEngine()
}
