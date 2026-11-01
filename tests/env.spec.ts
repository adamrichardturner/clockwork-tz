import { afterEach, describe, expect, it } from 'vitest'
import { clearCache, getCacheStats } from '../src/index.js'
import { detectEnvironment } from '../src/utils/env.js'

describe('environment detection in Node', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')

  afterEach(() => {
    if (original) {
      Object.defineProperty(globalThis, 'localStorage', original)
    } else {
      delete (globalThis as { localStorage?: unknown }).localStorage
    }
  })

  it('never touches the localStorage global, which warns in Node 25+', async () => {
    let touched = 0
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        touched++
        return undefined
      },
    })

    expect(detectEnvironment()).toMatchObject({ isNode: true, hasLocalStorage: false })
    await clearCache()
    await getCacheStats()
    expect(touched).toBe(0)
  })
})
