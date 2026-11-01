/**
 * Conventional Commits → next version and release notes.
 *
 * feat → minor, fix/perf → patch, a "!" after the type or a "BREAKING CHANGE:"
 * footer → major. Other types (docs, ci, chore, test, build, refactor, style)
 * don't trigger a release on their own.
 */

export type Bump = 'major' | 'minor' | 'patch'

export interface Commit {
  hash: string
  subject: string
  body: string
}

export interface ParsedCommit {
  hash: string
  type: string
  scope: string | undefined
  description: string
  breaking: boolean
  /** Text after "BREAKING CHANGE:" when present */
  breakingNote: string | undefined
}

const HEADER = /^(?<type>[a-z]+)(?:\((?<scope>[^)]+)\))?(?<bang>!)?: (?<description>.+)$/

/** Release commits made by the workflow itself */
export const RELEASE_COMMIT = /^chore\(release\): v\d+\.\d+\.\d+/

export function parseCommit(commit: Commit): ParsedCommit | null {
  const match = HEADER.exec(commit.subject.trim())
  if (!match?.groups) {
    return null
  }
  const footer = /^BREAKING[ -]CHANGE: ([\s\S]+)$/m.exec(commit.body)
  return {
    hash: commit.hash,
    type: match.groups.type!,
    scope: match.groups.scope,
    description: match.groups.description!.trim(),
    breaking: Boolean(match.groups.bang) || footer !== null,
    breakingNote: footer?.[1]
      ?.trim()
      .split(/\n\s*\n/)[0]
      ?.replace(/\s+/g, ' '),
  }
}

export function bumpFor(commits: ParsedCommit[]): Bump | null {
  if (commits.some(c => c.breaking)) {
    return 'major'
  }
  if (commits.some(c => c.type === 'feat')) {
    return 'minor'
  }
  if (commits.some(c => c.type === 'fix' || c.type === 'perf')) {
    return 'patch'
  }
  return null
}

export function nextVersion(current: string, bump: Bump): string {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(current)
  if (!match) {
    throw new Error(`Cannot bump non-release version ${current}`)
  }
  const [major, minor, patch] = match.slice(1).map(Number) as [number, number, number]
  switch (bump) {
    case 'major':
      return `${major + 1}.0.0`
    case 'minor':
      return `${major}.${minor + 1}.0`
    case 'patch':
      return `${major}.${minor}.${patch + 1}`
  }
}

function line(c: ParsedCommit, repoUrl: string): string {
  const scope = c.scope ? `**${c.scope}:** ` : ''
  return `- ${scope}${c.description} ([${c.hash.slice(0, 7)}](${repoUrl}/commit/${c.hash}))`
}

/**
 * Release notes in Markdown, grouped by kind of change
 */
export function renderNotes(commits: ParsedCommit[], repoUrl: string): string {
  const sections: Array<[string, ParsedCommit[]]> = [
    ['Breaking changes', commits.filter(c => c.breaking)],
    ['Features', commits.filter(c => c.type === 'feat' && !c.breaking)],
    ['Fixes', commits.filter(c => c.type === 'fix' && !c.breaking)],
    ['Performance', commits.filter(c => c.type === 'perf' && !c.breaking)],
  ]
  return sections
    .filter(([, list]) => list.length > 0)
    .map(([title, list]) => {
      const lines = list.map(c =>
        title === 'Breaking changes' && c.breakingNote
          ? `${line(c, repoUrl)}\n  ${c.breakingNote}`
          : line(c, repoUrl)
      )
      return `### ${title}\n\n${lines.join('\n')}`
    })
    .join('\n\n')
}

/**
 * Insert a release section into a Keep a Changelog style file, above the
 * newest existing release
 */
export function insertChangelog(
  changelog: string,
  version: string,
  previousTag: string,
  date: string,
  notes: string,
  repoUrl: string
): string {
  const heading = `## [${version}](${repoUrl}/compare/${previousTag}...v${version}) - ${date}`
  const section = `${heading}\n\n${notes}\n\n`
  const firstRelease = changelog.search(/^## \[/m)
  if (firstRelease === -1) {
    return `${changelog.trimEnd()}\n\n${section}`
  }
  return changelog.slice(0, firstRelease) + section + changelog.slice(firstRelease)
}
