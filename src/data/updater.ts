/**
 * Signed timezone database updates with caching.
 *
 * A manifest names a tzdb version, the URL and SHA-256 of its data file, and an
 * Ed25519 signature over `${version}\n${sha256}`. Data is only accepted when
 * the signature verifies against a trusted public key and the downloaded bytes
 * match the signed hash. Anything else keeps the data already in use.
 */

import type { TzdbManifest, CachedTzdbData } from './types.js'
import { getCacheStorage, createBroadcastChannel } from '../utils/env.js'

/**
 * Default manifest, published with the `clockworktz-data` package
 */
export const DEFAULT_MANIFEST_URL = 'https://cdn.jsdelivr.net/npm/clockworktz-data@1/manifest.json'

/**
 * Raw Ed25519 public key (base64) that signs the official manifests
 */
export const DEFAULT_PUBLIC_KEY = 'DLvL/miUAfXKI8Sae27IuV/o5l3vbg5OIp5QMkeXLkU='

export const CACHE_KEY_PREFIX = 'clockworktz:'
export const BROADCAST_CHANNEL_NAME = 'clockworktz-updates'

/**
 * Cache TTL for timezone data before the manifest is checked again (24 hours)
 */
const TZDB_CACHE_TTL = 24 * 60 * 60 * 1000

/** Abort manifest and data requests that take longer than this */
const FETCH_TIMEOUT_MS = 30_000

/**
 * Data is cached per manifest URL and public key, so data verified for one
 * source is never served for another
 */
export function cacheKey(manifestURL: string, publicKey: string = DEFAULT_PUBLIC_KEY): string {
  return `${CACHE_KEY_PREFIX}data:${publicKey}:${manifestURL}`
}

function timeoutSignal(): AbortSignal | undefined {
  return typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
    ? AbortSignal.timeout(FETCH_TIMEOUT_MS)
    : undefined
}

function requestInit(init: RequestInit): RequestInit {
  const signal = timeoutSignal()
  return signal ? { ...init, signal } : init
}

export interface EnsureFreshOptions {
  /** Base64 raw Ed25519 public key (default: DEFAULT_PUBLIC_KEY) */
  publicKey?: string
  /** fetch implementation (default: globalThis.fetch) */
  fetch?: typeof fetch
}

/**
 * Compare tzdb versions such as "2024a", "2024b", "2024z", "2024za"
 */
export function compareTzdbVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const match = /^(\d{4})([a-z]+)$/.exec(v)
    return match ? { year: parseInt(match[1]!, 10), letters: match[2]! } : null
  }
  const pa = parse(a)
  const pb = parse(b)
  if (!pa || !pb) {
    return a.localeCompare(b)
  }
  return (
    pa.year - pb.year ||
    pa.letters.length - pb.letters.length ||
    (pa.letters < pb.letters ? -1 : pa.letters > pb.letters ? 1 : 0)
  )
}

function isManifest(value: unknown): value is TzdbManifest {
  const m = value as Partial<TzdbManifest> | null
  return (
    typeof m === 'object' &&
    m !== null &&
    typeof m.version === 'string' &&
    typeof m.dataUrl === 'string' &&
    typeof m.sha256 === 'string' &&
    /^[0-9a-f]{64}$/i.test(m.sha256) &&
    typeof m.signature === 'string'
  )
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), b => b.toString(16).padStart(2, '0')).join('')
}

function subtle(): SubtleCrypto | null {
  const c = (globalThis as { crypto?: Crypto }).crypto
  return c?.subtle ?? null
}

/**
 * Verify a manifest's Ed25519 signature. Fails closed: returns false when
 * WebCrypto or Ed25519 support is unavailable.
 */
export async function verifyManifestSignature(
  manifest: Pick<TzdbManifest, 'version' | 'sha256' | 'signature'>,
  publicKey: string = DEFAULT_PUBLIC_KEY
): Promise<boolean> {
  const crypto = subtle()
  if (!crypto) {
    return false
  }
  try {
    const key = await crypto.importKey(
      'raw',
      base64ToBytes(publicKey),
      { name: 'Ed25519' },
      false,
      ['verify']
    )
    const message = new TextEncoder().encode(
      `${manifest.version}\n${manifest.sha256.toLowerCase()}`
    )
    return await crypto.verify({ name: 'Ed25519' }, key, base64ToBytes(manifest.signature), message)
  } catch {
    return false
  }
}

async function readCache(key: string): Promise<CachedTzdbData | null> {
  try {
    const raw = await getCacheStorage().get(key)
    if (!raw) {
      return null
    }
    const parsed = JSON.parse(raw) as CachedTzdbData
    return typeof parsed?.version === 'string' ? parsed : null
  } catch {
    return null
  }
}

async function writeCache(key: string, entry: CachedTzdbData): Promise<void> {
  try {
    await getCacheStorage().set(key, JSON.stringify(entry))
  } catch {
    // Cache is best effort
  }
}

/**
 * Ensure fresh timezone database data is available.
 *
 * Returns cached data while it is younger than 24 hours, otherwise checks the
 * manifest, downloads and verifies newer data, and falls back to cached data on
 * any failure. Never downgrades to an older tzdb version.
 */
