/**
 * Environment detection utilities for cross-platform compatibility
 */

import type { Environment } from '../data/types.js'

/**
 * Detect the current runtime environment and available features
 */
export function detectEnvironment(): Environment {
  const proc = (globalThis as { process?: { versions?: { node?: string } } }).process
  const isNode = proc?.versions?.node != null

  const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined'

  const hasBroadcastChannel = typeof BroadcastChannel !== 'undefined'

  const hasLocalStorage = (() => {
    // Node 25+ defines a localStorage getter that prints an ExperimentalWarning
    // when touched (even by typeof) unless --localstorage-file is set, so
    // server-side Node uses the in-memory cache without probing it
    if (isNode && !isBrowser) {
      return false
    }
    try {
      return typeof localStorage !== 'undefined' && localStorage !== null
    } catch {
      return false
    }
  })()

  return { isNode, isBrowser, hasBroadcastChannel, hasLocalStorage }
}

export interface CacheStorage {
  get: (key: string) => Promise<string | null>
  set: (key: string, value: string) => Promise<void>
  delete: (key: string) => Promise<void>
  keys: () => Promise<string[]>
}

const localStorageCache: CacheStorage = {
  async get(key) {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  },
  async set(key, value) {
    try {
      localStorage.setItem(key, value)
    } catch {
      // Ignore storage errors (quota exceeded, etc.)
    }
  },
  async delete(key) {
    try {
      localStorage.removeItem(key)
    } catch {
      // Ignore errors
    }
  },
  async keys() {
    try {
      return Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i) ?? '')
    } catch {
      return []
    }
  },
}

const memory = new Map<string, string>()

const memoryCache: CacheStorage = {
  async get(key) {
    return memory.get(key) ?? null
  },
  async set(key, value) {
    memory.set(key, value)
  },
  async delete(key) {
    memory.delete(key)
  },
  async keys() {
    return [...memory.keys()]
  },
}

/**
 * localStorage where available, otherwise a process-wide in-memory cache
 */
export function getCacheStorage(): CacheStorage {
  return detectEnvironment().hasLocalStorage ? localStorageCache : memoryCache
}

/**
 * Create a broadcast channel for cross-tab communication if available
 */
export function createBroadcastChannel(channelName: string): {
  postMessage: (data: unknown) => void
  addEventListener: (type: 'message', listener: (event: { data: unknown }) => void) => void
  close: () => void
} | null {
  if (!detectEnvironment().hasBroadcastChannel) {
    return null
  }
  const channel = new BroadcastChannel(channelName)
  ;(channel as { unref?: () => void }).unref?.()
  return {
    postMessage: data => channel.postMessage(data),
    addEventListener: (_type, listener) => {
      channel.addEventListener('message', (event: MessageEvent) => {
        listener({ data: event.data })
      })
    },
    close: () => channel.close(),
  }
}
