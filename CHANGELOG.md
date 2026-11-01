# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [1.0.0-alpha.2] - Unreleased

### Fixed

- Offsets were computed as zone offset minus host offset, so conversions were wrong on any
  host not at UTC+0.
- `isDST` was wrong in the southern hemisphere.
- `earliest` and `latest` returned the same instant for repeated times, and `reject` did not
  throw.
- Wall times were built in the host timezone, corrupting times inside host DST gaps.

### Added

- `embedded-tzdb` engine backed by compiled IANA tzdb data (`clockwork-tz/tzdb`), with
  exact DST flags, abbreviations, local mean time and transitions.
- Ed25519-signed tzdb updates via the `clockwork-tz-data` package on jsDelivr.
- `compatible` disambiguation (Temporal semantics), now the default.
- Fixed-offset zones (`+05:30`), `canonicalizeTimeZone`, `getZoneInfo`, `getTransitions`,
  `dispose`, and `abbreviation` on `ClockworkTime`.
- Epoch milliseconds accepted wherever an instant is.

### Changed

- Zero runtime dependencies; formatting is built in (date-fns-compatible token subset).
- Named exports only; `formatRelative(date, zone, relativeTo?)`; internal helpers no longer
  exported.
- `initClockworkTZ` returns a promise and replaces any previous auto-update timer.
- Toolchain: TypeScript 7, tsdown, oxlint, Vitest 5.

## [1.0.0-alpha.1] - 2025-09-07

Initial alpha.

[1.0.0-alpha.2]: https://github.com/adamrichardturner/clockwork-tz/compare/v1.0.0-alpha.1...HEAD
[1.0.0-alpha.1]: https://github.com/adamrichardturner/clockwork-tz/releases/tag/v1.0.0-alpha.1
