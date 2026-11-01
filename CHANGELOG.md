# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [1.0.0] - Unreleased

First release.

### Added

- Timezone conversions with zero runtime dependencies: `fromUTC`, `interpretLocal`,
  `convert`, `getZoneInfo`, `getOffset`, `isDST`, `listTimeZones`, and
  `canonicalizeTimeZone`. Results never depend on the host's timezone.
- Local times inside DST gaps and overlaps resolve with Temporal's semantics: `compatible`
  (default), `earliest`, `latest` and `reject`.
- Fixed-offset zones such as `+05:30`, and IANA links such as `Asia/Calcutta`.
- `system-intl` engine using the platform's `Intl` timezone data.
- `embedded-tzdb` engine backed by compiled IANA tzdb data (`clockwork-tz/tzdb`), with exact
  DST flags, abbreviations, local mean time and transitions.
- Ed25519-signed tzdb updates via the `clockwork-tz-data` package on jsDelivr.
- A built-in formatter supporting a date-fns-compatible subset of tokens.
- Transition lookup (`getNextTransition`, `getPreviousTransition`, `getTransitions`),
  transition watchers and `onTick`.
- Strict ISO 8601 parsing, including offsets with seconds.

[1.0.0]: https://github.com/adamrichardturner/clockwork-tz/commits/main
