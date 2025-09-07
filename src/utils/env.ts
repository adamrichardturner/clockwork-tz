/**
 * Environment detection utilities for cross-platform compatibility
 */

import type { Environment } from '../data/types.js'

/**
 * Detect the current runtime environment and available features
 */
export function detectEnvironment(): Environment {
  // Node.js detection
  const isNode =
    typeof process !== 'undefined' && process.versions != null && process.versions.node != null

  // Browser detection
  const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined'

  // Feature detection
  const hasBroadcastChannel = typeof BroadcastChannel !== 'undefined'

  const hasLocalStorage = (() => {
    try {
      return typeof localStorage !== 'undefined' && localStorage !== null
    } catch {
      return false
    }
  })()

  const hasCacheAPI = typeof caches !== 'undefined'

  const hasFileSystem = isNode && typeof require !== 'undefined'

  return {
    isNode,
    isBrowser,
    hasBroadcastChannel,
    hasLocalStorage,
    hasCacheAPI,
    hasFileSystem,
  }
}

/**
 * Get the appropriate cache storage based on environment
 */
export function getCacheStorage(): {
  get: (key: string) => Promise<string | null>
  set: (key: string, value: string, ttl?: number) => Promise<void>
  delete: (key: string) => Promise<void>
} {
  const env = detectEnvironment()

  if (env.hasLocalStorage) {
    // Browser localStorage implementation
    return {
      async get(key: string): Promise<string | null> {
        try {
          const item = localStorage.getItem(key)
          if (!item) {
            return null
          }

          const parsed = JSON.parse(item)

          // Check TTL if present
          if (parsed.expires && Date.now() > parsed.expires) {
            localStorage.removeItem(key)
            return null
          }

          return parsed.value
        } catch {
          return null
        }
      },

      async set(key: string, value: string, ttl?: number): Promise<void> {
        try {
          const item = {
            value,
            expires: ttl ? Date.now() + ttl : undefined,
          }
          localStorage.setItem(key, JSON.stringify(item))
        } catch {
          // Ignore storage errors (quota exceeded, etc.)
        }
      },

      async delete(key: string): Promise<void> {
        try {
          localStorage.removeItem(key)
        } catch {
          // Ignore errors
        }
      },
    }
  }

  if (env.isNode) {
    // Node.js in-memory cache implementation
    const cache = new Map<string, { value: string; expires?: number }>()

    return {
      async get(key: string): Promise<string | null> {
        const item = cache.get(key)
        if (!item) {
          return null
        }

        if (item.expires && Date.now() > item.expires) {
          cache.delete(key)
          return null
        }

        return item.value
      },

      async set(key: string, value: string, ttl?: number): Promise<void> {
        cache.set(key, {
          value,
          expires: ttl ? Date.now() + ttl : undefined,
        } as { value: string; expires?: number })
      },

      async delete(key: string): Promise<void> {
        cache.delete(key)
      },
    }
  }

  // Fallback no-op implementation
  return {
    async get(): Promise<string | null> {
      return null
    },
    async set(): Promise<void> {
      // No-op
    },
    async delete(): Promise<void> {
      // No-op
    },
  }
}

/**
 * Create a broadcast channel for cross-tab communication if available
 */
export function createBroadcastChannel(channelName: string): {
  postMessage: (data: unknown) => void
  addEventListener: (type: string, listener: (event: { data: unknown }) => void) => void
  close: () => void
} | null {
  const env = detectEnvironment()

  if (env.hasBroadcastChannel) {
    const channel = new BroadcastChannel(channelName)
    return {
      postMessage: (data: unknown) => channel.postMessage(data),
      addEventListener: (_type: string, listener: (event: { data: unknown }) => void) => {
        channel.addEventListener('message', (event: MessageEvent) => {
          listener({ data: event.data })
        })
      },
      close: () => channel.close(),
    }
  }

  return null
}

/**
 * Get the current environment as a singleton
 */
let cachedEnvironment: Environment | null = null

export function getEnvironment(): Environment {
  if (!cachedEnvironment) {
    cachedEnvironment = detectEnvironment()
  }
  return cachedEnvironment
}

/**
 * Check if we're running in a secure context (required for some APIs)
 */
export function isSecureContext(): boolean {
  if (typeof window !== 'undefined') {
    return window.isSecureContext ?? false
  }
  return true // Node.js is considered secure
}
