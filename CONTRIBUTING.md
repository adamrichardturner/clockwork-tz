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

## First release

npm trusted publishing can only be configured for a package that already exists, so the
first publish of each package is done by hand from a logged-in maintainer:

1. Publish the data package, then link it to the TZDB Update workflow:

   ```bash
   (cd packages/clockworktz-data && npm publish --access public --provenance=false)
   npm trust github @adamrichardturner/clockworktz-data --repo adamrichardturner/clockworktz --file tzdb-update.yml --allow-publish
   ```

2. Publish the library, then link it to the Release workflow:

   ```bash
   npm run prepublishOnly && npm publish --access public --provenance=false
   npm trust github clockworktz --repo adamrichardturner/clockworktz --file release.yml --allow-publish
   ```

   Then push the matching `v<version>` tag. The Release workflow sees the version is already
   on npm, skips publishing, and creates the GitHub release.

After that, every release goes through the tag-driven workflow below.

## Commits and releases

Commits follow [Conventional Commits](https://www.conventionalcommits.org/). To release:

1. Bump `version` in `package.json` (`npm version patch|minor|major --no-git-tag-version`) and
   move the `Unreleased` notes in `CHANGELOG.md` under the new version.
2. Merge that to `main`, then tag the merge commit and push the tag:

   ```bash
   git checkout main && git pull
   git tag v1.0.1 && git push origin v1.0.1
   ```

The Release workflow checks the tag matches `package.json`, runs every check, publishes to npm
with provenance and creates the GitHub release. Prereleases (`1.1.0-beta.1`) go to the `alpha`,
`beta`, `rc` or `next` dist-tag instead of `latest`.

To test the release pipeline without publishing, run it by hand. Manual runs are always dry
runs:

```bash
gh workflow run release.yml
```

## Timezone data updates

The TZDB Update workflow runs daily. When IANA publishes a new release it:

1. builds it, verifying IANA's signatures
2. signs it with the `TZDB_SIGNING_KEY` secret and tests the library against it
3. publishes `@adamrichardturner/clockworktz-data` (so running apps get the update through the signed manifest)
4. opens a `feat(tzdb): …` pull request with the new bundled snapshot, and starts CI on it

Merge that pull request, then release a patch version so new installs bundle the new data.

If **Settings → Actions → General → Allow GitHub Actions to create and approve pull requests**
is off, the workflow opens an issue with a link to create the pull request instead.

To test the pipeline end to end without publishing anything:

```bash
gh workflow run tzdb-update.yml -f dry_run=true
```
