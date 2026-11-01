/**
 * POSIX TZ string evaluation (with the RFC 9636 extensions used in TZif
 * footers: hours up to 167 and negative transition times).
 *
 * Example: "EST5EDT,M3.2.0,M11.1.0" or "<+1030>-10:30<+11>-11,M10.1.0,M4.1.0".
 */

import type { ZoneInfo } from '../data/types.js'

type DateRule =
  | { kind: 'julian'; day: number } // Jn: 1..365, Feb 29 never counted
  | { kind: 'zero'; day: number } // n: 0..365, Feb 29 counted
  | { kind: 'month'; month: number; week: number; weekday: number } // Mm.w.d

interface TransitionRule {
  date: DateRule
  /** Seconds after local midnight, may be negative or exceed 24h */
  time: number
}

export interface PosixTz {
  std: ZoneInfo
  dst: ZoneInfo | null
  start: TransitionRule | null
  end: TransitionRule | null
  /** DST in effect all year (start at Jan 1 00:00, end after Dec 31 24:00 + save) */
  permanentDst: boolean
}

const DAY_MS = 86_400_000

class Reader {
  pos = 0
  constructor(readonly text: string) {}

  peek(): string {
    return this.text[this.pos] ?? ''
  }

  done(): boolean {
    return this.pos >= this.text.length
  }

  fail(message: string): never {
    throw new Error(`Invalid POSIX TZ "${this.text}": ${message} at ${this.pos}`)
  }

  name(): string {
    if (this.peek() === '<') {
      const end = this.text.indexOf('>', this.pos)
      if (end === -1) {
        this.fail('unterminated <name>')
      }
      const value = this.text.slice(this.pos + 1, end)
      this.pos = end + 1
      return value
    }
    const match = /^[A-Za-z]{3,}/.exec(this.text.slice(this.pos))
    if (!match) {
      this.fail('expected zone abbreviation')
    }
    this.pos += match[0].length
    return match[0]
  }

  /** [+-]hh[:mm[:ss]] in seconds */
  duration(): number {
    const match = /^([+-])?(\d{1,3})(?::(\d{1,2})(?::(\d{1,2}))?)?/.exec(this.text.slice(this.pos))
    if (!match) {
      this.fail('expected time')
    }
    this.pos += match[0].length
    const [, sign, h, m = '0', s = '0'] = match
    const value = parseInt(h!, 10) * 3600 + parseInt(m, 10) * 60 + parseInt(s, 10)
    return sign === '-' ? -value : value
  }

  number(): number {
    const match = /^\d+/.exec(this.text.slice(this.pos))
    if (!match) {
      this.fail('expected number')
    }
    this.pos += match[0].length
    return parseInt(match[0], 10)
  }

  expect(ch: string): void {
    if (this.peek() !== ch) {
      this.fail(`expected "${ch}"`)
    }
    this.pos++
  }

  rule(): TransitionRule {
    let date: DateRule
    if (this.peek() === 'J') {
      this.pos++
      date = { kind: 'julian', day: this.number() }
    } else if (this.peek() === 'M') {
      this.pos++
      const month = this.number()
      this.expect('.')
      const week = this.number()
      this.expect('.')
      const weekday = this.number()
      date = { kind: 'month', month, week, weekday }
    } else {
      date = { kind: 'zero', day: this.number() }
    }
    let time = 2 * 3600
    if (this.peek() === '/') {
      this.pos++
      time = this.duration()
    }
    return { date, time }
  }
}

/**
 * Parse a POSIX TZ string. Returns null for an empty footer.
 */
