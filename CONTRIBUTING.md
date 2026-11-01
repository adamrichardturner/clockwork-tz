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
`src/tzdb/data.generated.ts` and `packages/clockwork-tz-data/tzdb.json`. It needs `make`, a C
compiler and network access. The scheduled TZDB Update workflow does this automatically,
signs the data and opens a pull request.

## First release

npm trusted publishing can only be configured for a package that already exists, so the
first publish of each package is done by hand from a logged-in maintainer:

1. Publish the data package, then link it to the TZDB Update workflow:

   ```bash
   (cd packages/clockwork-tz-data && npm publish --access public --provenance=false)
   npm trust github clockwork-tz-data --repo adamrichardturner/clockwork-tz --file tzdb-update.yml --allow-publish
   ```

2. Publish the library, then link it to the Release workflow:

   ```bash
   npm run prepublishOnly && npm publish --access public --provenance=false
   npm trust github clockwork-tz --repo adamrichardturner/clockwork-tz --file release.yml --allow-publish
   ```

   Then push the matching `v<version>` tag. The Release workflow sees the version is already
   on npm, skips publishing, and creates the GitHub release.

After that, every release goes through the tag-driven workflow below.

## Commits and releases

Commits follow [Conventional Commits](https://www.conventionalcommits.org/). To release:

1. Bump `version` in `package.json` and update `CHANGELOG.md`.
2. Push a `v<version>` tag.

The Release workflow publishes to npm with provenance. Prereleases go to the `alpha`, `beta`
or `rc` dist-tag.
