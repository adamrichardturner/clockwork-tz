/**
 * Embedded TZDB engine (placeholder until the data pipeline lands)
 */

import type { LoadableEngine, ZoneInfo } from '../data/types.js'
import { NotImplementedError } from '../data/types.js'

export class EmbeddedTzdbEngine implements LoadableEngine {
  readonly kind = 'embedded-tzdb' as const

  getVersion(): string | undefined {
    return undefined
  }

  isValidTimeZone(_zone: string): boolean {
    return false
  }

  canonicalize(zone: string): string {
    return zone
  }

  listZoneIds(): string[] {
    return []
  }

  getZoneInfo(_epochMs: number, _zone: string): ZoneInfo {
    throw new NotImplementedError('EmbeddedTzdbEngine is not implemented yet')
  }

  loadTzdbData(_data: unknown): void {
    throw new NotImplementedError('EmbeddedTzdbEngine is not implemented yet')
  }

  isDataLoaded(): boolean {
    return false
  }
}

export function createEmbeddedTzdbEngine(data?: unknown): EmbeddedTzdbEngine {
  const engine = new EmbeddedTzdbEngine()
  if (data !== undefined) {
    engine.loadTzdbData(data)
  }
  return engine
}
