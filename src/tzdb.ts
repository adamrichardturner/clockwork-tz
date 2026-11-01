/**
 * Bundled IANA timezone data for the embedded-tzdb engine.
 *
 *   import { tzdb } from 'clockworktz/tzdb'
 *   initClockworkTZ({ engine: 'embedded-tzdb', data: tzdb })
 */

import data from './tzdb/data.generated.js'

export type { TzdbData, CompactZone } from './tzdb/types.js'

/** Compiled IANA timezone database */
export const tzdb = data

/** IANA release the bundled data was built from */
export const TZDB_VERSION: string = data.version
