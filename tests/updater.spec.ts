import { createHash, generateKeyPairSync, sign, type KeyObject } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearCache,
  compareTzdbVersions,
  dispose,
  ensureFreshTzdb,
  getCacheStats,
  getStatus,
  initClockworkTZ,
  onDataUpdate,
  refreshTimezoneData,
  tzdbVersion,
  verifyManifestSignature,
  type TzdbManifest,
} from '../src/index.js'
import { tzdb } from '../src/tzdb.js'

const MANIFEST_URL = 'https://cdn.example.test/manifest.json'

function keyPair(): { privateKey: KeyObject; publicKey: string } {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const raw = Buffer.from(publicKey.export({ format: 'jwk' }).x!, 'base64url')
  return { privateKey, publicKey: raw.toString('base64') }
}

function release(version: string, privateKey: KeyObject, tamper = false) {
  const body = JSON.stringify({ ...tzdb, version })
  const sha256 = createHash('sha256').update(body).digest('hex')
  const manifest: TzdbManifest = {
    version,
    releaseDate: '2026-01-01T00:00:00Z',
    dataUrl: `data-${version}.json`,
    sha256,
    signature: sign(null, Buffer.from(`${version}\n${sha256}`), privateKey).toString('base64'),
    keyId: 'test',
  }
  return { manifest, body: tamper ? body.replace('Asia/Kolkata', 'Asia/Kolkatb') : body }
}

function mockFetch(manifest: unknown, body: string) {
  return vi.fn(async (url: string | URL | Request) => {
    const href = String(url)
    if (href === MANIFEST_URL) {
      return new Response(JSON.stringify(manifest), { status: 200 })
    }
    if (href.startsWith('https://cdn.example.test/data-')) {
      return new Response(body, { status: 200 })
    }
    return new Response('not found', { status: 404 })
  })
}

