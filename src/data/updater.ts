/**
 * CDN updater for timezone database with caching and signature verification
 */

import type { TzdbManifest, CachedTzdbData } from './types.js'
import { getCacheStorage, createBroadcastChannel } from '../utils/env.js'

/**
 * Default CDN URLs for timezone data
 */
export const DEFAULT_MANIFEST_URL = 'https://cdn.clockwork-tz.dev/manifest.json'
export const CACHE_KEY_PREFIX = 'clockwork-tz:'
export const BROADCAST_CHANNEL_NAME = 'clockwork-tz-updates'

/**
 * Cache TTL for manifest (1 hour)
 */
const MANIFEST_CACHE_TTL = 60 * 60 * 1000

/**
 * Cache TTL for timezone data (24 hours)
 */
const TZDB_CACHE_TTL = 24 * 60 * 60 * 1000

/**
 * Ensure fresh timezone database data is available
 *
 * This function:
 * 1. Checks local cache for existing data
 * 2. Fetches manifest from CDN if needed
 * 3. Downloads new data if version has changed
 * 4. Verifies signature (stub implementation)
 * 5. Updates cache and broadcasts changes
 */
export async function ensureFreshTzdb(
  manifestURL: string = DEFAULT_MANIFEST_URL
): Promise<{ version: string; data: unknown } | null> {
  const cache = getCacheStorage()
  const manifestCacheKey = `${CACHE_KEY_PREFIX}manifest`
  const dataCacheKey = `${CACHE_KEY_PREFIX}data`

  try {
    // Check if we have cached data that's still fresh
    const cachedDataStr = await cache.get(dataCacheKey)
    if (cachedDataStr) {
      const cachedData: CachedTzdbData = JSON.parse(cachedDataStr)
      const age = Date.now() - cachedData.cachedAt

      if (age < TZDB_CACHE_TTL) {
        // Data is still fresh, return it
        return {
          version: cachedData.version,
          data: cachedData.data,
        }
      }
    }

    // Fetch manifest to check for updates
    const manifest = await fetchManifest(manifestURL, cache, manifestCacheKey)
    if (!manifest) {
      // If we can't fetch manifest but have cached data, use it
      if (cachedDataStr) {
        const cachedData: CachedTzdbData = JSON.parse(cachedDataStr)
        return {
          version: cachedData.version,
          data: cachedData.data,
        }
      }
      return null
    }

    // Check if we need to download new data
    const cachedData = cachedDataStr ? (JSON.parse(cachedDataStr) as CachedTzdbData) : null
    if (cachedData && cachedData.version === manifest.version) {
      // Version matches, update cache timestamp and return existing data
      const updatedCache: CachedTzdbData = {
        ...cachedData,
        cachedAt: Date.now(),
      }
      await cache.set(dataCacheKey, JSON.stringify(updatedCache), TZDB_CACHE_TTL)
      return {
        version: cachedData.version,
        data: cachedData.data,
      }
    }

    // Download new timezone data
    const tzdbData = await fetchTzdbData(manifest)
    if (!tzdbData) {
      // Download failed, use cached data if available
      if (cachedData) {
        return {
          version: cachedData.version,
          data: cachedData.data,
        }
      }
      return null
    }

    // Verify signature (stub implementation)
    const isValid = await verifySignature(tzdbData, manifest.signature)
    if (!isValid) {
      console.warn('Timezone data signature verification failed, using cached data if available')
      if (cachedData) {
        return {
          version: cachedData.version,
          data: cachedData.data,
        }
      }
      return null
    }

    // Cache the new data
    const newCachedData: CachedTzdbData = {
      version: manifest.version,
      cachedAt: Date.now(),
      etag: manifest.etag ?? undefined,
      data: tzdbData,
    }
    await cache.set(dataCacheKey, JSON.stringify(newCachedData), TZDB_CACHE_TTL)

    // Broadcast update to other tabs/workers
    broadcastUpdate(manifest.version)

    return {
      version: manifest.version,
      data: tzdbData,
    }
  } catch (error) {
    console.warn('Failed to ensure fresh timezone data:', error)

    // Try to return cached data as fallback
    try {
      const cachedDataStr = await cache.get(dataCacheKey)
      if (cachedDataStr) {
        const cachedData: CachedTzdbData = JSON.parse(cachedDataStr)
        return {
          version: cachedData.version,
          data: cachedData.data,
        }
      }
    } catch {
      // Ignore cache read errors
    }

    return null
  }
}

/**
 * Fetch timezone database manifest
 */
