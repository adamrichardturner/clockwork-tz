# clockworktz

[![npm version](https://img.shields.io/npm/v/clockworktz.svg)](https://www.npmjs.com/package/clockworktz)
[![CI](https://github.com/adamrichardturner/clockworktz/actions/workflows/ci.yml/badge.svg)](https://github.com/adamrichardturner/clockworktz/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Docs](https://img.shields.io/badge/docs-clockworktz.dev-b45309)](https://clockworktz.dev/docs)

Timezone conversions that get the weird zones right. clockworktz handles half-hour and
45-minute offsets, 30-minute DST, skipped days, negative DST and historical local mean time,
and it resolves local times inside DST gaps and overlaps exactly the way
[Temporal](https://tc39.es/proposal-temporal/docs/) does.

- **Zero runtime dependencies.** The core uses the platform's `Intl` API (about 21 kB gzipped, about 11 kB minified when you import only `fromUTC`).
- **Host independent.** Results never depend on the timezone of the machine running the code.
- **Two engines.** `system-intl` uses the OS/browser timezone data. `embedded-tzdb` uses a
  pinned IANA tzdb release (30 kB gzipped) for identical results everywhere, with optional
  signed updates.
- **ESM + CommonJS** with complete TypeScript types.

**[Documentation](https://clockworktz.dev/docs)** · [Quick start](https://clockworktz.dev/docs/getting-started)
· [API reference](https://clockworktz.dev/docs/api) · [Recipes](https://clockworktz.dev/docs/recipes)

## Installation

```bash
npm install clockworktz
```

Node.js 20 or later, or any browser with `Intl.DateTimeFormat` time zone support.

## Quick start

```ts
import { fromUTC, convert, interpretLocal, format } from 'clockworktz'

fromUTC('2024-07-15T14:00:00Z', 'Australia/Lord_Howe')
// {
//   utc: '2024-07-15T14:00:00.000Z',
//   zone: 'Australia/Lord_Howe',
//   local: '2024-07-16 00:30:00.000',
//   offsetMinutes: 630,
//   isDST: false,
//   abbreviation: '+1030',
//   source: 'system-intl'
// }

// Strings without an offset are wall-clock time in the source zone
convert('2024-07-15T16:30:00', 'Asia/Kathmandu', 'America/St_Johns').local
// '2024-07-15 08:15:00.000'

format('2024-07-15T14:00:00Z', 'Pacific/Chatham', 'yyyy-MM-dd HH:mm xxx')
// '2024-07-16 02:45 +12:45'

// 02:30 doesn't exist in New York on 10 March 2024: it resolves to 03:30 EDT
interpretLocal('2024-03-10T02:30:00', 'America/New_York').local
// '2024-03-10 03:30:00.000'
```

Instants can be `Date` objects, epoch milliseconds, or ISO strings with an offset
(`Z`, `+05:45`, `-0330`, `+00:19:32`). Zones are IANA identifiers (links such as
`Asia/Calcutta` work) or fixed offsets such as `+05:30`.

## DST gaps and overlaps

A local time can be **skipped** (spring forward) or **repeated** (fall back).
`interpretLocal` and `convert` take a `disambiguation` option with Temporal's semantics:

| Option                   | Skipped time (gap)                  | Repeated time (overlap)     |
| ------------------------ | ----------------------------------- | --------------------------- |
| `compatible` _(default)_ | later instant (pushed past the gap) | earlier instant             |
| `earliest`               | earlier instant (pulled before)     | earlier instant             |
| `latest`                 | later instant                       | later instant               |
| `reject`                 | throws `InvalidTimeError`           | throws `AmbiguousTimeError` |

```ts
import { interpretLocal, AmbiguousTimeError } from 'clockworktz'

// 01:30 happens twice in New York on 3 November 2024
interpretLocal('2024-11-03T01:30:00', 'America/New_York').utc // '2024-11-03T05:30:00.000Z' (EDT)
interpretLocal('2024-11-03T01:30:00', 'America/New_York', { disambiguation: 'latest' }).utc
// '2024-11-03T06:30:00.000Z' (EST)

try {
  interpretLocal('2024-11-03T01:30:00', 'America/New_York', { disambiguation: 'reject' })
} catch (error) {
  error instanceof AmbiguousTimeError // true
}

// Samoa skipped 30 December 2011 entirely
interpretLocal('2011-12-30T12:00:00', 'Pacific/Apia').local // '2011-12-31 12:00:00.000'
```

This works the same for 30-minute DST (Lord Howe), 45-minute offsets (Chatham) and two-hour
DST (Antarctica/Troll).

See the [DST guide](https://clockworktz.dev/docs/dst-disambiguation) for choosing a strategy.

## Engines

### `system-intl` (default)

Uses the timezone data built into Node.js or the browser (ICU). There's no data to ship, and
updates arrive with the OS and runtime. Different platforms can be on different tzdb
releases. `isDST` is derived by comparing a zone's January and July offsets, because `Intl`
does not expose the DST flag.

### `embedded-tzdb`

Uses a compiled IANA tzdb release for deterministic results on every platform, including
exact DST flags and abbreviations, local mean time before standardisation, and every
transition. A snapshot ships in the `clockworktz/tzdb` subpath, so you only pay for it if
you import it:

```ts
import { initClockworkTZ, tzdbVersion } from 'clockworktz'
import { tzdb } from 'clockworktz/tzdb'

await initClockworkTZ({ engine: 'embedded-tzdb', data: tzdb })
tzdbVersion() // '2026f'
```

#### Signed updates

IANA publishes several releases a year, sometimes at short notice. To pick them up without
releasing your app again, point the engine at the signed manifest:

```ts
import { initClockworkTZ, DEFAULT_MANIFEST_URL } from 'clockworktz'
import { tzdb } from 'clockworktz/tzdb'

await initClockworkTZ({
  engine: 'embedded-tzdb',
  data: tzdb, // used immediately and whenever an update can't be verified
  manifestURL: DEFAULT_MANIFEST_URL, // jsDelivr, from the @adamrichardturner/clockworktz-data package
  autoUpdateIntervalMs: 24 * 60 * 60 * 1000, // 0 disables periodic checks
})
```

An update is only applied when all of these hold:

- The manifest's Ed25519 signature verifies against the public key built into the library.
- The data's SHA-256 matches the signed hash.
- The version is newer than the data already loaded.

Anything else keeps the current data. Verified data is cached per manifest and key in
`localStorage` (browsers) or memory (Node). Other tabs using the same manifest pick it up
through `BroadcastChannel` and load it too. `onDataUpdate(version => …)` fires whenever new
data is loaded. If you host your own data, pass `publicKey`. See [SECURITY.md](./SECURITY.md)
for the signing details.

See [Engines & tzdb data](https://clockworktz.dev/docs/engines) for a full comparison.

## API

### Conversion

| Function                                               | Description                                                                              |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `fromUTC(instant, zone, opts?)`                        | Instant → `ClockworkTime` in `zone`                                                      |
| `interpretLocal(wallTime, zone, opts?)`                | Wall time (string without offset, or `{ year, month, day, hour?, … }`) → `ClockworkTime` |
| `convert(input, fromZone, toZone, opts?)`              | Wall time in `fromZone` (or an instant) → `ClockworkTime` in `toZone`                    |
| `getZoneInfo(instant, zone)`                           | `{ offsetSeconds, isDST, abbreviation }`                                                 |
| `getOffset(instant, zone)`                             | Offset in minutes (fractional only for local mean time)                                  |
| `isDST(instant, zone)`                                 | `false` for invalid zones                                                                |
| `isValidTimeZone(zone)` / `canonicalizeTimeZone(zone)` | Validation and canonical names (`Asia/Calcutta` → `Asia/Kolkata`)                        |
| `getUserTimeZone()`                                    | The runtime's zone, canonicalized, falling back to `UTC`                                 |
| `getZoneCountries(zone)`                               | ISO country codes using the zone (`Europe/Zurich` → `CH`, `DE`, `LI`)                    |
| `listTimeZones({ labelStyle, at, locale, country })`   | Zones sorted by offset; `labelStyle` is `original`, `offset`, `abbrev` or `altName`      |

`opts` accepts `format` (pattern for `local`), `locale` and `disambiguation`.

Country data comes from IANA's `zone1970.tab` with the embedded engine, and from
`Intl.Locale#getTimeZones` with the Intl engine where the runtime supports it (not all
browsers do; without it, countries are empty).

```ts
listTimeZones({ country: 'AU', labelStyle: 'offset' }).map(z => z.label)
// ['(UTC+08:00) Australia/Perth', '(UTC+08:45) Australia/Eucla', …, '(UTC+10:30) Australia/Lord_Howe']

interpretLocal({ year: 2024, month: 11, day: 3, hour: 1, minute: 30 }, 'America/New_York', {
  disambiguation: 'latest',
}).utc // '2024-11-03T06:30:00.000Z'
```

### Errors

Everything clockworktz throws is a `TimezoneError`: invalid zones, unparseable input,
unsupported format tokens and invalid data. `InvalidTimeError` (skipped time) and
`AmbiguousTimeError` (repeated time) are subclasses thrown by `disambiguation: 'reject'`.

### Formatting

`format(instant, zone, pattern?, locale?)` supports this date-fns-compatible subset:

| Token                 | Output                                         |
| --------------------- | ---------------------------------------------- |
| `yyyy` `yy` `y`       | Year: `2024`, `24`, `2024`                     |
| `M` `MM` `MMM` `MMMM` | Month: `7`, `07`, `Jul`, `July`                |
| `d` `dd`              | Day of month                                   |
| `EEE` `EEEE`          | Weekday: `Mon`, `Monday`                       |
| `H` `HH` `h` `hh` `a` | Hours (24h / 12h) and `AM`/`PM`                |
| `m` `mm` `s` `ss`     | Minutes, seconds                               |
| `S` `SS` `SSS`        | Fractional seconds                             |
| `zzz` `zzzz`          | Abbreviation (`EDT`, `+0545`), long name       |
| `x` `xx` `xxx`        | Offset: `+0545`, `+0545`, `+05:45`             |
| `xxxx` `xxxxx`        | Offset with seconds when non-zero: `+05:53:28` |
| `X…`                  | As `x`, but `Z` for UTC                        |
| `O` `OOOO`            | `GMT+5:45`, `GMT+05:45`                        |
| `'text'`, `''`        | Literal text, literal quote                    |

Unsupported tokens throw `TimezoneError`. `FORMAT_PATTERNS` provides common patterns, and
there are also `formatWithPattern`, `formatFor`, `formatRange`, `formatDuration`,
`formatRelative`, `formatNow`, `formatOffset` and `isValidFormatPattern`.

### Transitions and clocks

```ts
import { getNextTransition, getTransitions, watchZoneTransitions, onTick } from 'clockworktz'

getNextTransition('Australia/Lord_Howe', '2024-07-15T14:00:00Z')
// { date: 2024-10-05T15:30:00.000Z, fromOffset: 630, toOffset: 660,
//   isDSTStart: true, isDSTEnd: false, fromAbbreviation: '+1030', toAbbreviation: '+11' }

getTransitions('Pacific/Chatham', '2024-01-01T00:00:00Z', '2025-01-01T00:00:00Z') // two transitions

const stopWatching = watchZoneTransitions('Europe/London', at => rerender(at))
const stopTicking = onTick(now => rerender(now), 1000)
```

Transitions are exact (to the second) with both engines. Watchers handle transitions more
than 24.8 days away, the `setTimeout` limit. `onTick` fires immediately and then on wall-clock
boundaries (every whole second for `1000`), so clocks never drift. Call
`cleanupAllWatchers()` on shutdown.

### Parsing

`parse`, `parseDate`, `safeParse`, `isParseable`, `parseAny`, `parseRange`, `parseTime`,
`parseOffset`, `parseComponents` and `normalize` parse ISO 8601 strictly. Strings without an
offset are read in `defaultTimezone` (default `UTC`), never in the host's timezone.

### Lifecycle

`initClockworkTZ(options)` throws `TimezoneError` for invalid options (for example `data` or
`manifestURL` without `engine: 'embedded-tzdb'`, or invalid data), leaving the current engine
in place. Otherwise it returns a promise that settles once any manifest load has been
attempted. Also: `dispose()` (stops auto-updates and cross-tab listening), `engine()`,
`tzdbVersion()`, `getStatus()`, `onDataUpdate(callback)`, `refreshTimezoneData()`,
`setEngine(engine)` and `getCurrentEngine()`.

Every export, with types, is in the [API reference](https://clockworktz.dev/docs/api).

## Unusual zones covered by the test suite

Lord Howe (+10:30 with 30-minute DST), Chatham (+12:45/+13:45), Eucla (+8:45), Kathmandu
(+5:45), Marquesas (−9:30), Kiritimati (+14), Samoa's skipped day in 2011, Casablanca's
Ramadan suspensions, Dublin's negative DST, Troll's two-hour DST, Caracas 2016, Pyongyang 2015
and 2018, `Etc/GMT+5` sign inversion, renamed zones such as `Europe/Kiev`, local mean time
before 1900, and rules beyond 2100. Both engines are tested against the same fixtures. The
embedded data is checked against ICU for every zone from 1970 onwards, and the suite runs
under several host timezones and in Chromium, Firefox and WebKit.

## License

[MIT](./LICENSE) © Adam Turner
