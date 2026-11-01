import { initClockworkTZ, type EngineKind } from '../src/index.js'
import { tzdb } from '../src/tzdb.js'

export interface EngineSetup {
  name: EngineKind
  init: () => Promise<void>
}

export const ENGINES: EngineSetup[] = [
  { name: 'system-intl', init: () => initClockworkTZ({ engine: 'system-intl' }) },
  {
    name: 'embedded-tzdb',
    init: () => initClockworkTZ({ engine: 'embedded-tzdb', data: tzdb }),
  },
]

export const utc = (iso: string): number => new Date(iso).getTime()
