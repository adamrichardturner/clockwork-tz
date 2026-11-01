import { describe, expect, it } from 'vitest'
import {
  bumpFor,
  insertChangelog,
  nextVersion,
  parseCommit,
  RELEASE_COMMIT,
  renderNotes,
  type ParsedCommit,
} from '../scripts/lib/release.ts'

const REPO = 'https://github.com/o/r'

const commit = (subject: string, body = '', hash = 'abcdef1234567890') =>
  parseCommit({ hash, subject, body })

describe('release planning', () => {
  it('parses conventional commit headers', () => {
    expect(commit('feat(tzdb): update bundled data to 2026g')).toMatchObject({
      type: 'feat',
      scope: 'tzdb',
      description: 'update bundled data to 2026g',
      breaking: false,
    })
    expect(commit('fix: handle Samoa')).toMatchObject({ type: 'fix', scope: undefined })
    expect(commit('Merge pull request #8 from x/y')).toBeNull()
    expect(commit('update readme')).toBeNull()
  })

  it('detects breaking changes from ! and footers', () => {
    expect(commit('feat!: drop Node 20')?.breaking).toBe(true)
    expect(commit('refactor(api)!: rename option')?.breaking).toBe(true)
    const footer = commit(
      'feat: new parser',
      'Details.\n\nBREAKING CHANGE: parse() is strict\nnow.'
    )
    expect(footer?.breaking).toBe(true)
    expect(footer?.breakingNote).toBe('parse() is strict now.')
  })

  it('picks the largest bump', () => {
    const parsed = (subjects: string[]) => subjects.map(s => commit(s)!) as ParsedCommit[]
    expect(bumpFor(parsed(['docs: typo', 'ci: cache', 'chore: deps', 'test: more']))).toBeNull()
    expect(bumpFor(parsed(['docs: typo', 'fix: offset']))).toBe('patch')
    expect(bumpFor(parsed(['perf: faster lookups']))).toBe('patch')
    expect(bumpFor(parsed(['fix: a', 'feat: b']))).toBe('minor')
    expect(bumpFor(parsed(['feat: b', 'fix!: c']))).toBe('major')
  })

  it('computes the next version', () => {
    expect(nextVersion('1.0.0', 'patch')).toBe('1.0.1')
    expect(nextVersion('1.0.9', 'minor')).toBe('1.1.0')
    expect(nextVersion('1.4.2', 'major')).toBe('2.0.0')
    expect(() => nextVersion('1.0.0-beta.1', 'patch')).toThrow()
  })

  it('recognises its own release commits', () => {
    expect(RELEASE_COMMIT.test('chore(release): v1.2.3')).toBe(true)
    expect(RELEASE_COMMIT.test('chore(release): prepare docs')).toBe(false)
  })

  it('renders grouped notes with commit links', () => {
    const notes = renderNotes(
      [
        commit('feat(api): add getZoneCountries', '', '1111111aaaa')!,
        commit('fix: Lord Howe overlap', '', '2222222bbbb')!,
        commit('feat!: named exports only', 'BREAKING CHANGE: no default export', '3333333cccc')!,
        commit('docs: readme', '', '4444444dddd')!,
      ],
      REPO
    )
    expect(notes).toBe(
      [
        '### Breaking changes',
        '',
        `- named exports only ([3333333](${REPO}/commit/3333333cccc))`,
        '  no default export',
        '',
        '### Features',
        '',
        `- **api:** add getZoneCountries ([1111111](${REPO}/commit/1111111aaaa))`,
        '',
        '### Fixes',
        '',
        `- Lord Howe overlap ([2222222](${REPO}/commit/2222222bbbb))`,
      ].join('\n')
    )
  })

  it('inserts the release above the newest existing one', () => {
    const changelog = '# Changelog\n\nIntro.\n\n## [1.0.0] - 2026-11-01\n\nFirst release.\n'
    const updated = insertChangelog(
      changelog,
      '1.1.0',
      'v1.0.0',
      '2026-12-01',
      '### Features\n\n- x',
      REPO
    )
    expect(updated).toBe(
      '# Changelog\n\nIntro.\n\n' +
        `## [1.1.0](${REPO}/compare/v1.0.0...v1.1.0) - 2026-12-01\n\n### Features\n\n- x\n\n` +
        '## [1.0.0] - 2026-11-01\n\nFirst release.\n'
    )
  })
})
