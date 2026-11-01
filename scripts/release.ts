/**
 * Decide whether main has something to release, and prepare it.
 *
 *   node scripts/release.ts [--write] [--notes-file <path>]
 *
 * Reads the Conventional Commits since the last v* tag and picks the next
 * version (see scripts/lib/release.ts). A version bumped by hand in
 * package.json, above the last tag, is released as-is.
 *
 * Prints a summary, and when GITHUB_OUTPUT is set writes `release`,
 * `version` and `previous_tag` outputs. With --write it updates CHANGELOG.md;
 * the workflow sets the package version with `npm version`.
 */

import { execFileSync } from 'node:child_process'
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  bumpFor,
  insertChangelog,
  nextVersion,
  parseCommit,
  RELEASE_COMMIT,
  renderNotes,
  type Commit,
} from './lib/release.ts'

const ROOT = resolve(import.meta.dirname, '..')
const REPO_URL = 'https://github.com/adamrichardturner/clockworktz'

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim()
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) {
      return diff
    }
  }
  return 0
}

function output(values: Record<string, string>): void {
  const file = process.env.GITHUB_OUTPUT
  if (file) {
    appendFileSync(
      file,
      Object.entries(values)
        .map(([k, v]) => `${k}=${v}\n`)
        .join('')
    )
  }
}

function main(): void {
  const args = process.argv.slice(2)
  const write = args.includes('--write')
  const notesIndex = args.indexOf('--notes-file')
  const notesFile = notesIndex >= 0 ? args[notesIndex + 1] : undefined

  const previousTag = git('describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*', 'HEAD')
  const tagVersion = previousTag.replace(/^v/, '')
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string }

  const raw = git('log', `${previousTag}..HEAD`, '--no-merges', '--format=%H%x1f%s%x1f%b%x1e')
  const commits: Commit[] = raw
    .split('\x1e')
    .map(entry => entry.trim())
    .filter(Boolean)
    .map(entry => {
      const [hash = '', subject = '', body = ''] = entry.split('\x1f')
      return { hash, subject, body }
    })
    .filter(c => !RELEASE_COMMIT.test(c.subject))

  const parsed = commits.map(parseCommit).filter(c => c !== null)
  const bump = bumpFor(parsed)

  let version: string | null = null
  if (compareVersions(pkg.version, tagVersion) > 0) {
    version = pkg.version
    console.log(`package.json was bumped by hand to ${version}`)
  } else if (bump) {
    version = nextVersion(tagVersion, bump)
  }

  console.log(
    `Last release ${previousTag}; ${commits.length} commit(s) since, ` +
      `${parsed.length} conventional; bump: ${bump ?? 'none'}`
  )

  if (!version) {
    console.log('Nothing to release (only docs, ci, chore, test or similar changes)')
    output({ release: 'false', previous_tag: previousTag })
    return
  }

  const notes =
    renderNotes(parsed, REPO_URL) || `Release ${version}. See the commits since ${previousTag}.`
  console.log(`\nNext version: ${version}\n\n${notes}\n`)

  if (notesFile) {
    writeFileSync(notesFile, `${notes}\n`)
  }
  if (write) {
    const path = join(ROOT, 'CHANGELOG.md')
    const date = new Date().toISOString().slice(0, 10)
    writeFileSync(
      path,
      insertChangelog(readFileSync(path, 'utf8'), version, previousTag, date, notes, REPO_URL)
    )
  }

  output({ release: 'true', version, previous_tag: previousTag })
}

main()