export function parsePosixTz(text: string): PosixTz | null {
  if (!text) {
    return null
  }

  const reader = new Reader(text)
  const stdName = reader.name()
  // POSIX offsets are hours west of UTC, the opposite sign of a UT offset
  const stdOffset = 0 - reader.duration() || 0
  const std: ZoneInfo = { offsetSeconds: stdOffset, isDST: false, abbreviation: stdName }

  if (reader.done()) {
    return { std, dst: null, start: null, end: null, permanentDst: false }
  }

  const dstName = reader.name()
  let dstOffset = stdOffset + 3600
  if (!reader.done() && reader.peek() !== ',') {
    dstOffset = 0 - reader.duration() || 0
  }
  const dst: ZoneInfo = { offsetSeconds: dstOffset, isDST: true, abbreviation: dstName }

  // tzdb footers always carry explicit rules; fall back to the US rules otherwise
  let start: TransitionRule = { date: { kind: 'month', month: 3, week: 2, weekday: 0 }, time: 7200 }
  let end: TransitionRule = { date: { kind: 'month', month: 11, week: 1, weekday: 0 }, time: 7200 }
  if (reader.peek() === ',') {
    reader.pos++
    start = reader.rule()
    reader.expect(',')
    end = reader.rule()
  }
  if (!reader.done()) {
    reader.fail('unexpected trailing characters')
  }

  const tz: PosixTz = { std, dst, start, end, permanentDst: false }
  // e.g. "EST5EDT,0/0,J365/25": DST runs from the start of the year past its end
  const year = 2001
  const startMs = transitionMs(tz, year, 'start')
  const endMs = transitionMs(tz, year, 'end')
  tz.permanentDst = endMs - startMs >= 365 * DAY_MS
  return tz
}

function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function utcMidnight(year: number, month: number, day: number): number {
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  return date.getTime()
}

/**
 * Local midnight (as wall ms) of the rule's date in `year`
 */
function ruleDayMs(rule: DateRule, year: number): number {
  switch (rule.kind) {
    case 'julian': {
      const day = rule.day + (isLeap(year) && rule.day >= 60 ? 1 : 0)
      return utcMidnight(year, 1, 1) + (day - 1) * DAY_MS
    }
    case 'zero': {
      return utcMidnight(year, 1, 1) + rule.day * DAY_MS
    }
    case 'month': {
      const firstWeekday = new Date(utcMidnight(year, rule.month, 1)).getUTCDay()
      let day = 1 + ((rule.weekday - firstWeekday + 7) % 7) + (rule.week - 1) * 7
      const limit = daysInMonth(year, rule.month)
      while (day > limit) {
        day -= 7
      }
      return utcMidnight(year, rule.month, day)
    }
  }
}

/**
 * UTC instant of the DST start or end in `year`. Start times are in standard
 * time, end times in daylight time.
 */
function transitionMs(tz: PosixTz, year: number, which: 'start' | 'end'): number {
  const rule = which === 'start' ? tz.start! : tz.end!
  const offset = which === 'start' ? tz.std.offsetSeconds : tz.dst!.offsetSeconds
  return ruleDayMs(rule.date, year) + rule.time * 1000 - offset * 1000
}

export interface PosixTransition {
  at: number
  info: ZoneInfo
}

/**
 * DST start and end instants for each year in [fromYear, toYear], ascending
 */
export function posixTransitions(tz: PosixTz, fromYear: number, toYear: number): PosixTransition[] {
  if (!tz.dst || tz.permanentDst) {
    return []
  }
  const result: PosixTransition[] = []
  for (let year = fromYear; year <= toYear; year++) {
    result.push({ at: transitionMs(tz, year, 'start'), info: tz.dst })
    result.push({ at: transitionMs(tz, year, 'end'), info: tz.std })
  }
  return result.sort((a, b) => a.at - b.at)
}

/**
 * Zone info in effect at an instant
 */
export function posixZoneInfo(tz: PosixTz, epochMs: number): ZoneInfo {
  if (!tz.dst) {
    return tz.std
  }
  if (tz.permanentDst) {
    return tz.dst
  }
  const year = new Date(epochMs + tz.std.offsetSeconds * 1000).getUTCFullYear()
  const transitions = posixTransitions(tz, year - 1, year + 1)
  let info = tz.std
  for (const transition of transitions) {
    if (transition.at > epochMs) {
      break
    }
    info = transition.info
  }
  return info
}
