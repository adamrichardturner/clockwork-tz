/**
 * Build clockworktz timezone data from an IANA tzdb release.
 *
 *   node scripts/build-tzdb.ts [version]
 *
 * Downloads tzcode + tzdata, builds IANA's own `zic`, compiles the rearguard
 * format (positive DST everywhere, matching ICU) to slim TZif files, and
 * converts those into the compact JSON the embedded engine reads:
 *
 *   packages/clockworktz-data/tzdb.json   data file published to the CDN
 *   src/tzdb/data.generated.ts             bundled snapshot for `clockworktz/tzdb`
 */

import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseTzif } from './lib/tzif.ts'
import type { CompactZone, TzdbData } from '../src/tzdb/types.ts'

const ROOT = resolve(import.meta.dirname, '..')
const RELEASES = 'https://data.iana.org/time-zones/releases'

/** Fingerprint of the key that signs tz releases (Paul Eggert) */
const TZ_SIGNING_KEY = '7E3792A9D8ACF7D633BC1588ED97E90E62AA7E34'
const KEYSERVER = 'hkps://keyserver.ubuntu.com'

function hasGpg(): boolean {
  return spawnSync('gpg', ['--version'], { stdio: 'ignore' }).status === 0
}

/**
 * Verify each tarball against its detached .asc signature from IANA, made by
 * the pinned tz signing key. Required when TZDB_REQUIRE_SIGNATURE=1 (CI);
 * skipped with a warning when gpg is not installed otherwise.
 */
async function verifySignatures(work: string, files: string[]): Promise<void> {
  if (!hasGpg()) {
    if (process.env.TZDB_REQUIRE_SIGNATURE === '1') {
      throw new Error('gpg is required to verify tzdb downloads (TZDB_REQUIRE_SIGNATURE=1)')
    }
    console.warn('gpg not found: skipping signature verification of tzdb downloads')
    return
  }

  const home = join(work, 'gnupg')
  mkdirSync(home, { mode: 0o700 })
  execFileSync(
    'gpg',
    ['--homedir', home, '--batch', '--keyserver', KEYSERVER, '--recv-keys', TZ_SIGNING_KEY],
    {
      stdio: 'inherit',
    }
  )

  for (const file of files) {
    await download(`${RELEASES}/${file}.asc`, join(work, `${file}.asc`))
    const result = spawnSync(
      'gpg',
      ['--homedir', home, '--batch', '--status-fd', '1', '--verify', `${file}.asc`, file],
      { cwd: work, encoding: 'utf8' }
    )
    const valid = result.stdout
      .split('\n')
      .some(line => line.startsWith('[GNUPG:] VALIDSIG ') && line.includes(TZ_SIGNING_KEY))
    if (result.status !== 0 || !valid) {
      throw new Error(`Signature verification failed for ${file}:\n${result.stderr}`)
    }
    console.log(`Verified ${file}`)
  }
}

async function download(url: string, dest: string): Promise<void> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`GET ${url} failed: HTTP ${response.status}`)
  }
  writeFileSync(dest, new Uint8Array(await response.arrayBuffer()))
}

async function latestVersion(): Promise<string> {
  const response = await fetch('https://data.iana.org/time-zones/tzdb/version')
  if (!response.ok) {
    throw new Error(`Could not read latest tzdb version: HTTP ${response.status}`)
  }
  return (await response.text()).trim()
}

function encodeZone(bytes: Uint8Array): CompactZone {
  const tzif = parseTzif(bytes)
  if (tzif.types.length > 36) {
    throw new Error(`Too many local time types (${tzif.types.length}) to encode`)
  }

  const deltas: string[] = []
  let previous = 0
  tzif.times.forEach((time, index) => {
    deltas.push((index === 0 ? time : time - previous).toString(36))
    previous = time
  })

  return {
    t: deltas.join(','),
    i: tzif.typeIndices.map(i => i.toString(36)).join(''),
    y: tzif.types.map(t => [t.utoff, t.isdst ? 1 : 0, t.abbr]),
    f: tzif.footer,
  }
}

