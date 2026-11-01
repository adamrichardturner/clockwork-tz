/**
 * Exact offsets for zones that break naive timezone code. Values are UT
 * offsets in minutes and hold for every tzdb release since 2018.
 */

export interface OffsetFixture {
  zone: string
  at: string
  offsetMinutes: number
  isDST?: boolean
  note: string
  /** Only checked on the embedded engine (ICU history or flags differ) */
  embeddedOnly?: boolean
}

export const OFFSET_FIXTURES: OffsetFixture[] = [
  {
    zone: 'Australia/Lord_Howe',
    at: '2024-01-15T00:00:00Z',
    offsetMinutes: 660,
    isDST: true,
    note: '30-minute DST, summer',
  },
  {
    zone: 'Australia/Lord_Howe',
    at: '2024-07-15T00:00:00Z',
    offsetMinutes: 630,
    isDST: false,
    note: '+10:30 standard',
  },
  {
    zone: 'Pacific/Chatham',
    at: '2024-01-15T00:00:00Z',
    offsetMinutes: 825,
    isDST: true,
    note: '+13:45 DST',
  },
  {
    zone: 'Pacific/Chatham',
    at: '2024-07-15T00:00:00Z',
    offsetMinutes: 765,
    isDST: false,
    note: '+12:45 standard',
  },
  {
    zone: 'Australia/Eucla',
    at: '2024-01-15T00:00:00Z',
    offsetMinutes: 525,
    isDST: false,
    note: 'unofficial +8:45',
  },
  {
    zone: 'Asia/Kathmandu',
    at: '2024-07-15T00:00:00Z',
    offsetMinutes: 345,
    isDST: false,
    note: '+5:45',
  },
  {
    zone: 'Asia/Kolkata',
    at: '2024-07-15T00:00:00Z',
    offsetMinutes: 330,
    isDST: false,
    note: '+5:30',
  },
  {
    zone: 'Pacific/Marquesas',
    at: '2024-07-15T00:00:00Z',
    offsetMinutes: -570,
    isDST: false,
    note: '-9:30',
  },
  {
    zone: 'Pacific/Kiritimati',
    at: '2024-07-15T00:00:00Z',
    offsetMinutes: 840,
    isDST: false,
    note: '+14, furthest ahead',
  },
  {
    zone: 'America/St_Johns',
    at: '2024-01-15T12:00:00Z',
    offsetMinutes: -210,
    isDST: false,
    note: '-3:30 standard',
  },
  {
    zone: 'America/St_Johns',
    at: '2024-07-15T12:00:00Z',
    offsetMinutes: -150,
    isDST: true,
    note: '-2:30 DST',
  },
  {
    zone: 'Pacific/Apia',
    at: '2011-12-29T10:00:00Z',
    offsetMinutes: -600,
    isDST: true,
    note: 'before skipping 30 Dec 2011',
  },
  {
    zone: 'Pacific/Apia',
    at: '2011-12-30T10:00:00Z',
    offsetMinutes: 840,
    isDST: true,
    note: 'after crossing the date line',
  },
  {
    zone: 'Africa/Casablanca',
    at: '2024-03-20T12:00:00Z',
    offsetMinutes: 0,
    note: 'Ramadan suspends +01',
  },
  {
    zone: 'Africa/Casablanca',
    at: '2024-07-15T12:00:00Z',
    offsetMinutes: 60,
    note: '+01 outside Ramadan',
  },
  {
    zone: 'Europe/Dublin',
    at: '2024-01-15T12:00:00Z',
    offsetMinutes: 0,
    isDST: false,
    note: 'negative DST in vanguard data',
  },
  {
    zone: 'Europe/Dublin',
    at: '2024-07-15T12:00:00Z',
    offsetMinutes: 60,
    isDST: true,
    note: 'IST',
  },
  {
    zone: 'Antarctica/Troll',
    at: '2024-01-15T12:00:00Z',
    offsetMinutes: 0,
    isDST: false,
    note: 'UTC in winter',
  },
  {
    zone: 'Antarctica/Troll',
    at: '2024-07-15T12:00:00Z',
    offsetMinutes: 120,
    isDST: true,
    note: 'two-hour DST',
  },
  {
    zone: 'America/Caracas',
    at: '2016-04-30T12:00:00Z',
    offsetMinutes: -270,
    note: '-4:30 until May 2016',
  },
  {
    zone: 'America/Caracas',
    at: '2016-05-02T12:00:00Z',
    offsetMinutes: -240,
    note: '-4:00 from May 2016',
  },
  {
    zone: 'Asia/Pyongyang',
    at: '2015-08-14T12:00:00Z',
    offsetMinutes: 540,
    note: 'before Pyongyang Time',
  },
  {
    zone: 'Asia/Pyongyang',
    at: '2015-08-16T12:00:00Z',
    offsetMinutes: 510,
    note: 'Pyongyang Time +8:30',
  },
  {
    zone: 'Asia/Pyongyang',
    at: '2018-05-05T12:00:00Z',
    offsetMinutes: 540,
    note: 'back to +9 in 2018',
  },
  {
    zone: 'Etc/GMT+5',
    at: '2024-07-15T12:00:00Z',
    offsetMinutes: -300,
    note: 'POSIX-inverted sign',
  },
  {
    zone: 'Europe/Kiev',
    at: '2024-07-15T12:00:00Z',
    offsetMinutes: 180,
    isDST: true,
    note: 'renamed to Europe/Kyiv',
  },
  {
    zone: 'America/New_York',
    at: '2100-07-01T00:00:00Z',
    offsetMinutes: -240,
    isDST: true,
    note: 'far future, footer rule',
  },
  {
    zone: 'Australia/Sydney',
    at: '2100-01-15T00:00:00Z',
    offsetMinutes: 660,
    isDST: true,
    note: 'far future, southern footer',
  },
  {
    zone: 'Asia/Kolkata',
    at: '1850-01-01T00:00:00Z',
    offsetMinutes: 21208 / 60,
    isDST: false,
    note: 'LMT +5:53:28',
    embeddedOnly: true,
  },
  {
    zone: 'America/New_York',
    at: '1880-01-01T00:00:00Z',
    offsetMinutes: -17762 / 60,
    isDST: false,
    note: 'LMT -4:56:02',
    embeddedOnly: true,
  },
  {
    zone: 'Africa/Casablanca',
    at: '2024-07-15T12:00:00Z',
    offsetMinutes: 60,
    isDST: true,
    note: 'tzdb DST flag',
    embeddedOnly: true,
  },
]