async function fetchManifest(
  manifestURL: string,
  cache: ReturnType<typeof getCacheStorage>,
  cacheKey: string
): Promise<TzdbManifest | null> {
  try {
    const cachedManifestStr = await cache.get(cacheKey)
    let etag: string | undefined

    if (cachedManifestStr) {
      const cachedManifest: TzdbManifest = JSON.parse(cachedManifestStr)
      etag = cachedManifest.etag
    }

    // Prepare fetch options with conditional request headers
    const fetchOptions: RequestInit = {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'Cache-Control': 'no-cache',
      },
    }

    if (etag) {
      fetchOptions.headers = {
        ...fetchOptions.headers,
        'If-None-Match': etag,
      }
    }

    const response = await fetch(manifestURL, fetchOptions)

    if (response.status === 304) {
      // Not modified, return cached manifest
      return cachedManifestStr ? JSON.parse(cachedManifestStr) : null
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const manifest: TzdbManifest = await response.json()

    // Add ETag if available
    const responseEtag = response.headers.get('etag')
    if (responseEtag) {
      manifest.etag = responseEtag
    }

    // Cache the manifest
    await cache.set(cacheKey, JSON.stringify(manifest), MANIFEST_CACHE_TTL)

    return manifest
  } catch (error) {
    console.warn('Failed to fetch timezone manifest:', error)
    return null
  }
}

/**
 * Fetch timezone database data
 */
async function fetchTzdbData(manifest: TzdbManifest): Promise<unknown | null> {
  try {
    const response = await fetch(manifest.dataUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'Cache-Control': 'no-cache',
      },
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    return await response.json()
  } catch (error) {
    console.warn('Failed to fetch timezone data:', error)
    return null
  }
}

/**
 * Verify timezone data signature (stub implementation)
 *
 * TODO: Implement proper cryptographic signature verification
 * This should use a public key to verify the data hasn't been tampered with
 */
async function verifySignature(data: unknown, signature: string): Promise<boolean> {
  // Stub implementation - always returns true
  // In a real implementation, this would:
  // 1. Hash the data using SHA-256 or similar
  // 2. Verify the signature using a public key (e.g., RSA, ECDSA)
  // 3. Return true only if signature is valid

  console.debug('Signature verification (stub):', {
    dataSize: JSON.stringify(data).length,
    signature: signature.slice(0, 16) + '...',
  })

  return true
}

/**
 * Broadcast timezone data update to other tabs/workers
 */
function broadcastUpdate(version: string): void {
  const channel = createBroadcastChannel(BROADCAST_CHANNEL_NAME)
  if (channel) {
    try {
      channel.postMessage({
        type: 'tzdb-update',
        version,
        timestamp: Date.now(),
      })
    } catch (error) {
      console.warn('Failed to broadcast timezone update:', error)
    }
  }
}

/**
 * Listen for timezone data updates from other tabs/workers
 */
export function onDataUpdate(callback: (version: string) => void): () => void {
  const channel = createBroadcastChannel(BROADCAST_CHANNEL_NAME)
  if (!channel) {
    // Return no-op cleanup function
    return () => {}
  }

  const handleMessage = (event: { data: unknown }) => {
    try {
      const message = event.data as { type: string; version: string; timestamp: number }
      if (message.type === 'tzdb-update' && typeof message.version === 'string') {
        callback(message.version)
      }
    } catch (error) {
      console.warn('Failed to handle timezone update message:', error)
    }
  }

  channel.addEventListener('message', handleMessage)

  // Return cleanup function
  return () => {
    try {
      channel.close()
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Clear all cached timezone data
 */
export async function clearCache(): Promise<void> {
  const cache = getCacheStorage()

  try {
    await Promise.all([
      cache.delete(`${CACHE_KEY_PREFIX}manifest`),
      cache.delete(`${CACHE_KEY_PREFIX}data`),
    ])
  } catch (error) {
    console.warn('Failed to clear timezone cache:', error)
  }
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<{
  manifestCached: boolean
  dataCached: boolean
  dataVersion?: string | undefined
  dataAge?: number | undefined
}> {
  const cache = getCacheStorage()

  try {
    const [manifestStr, dataStr] = await Promise.all([
      cache.get(`${CACHE_KEY_PREFIX}manifest`),
      cache.get(`${CACHE_KEY_PREFIX}data`),
    ])

    const stats = {
      manifestCached: manifestStr != null,
      dataCached: dataStr != null,
      dataVersion: undefined as string | undefined,
      dataAge: undefined as number | undefined,
    }

    if (dataStr) {
      const cachedData: CachedTzdbData = JSON.parse(dataStr)
      stats.dataVersion = cachedData.version
      stats.dataAge = Date.now() - cachedData.cachedAt
    }

    return {
      manifestCached: stats.manifestCached,
      dataCached: stats.dataCached,
      dataVersion: stats.dataVersion ?? undefined,
      dataAge: stats.dataAge ?? undefined,
    }
  } catch (error) {
    console.warn('Failed to get cache stats:', error)
    return {
      manifestCached: false,
      dataCached: false,
    }
  }
}