async function main(): Promise<void> {
  const version = process.argv[2] ?? (await latestVersion())
  if (!/^\d{4}[a-z]+$/.test(version)) {
    throw new Error(`Unexpected tzdb version: ${version}`)
  }
  console.log(`Building tzdb ${version}`)

  const work = mkdtempSync(join(tmpdir(), 'clockworktz-build-'))
  try {
    const tarballs = [`tzcode${version}.tar.gz`, `tzdata${version}.tar.gz`]
    for (const name of tarballs) {
      await download(`${RELEASES}/${name}`, join(work, name))
    }
    await verifySignatures(work, tarballs)
    for (const name of tarballs) {
      execFileSync('tar', ['-xzf', name], { cwd: work })
    }

    execFileSync('make', ['-s', 'zic', 'rearguard.zi'], { cwd: work, stdio: 'inherit' })

    const zoneinfo = join(work, 'zoneinfo')
    mkdirSync(zoneinfo)
    execFileSync(join(work, 'zic'), ['-b', 'slim', '-d', zoneinfo, 'rearguard.zi'], {
      cwd: work,
      stdio: 'inherit',
    })

    const source = readFileSync(join(work, 'rearguard.zi'), 'utf8')
    const zoneNames: string[] = []
    const links: Record<string, string> = {}
    for (const line of source.split('\n')) {
      // Lines are either compact ("Z", "L") or full ("Zone", "Link") form
      const fields = line.split('#')[0]!.trim().split(/\s+/)
      if ((fields[0] === 'Z' || fields[0] === 'Zone') && fields[1]) {
        zoneNames.push(fields[1])
      } else if ((fields[0] === 'L' || fields[0] === 'Link') && fields[1] && fields[2]) {
        links[fields[2]] = fields[1]
      }
    }

    // zone1970.tab: country codes, coordinates, zone, comment
    const listed = new Set<string>(['UTC'])
    const countries: Record<string, string[]> = {}
    for (const line of readFileSync(join(work, 'zone1970.tab'), 'utf8').split('\n')) {
      if (line && !line.startsWith('#')) {
        const [codes, , zone] = line.split('\t')
        if (zone && codes) {
          listed.add(zone)
          countries[zone] = codes.split(',')
        }
      }
    }

    const zones: Record<string, CompactZone> = {}
    for (const name of zoneNames.sort()) {
      zones[name] = encodeZone(readFileSync(join(zoneinfo, name)))
    }

    // Links may point at other links; resolve them so lookups take one step
    for (const [alias, target] of Object.entries(links)) {
      let resolved = target
      for (let hops = 0; !(resolved in zones) && hops < 8; hops++) {
        resolved = links[resolved] ?? resolved
      }
      if (!(resolved in zones)) {
        throw new Error(`Link ${alias} -> ${target} does not resolve to a zone`)
      }
      links[alias] = resolved
    }

    const data: TzdbData = {
      version,
      zones,
      links: Object.fromEntries(Object.entries(links).sort(([a], [b]) => a.localeCompare(b))),
      listed: [...listed].filter(zone => zone in zones || zone in links).sort(),
      countries: Object.fromEntries(
        Object.entries(countries)
          .filter(([zone]) => zone in zones)
          .sort(([a], [b]) => a.localeCompare(b))
      ),
    }

    const json = JSON.stringify(data)
    writeFileSync(join(ROOT, 'packages', 'clockworktz-data', 'tzdb.json'), json)
    writeFileSync(
      join(ROOT, 'src', 'tzdb', 'data.generated.ts'),
      [
        `// Generated by scripts/build-tzdb.ts from IANA tzdb ${version}. Do not edit.`,
        `import type { TzdbData } from './types.js'`,
        ``,
        `const data: TzdbData = JSON.parse(${JSON.stringify(json)})`,
        ``,
        `export default data`,
        ``,
      ].join('\n')
    )

    console.log(
      `Wrote ${Object.keys(zones).length} zones and ${Object.keys(links).length} links ` +
        `(${(json.length / 1024).toFixed(0)} KiB)`
    )
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
