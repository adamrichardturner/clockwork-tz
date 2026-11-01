# Contributing

Requires Node.js 22.18 or later (the toolchain runs TypeScript scripts natively).

```bash
npm install
npm run typecheck   # library, tests and scripts
npm run lint        # oxlint
npm run test:run    # node test suite
npm run test:browser  # Chromium, Firefox, WebKit (run `npx playwright install` first)
npm run build
npm run check:pkg   # publint + are-the-types-wrong
```

Timezone bugs often only appear when the host isn't at UTC+0, so run the suite under a few
`TZ` values before sending a change:

```bash
for z in UTC America/New_York Australia/Lord_Howe Asia/Kathmandu; do TZ=$z npm run test:run; done
```

## Timezone data

`npm run build:tzdb [version]` downloads an IANA release, builds `zic`, and regenerates
`src/tzdb/data.generated.ts` and `packages/clockworktz-data/tzdb.json`. It needs `make`, a C
compiler and network access. The scheduled TZDB Update workflow does this automatically,
signs the data and opens a pull request.

## Commits and releases

Releases are automatic. Every merge to `main` runs the Release workflow. It reads the
[Conventional Commits](https://www.conventionalcommits.org/) since the last `v*` tag and
picks the next version:

| Commit                                             | Release               |
| -------------------------------------------------- | --------------------- |
| `fix: …`, `perf: …`                                | patch (1.0.0 → 1.0.1) |
| `feat: …`                                          | minor (1.0.0 → 1.1.0) |
| `feat!: …`, or a `BREAKING CHANGE: …` footer       | major (1.0.0 → 2.0.0) |
| `docs`, `ci`, `chore`, `test`, `build`, `refactor` | no release            |

When there's something to release, the workflow:

1. runs every check (typecheck, lint, format, tests, build, package checks)
2. bumps `package.json`, adds a `CHANGELOG.md` section, and commits `chore(release): vX.Y.Z`
   with a matching tag to `main`
3. publishes `clockworktz` to npm with provenance, through npm trusted publishing (no token)
4. creates the GitHub release with the generated notes

So to ship a change, give its commits (or the PR title, for squash merges) the right type,
and merge. The PR title check enforces the format.

To release a specific version, set `version` in `package.json` by hand in your PR. A version
above the last tag is released as-is.

See what the next merge would release, without committing or publishing:

```bash
gh workflow run release.yml
```

If a run fails after tagging (for example, npm was down), run it again for real. It
publishes the tagged version npm doesn't have yet:

```bash
gh workflow run release.yml -f dry_run=false
```

Trusted publishing is linked to `.github/workflows/release.yml`, so keep that file name. If
npm ever needs re-linking:

```bash
npm trust github clockworktz --repo adamrichardturner/clockworktz --file release.yml --allow-publish
```

## Timezone data updates

The TZDB Update workflow runs daily. When IANA publishes a new release it:

1. builds it, verifying IANA's signatures
2. signs it with the `TZDB_SIGNING_KEY` secret and tests the library against it
3. publishes `@adamrichardturner/clockworktz-data` (so running apps get the update through the signed manifest)
4. opens a `fix(tzdb): …` pull request with the new bundled snapshot, and starts CI on it

Merging that pull request releases a patch version automatically, so new installs bundle
the new data.

If **Settings → Actions → General → Allow GitHub Actions to create and approve pull requests**
is off, the workflow opens an issue with a link to create the pull request instead.

To test the pipeline end to end without publishing anything:

```bash
gh workflow run tzdb-update.yml -f dry_run=true
```