describe('signed tzdb updates', () => {
  const { privateKey, publicKey } = keyPair()

  beforeEach(async () => {
    await clearCache()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    dispose()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('compares tzdb versions', () => {
    expect(compareTzdbVersions('2024a', '2024b')).toBeLessThan(0)
    expect(compareTzdbVersions('2025a', '2024z')).toBeGreaterThan(0)
    expect(compareTzdbVersions('2024za', '2024z')).toBeGreaterThan(0)
    expect(compareTzdbVersions('2024c', '2024c')).toBe(0)
  })

  it('verifies signatures and rejects tampering or the wrong key', async () => {
    const { manifest } = release('2030a', privateKey)
    expect(await verifyManifestSignature(manifest, publicKey)).toBe(true)
    expect(await verifyManifestSignature({ ...manifest, version: '2030b' }, publicKey)).toBe(false)
    expect(await verifyManifestSignature(manifest, keyPair().publicKey)).toBe(false)
    expect(await verifyManifestSignature(manifest)).toBe(false)
  })

  it('loads verified data and caches it', async () => {
    const { manifest, body } = release('2030a', privateKey)
    const fetch = mockFetch(manifest, body)
    const result = await ensureFreshTzdb(MANIFEST_URL, { publicKey, fetch })
    expect(result?.version).toBe('2030a')
    expect(fetch).toHaveBeenCalledWith(
      'https://cdn.example.test/data-2030a.json',
      expect.anything()
    )
    expect((await getCacheStats(MANIFEST_URL, publicKey)).dataVersion).toBe('2030a')

    // Fresh cache: no network
    const again = await ensureFreshTzdb(MANIFEST_URL, { publicKey, fetch })
    expect(again?.version).toBe('2030a')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('rejects data whose hash does not match', async () => {
    const { manifest, body } = release('2030a', privateKey, true)
    expect(
      await ensureFreshTzdb(MANIFEST_URL, { publicKey, fetch: mockFetch(manifest, body) })
    ).toBeNull()
  })

  it('rejects manifests signed with another key', async () => {
    const { manifest, body } = release('2030a', keyPair().privateKey)
    expect(
      await ensureFreshTzdb(MANIFEST_URL, { publicKey, fetch: mockFetch(manifest, body) })
    ).toBeNull()
  })

  it('rejects malformed manifests and network failures', async () => {
    expect(
      await ensureFreshTzdb(MANIFEST_URL, { publicKey, fetch: mockFetch({ nope: 1 }, '') })
    ).toBeNull()
    const failing = vi.fn(async () => {
      throw new Error('offline')
    })
    expect(await ensureFreshTzdb(MANIFEST_URL, { publicKey, fetch: failing })).toBeNull()
  })

  it('never downgrades and falls back to cache', async () => {
    const newer = release('2030b', privateKey)
    await ensureFreshTzdb(MANIFEST_URL, { publicKey, fetch: mockFetch(newer.manifest, newer.body) })

    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 2 * 86_400_000)
    const older = release('2030a', privateKey)
    const result = await ensureFreshTzdb(MANIFEST_URL, {
      publicKey,
      fetch: mockFetch(older.manifest, older.body),
    })
    vi.useRealTimers()
    expect(result?.version).toBe('2030b')
  })

  it('keeps caches separate per manifest and key', async () => {
    const { manifest, body } = release('2030a', privateKey)
    await ensureFreshTzdb(MANIFEST_URL, { publicKey, fetch: mockFetch(manifest, body) })
    expect((await getCacheStats(MANIFEST_URL, publicKey)).dataCached).toBe(true)
    expect((await getCacheStats(MANIFEST_URL, keyPair().publicKey)).dataCached).toBe(false)
    expect((await getCacheStats('https://other.test/manifest.json', publicKey)).dataCached).toBe(
      false
    )
    await clearCache(MANIFEST_URL, publicKey)
    expect((await getCacheStats(MANIFEST_URL, publicKey)).dataCached).toBe(false)
  })

  it('passes a timeout signal to fetch', async () => {
    const { manifest, body } = release('2030a', privateKey)
    const fetch = mockFetch(manifest, body)
    await ensureFreshTzdb(MANIFEST_URL, { publicKey, fetch })
    for (const call of fetch.mock.calls) {
      expect((call as unknown[])[1]).toMatchObject({ signal: expect.any(AbortSignal) })
    }
  })

  it('loads data another tab verified', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline')
      })
    )
    await initClockworkTZ({
      engine: 'embedded-tzdb',
      data: tzdb,
      manifestURL: MANIFEST_URL,
      publicKey,
      autoUpdateIntervalMs: 0,
    })
    expect(tzdbVersion()).toBe(tzdb.version)
    const seen: string[] = []
    const stop = onDataUpdate(version => seen.push(version))

    // Another tab fetches, verifies, caches and broadcasts
    const { manifest, body } = release('2030c', privateKey)
    await ensureFreshTzdb(MANIFEST_URL, { publicKey, fetch: mockFetch(manifest, body) })

    await vi.waitFor(() => expect(tzdbVersion()).toBe('2030c'))
    expect(seen).toEqual(['2030c'])
    stop()
    dispose()
  })

  it('initialises the embedded engine from a manifest and notifies listeners', async () => {
    const { manifest, body } = release('2030a', privateKey)
    vi.stubGlobal('fetch', mockFetch(manifest, body))
    const seen: string[] = []
    const stop = onDataUpdate(version => seen.push(version))

    await initClockworkTZ({
      engine: 'embedded-tzdb',
      data: tzdb,
      manifestURL: MANIFEST_URL,
      publicKey,
      autoUpdateIntervalMs: 0,
    })
    expect(tzdbVersion()).toBe('2030a')
    expect(seen).toContain('2030a')
    expect(getStatus()).toMatchObject({
      engine: 'embedded-tzdb',
      dataLoaded: true,
      tzdbVersion: '2030a',
    })
    expect(await refreshTimezoneData()).toBe(false)
    stop()
  })

  it('keeps bundled data when the manifest cannot be verified', async () => {
    const { manifest, body } = release('2030a', keyPair().privateKey)
    vi.stubGlobal('fetch', mockFetch(manifest, body))
    await initClockworkTZ({
      engine: 'embedded-tzdb',
      data: tzdb,
      manifestURL: MANIFEST_URL,
      publicKey,
    })
    expect(tzdbVersion()).toBe(tzdb.version)
  })
})
