/**
 * Process-wide engine state shared by the API, formatter and transition helpers
 */

import type { TzEngine } from '../data/types.js'
import { createSystemIntlEngine } from '../engines/systemIntl.js'

let currentEngine: TzEngine = createSystemIntlEngine()

export function getEngine(): TzEngine {
  return currentEngine
}

export function setEngineState(engine: TzEngine): void {
  currentEngine = engine
}
