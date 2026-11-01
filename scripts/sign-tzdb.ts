/**
 * Sign the compiled tzdb data and write the CDN manifest.
 *
 *   TZDB_SIGNING_KEY="$(cat key.pem)" node scripts/sign-tzdb.ts
 *
 * Reads packages/clockwork-tz-data/tzdb.json, writes manifest.json next to it
 * and sets the data package version to 1.<year>.<release> (2026f -> 1.2026.6).
 * The signature covers `${version}\n${sha256}` and verifies with the raw
 * Ed25519 public key in src/data/updater.ts (DEFAULT_PUBLIC_KEY).
 */

import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { TzdbManifest } from '../src/data/types.ts'

const PACKAGE_DIR = resolve(import.meta.dirname, '..', 'packages', 'clockwork-tz-data')

export function packageVersion(tzdbVersion: string): string {
  const match = /^(\d{4})([a-z]+)$/.exec(tzdbVersion)
  if (!match) {
    throw new Error(`Unexpected tzdb version: ${tzdbVersion}`)
  }
  // a..z -> 1..26, za -> 27, zb -> 28, ...
  const letters = match[2]!
  const release = [...letters].reduce((sum, ch) => sum + ch.charCodeAt(0) - 96, 0)
  return `1.${match[1]}.${release}`
}

function main(): void {
  const pem = process.env.TZDB_SIGNING_KEY
  if (!pem) {
    throw new Error('TZDB_SIGNING_KEY (PEM-encoded Ed25519 private key) is not set')
  }
  const privateKey = createPrivateKey(pem)
  const publicKey = Buffer.from(
    createPublicKey(privateKey).export({ format: 'jwk' }).x!,
    'base64url'
  ).toString('base64')

  const bytes = readFileSync(join(PACKAGE_DIR, 'tzdb.json'))
  const { version } = JSON.parse(bytes.toString('utf8')) as { version: string }
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const signature = sign(null, Buffer.from(`${version}\n${sha256}`), privateKey).toString('base64')
  const npmVersion = packageVersion(version)

  const manifest: TzdbManifest = {
    version,
    releaseDate: new Date().toISOString(),
    dataUrl: `https://cdn.jsdelivr.net/npm/clockwork-tz-data@${npmVersion}/tzdb.json`,
    sha256,
    signature,
    keyId: createHash('sha256').update(publicKey).digest('hex').slice(0, 16),
  }
  writeFileSync(join(PACKAGE_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)

  const pkgPath = join(PACKAGE_DIR, 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version: string }
  pkg.version = npmVersion
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)

  console.log(`Signed tzdb ${version} as clockwork-tz-data@${npmVersion} (public key ${publicKey})`)
}

if (import.meta.main) {
  main()
}