export async function ensureFreshTzdb(
  manifestURL: string = DEFAULT_MANIFEST_URL,
  options: EnsureFreshOptions = {}
): Promise<{ version: string; data: unknown } | null> {
  const fetchImpl = options.fetch ?? globalThis.fetch
  const publicKey = options.publicKey ?? DEFAULT_PUBLIC_KEY
  const key = cacheKey(manifestURL, publicKey)
  const cached = await readCache(key)
  const fallback = cached ? { version: cached.version, data: cached.data } : null

  if (cached && Date.now() - cached.cachedAt < TZDB_CACHE_TTL) {
    return fallback
  }

  try {
    const manifestResponse = await fetchImpl(
      manifestURL,
      requestInit({ headers: { Accept: 'application/json' }, cache: 'no-cache' })
    )
    if (!manifestResponse.ok) {
      throw new Error(`Manifest request failed: HTTP ${manifestResponse.status}`)
    }
    const manifest: unknown = await manifestResponse.json()
    if (!isManifest(manifest)) {
      throw new Error('Manifest is malformed')
    }

    if (cached && compareTzdbVersions(manifest.version, cached.version) <= 0) {
      await writeCache(key, { ...cached, cachedAt: Date.now() })
      return fallback
    }

    if (!(await verifyManifestSignature(manifest, publicKey))) {
      throw new Error(`Manifest signature verification failed for ${manifest.version}`)
    }

    const dataUrl = new URL(manifest.dataUrl, manifestURL).toString()
    const dataResponse = await fetchImpl(
      dataUrl,
      requestInit({ headers: { Accept: 'application/json' } })
    )
    if (!dataResponse.ok) {
      throw new Error(`Data request failed: HTTP ${dataResponse.status}`)
    }
    const bytes = await dataResponse.arrayBuffer()

    const crypto = subtle()
    if (!crypto) {
      throw new Error('WebCrypto is unavailable; cannot verify timezone data')
    }
    const digest = toHex(await crypto.digest('SHA-256', bytes))
    if (digest !== manifest.sha256.toLowerCase()) {
      throw new Error(`Timezone data hash mismatch for ${manifest.version}`)
    }

    const data: unknown = JSON.parse(new TextDecoder().decode(bytes))
    if ((data as { version?: unknown })?.version !== manifest.version) {
      throw new Error('Timezone data version does not match manifest')
    }

    await writeCache(key, { version: manifest.version, cachedAt: Date.now(), data })
    broadcastUpdate(manifest.version, key)

    return { version: manifest.version, data }
  } catch (error) {
    console.warn('Failed to refresh timezone data:', error)
    return fallback
  }
}

/**
 * Broadcast timezone data update to other tabs/workers
 */
function broadcastUpdate(version: string, source: string): void {
  const channel = createBroadcastChannel(BROADCAST_CHANNEL_NAME)
  if (!channel) {
    return
  }
  try {
    channel.postMessage({ type: 'tzdb-update', version, source, timestamp: Date.now() })
  } catch (error) {
    console.warn('Failed to broadcast timezone update:', error)
  } finally {
    channel.close()
  }
}

/**
 * Listen for timezone data verified and cached by other tabs/workers. The
 * callback receives the version and an opaque source id (manifest + key).
 */
export function onBroadcastUpdate(callback: (version: string, source: string) => void): () => void {
  const channel = createBroadcastChannel(BROADCAST_CHANNEL_NAME)
  if (!channel) {
    return () => {}
  }

  channel.addEventListener('message', event => {
    const message = event.data as { type?: unknown; version?: unknown; source?: unknown } | null
    if (
      message?.type === 'tzdb-update' &&
      typeof message.version === 'string' &&
      typeof message.source === 'string'
    ) {
      callback(message.version, message.source)
    }
  })

  return () => {
    try {
      channel.close()
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Clear cached timezone data, for one manifest or (by default) all of them
 */
export async function clearCache(
  manifestURL?: string,
  publicKey: string = DEFAULT_PUBLIC_KEY
): Promise<void> {
  const storage = getCacheStorage()
  try {
    if (manifestURL) {
      await storage.delete(cacheKey(manifestURL, publicKey))
      return
    }
    for (const key of await storage.keys()) {
      if (key.startsWith(`${CACHE_KEY_PREFIX}data:`)) {
        await storage.delete(key)
      }
    }
  } catch (error) {
    console.warn('Failed to clear timezone cache:', error)
  }
}

/**
 * Get cache statistics for a manifest (default: the official one)
 */
export async function getCacheStats(
  manifestURL: string = DEFAULT_MANIFEST_URL,
  publicKey: string = DEFAULT_PUBLIC_KEY
): Promise<{
  dataCached: boolean
  dataVersion?: string | undefined
  dataAge?: number | undefined
}> {
  const cached = await readCache(cacheKey(manifestURL, publicKey))
  if (!cached) {
    return { dataCached: false }
  }
  return {
    dataCached: true,
    dataVersion: cached.version,
    dataAge: Date.now() - cached.cachedAt,
  }
}
