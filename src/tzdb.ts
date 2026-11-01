/**
 * Bundled IANA timezone data for the embedded-tzdb engine.
 *
 *   import { tzdb } from 'clockworktz/tzdb'
 *   initClockworkTZ({ engine: 'embedded-tzdb', data: tzdb })
 */

import data from './tzdb/data.generated.js'

export type { TzdbData, CompactZone } from './tzdb/types.js'

/**
 * The compiled IANA tzdb release bundled with this version of clockworktz, for
 * the `embedded-tzdb` engine. About 30 kB gzipped, and only included in your
 * bundle if you import it.
 *
 * @example
 * ```ts
 * import { initClockworkTZ } from 'clockworktz'
 * import { tzdb } from 'clockworktz/tzdb'
 *
 * await initClockworkTZ({ engine: 'embedded-tzdb', data: tzdb })
 * ```
 */
export const tzdb = data

/**
 * The IANA release {@link tzdb} was built from, such as `'2026f'`.
 */
export const TZDB_VERSION: string = data.version
