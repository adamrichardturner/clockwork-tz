/**
 * TZif (RFC 9636) reader. Only the version 2+ 64-bit data block and footer are
 * used; the version 1 block is skipped.
 */

export interface TzifType {
  /** UT offset in seconds */
  utoff: number
  /** Whether the type is daylight saving time */
  isdst: boolean
  /** Designation (abbreviation) */
  abbr: string
}

export interface Tzif {
  version: number
  /** Transition times in seconds since the epoch, ascending */
  times: number[]
  /** Type index in effect from each transition */
  typeIndices: number[]
  /** Local time types; type 0 applies before the first transition */
  types: TzifType[]
  /** POSIX TZ string for instants after the last transition ('' when absent) */
  footer: string
}

interface Counts {
  isutcnt: number
  isstdcnt: number
  leapcnt: number
  timecnt: number
  typecnt: number
  charcnt: number
}

function readHeader(view: DataView, offset: number): { version: number; counts: Counts } {
  const magic = String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3)
  )
  if (magic !== 'TZif') {
    throw new Error('Not a TZif file')
  }
  const versionByte = view.getUint8(offset + 4)
  const version = versionByte === 0 ? 1 : versionByte - 0x30
  const at = offset + 20
  return {
    version,
    counts: {
      isutcnt: view.getUint32(at),
      isstdcnt: view.getUint32(at + 4),
      leapcnt: view.getUint32(at + 8),
      timecnt: view.getUint32(at + 12),
      typecnt: view.getUint32(at + 16),
      charcnt: view.getUint32(at + 20),
    },
  }
}

function blockSize(c: Counts, timeSize: number): number {
  return (
    c.timecnt * timeSize +
    c.timecnt +
    c.typecnt * 6 +
    c.charcnt +
    c.leapcnt * (timeSize + 4) +
    c.isstdcnt +
    c.isutcnt
  )
}

export function parseTzif(bytes: Uint8Array): Tzif {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const first = readHeader(view, 0)
  if (first.version < 2) {
    throw new Error('TZif version 1 files are not supported')
  }

  const secondOffset = 44 + blockSize(first.counts, 4)
  const { counts } = readHeader(view, secondOffset)
  let at = secondOffset + 44

  const times: number[] = []
  for (let i = 0; i < counts.timecnt; i++) {
    times.push(Number(view.getBigInt64(at)))
    at += 8
  }

  const typeIndices: number[] = []
  for (let i = 0; i < counts.timecnt; i++) {
    typeIndices.push(view.getUint8(at))
    at += 1
  }

  const rawTypes: Array<{ utoff: number; isdst: boolean; desigidx: number }> = []
  for (let i = 0; i < counts.typecnt; i++) {
    rawTypes.push({
      utoff: view.getInt32(at),
      isdst: view.getUint8(at + 4) === 1,
      desigidx: view.getUint8(at + 5),
    })
    at += 6
  }

  const chars = bytes.subarray(at, at + counts.charcnt)
  at += counts.charcnt
  const designation = (index: number) => {
    let end = index
    while (end < chars.length && chars[end] !== 0) {
      end++
    }
    return new TextDecoder().decode(chars.subarray(index, end))
  }

  at += counts.leapcnt * 12 + counts.isstdcnt + counts.isutcnt

  let footer = ''
  if (bytes[at] === 0x0a) {
    const end = bytes.indexOf(0x0a, at + 1)
    if (end > at) {
      footer = new TextDecoder().decode(bytes.subarray(at + 1, end))
    }
  }

  return {
    version: first.version,
    times,
    typeIndices,
    types: rawTypes.map(t => ({ utoff: t.utoff, isdst: t.isdst, abbr: designation(t.desigidx) })),
    footer,
  }
}
