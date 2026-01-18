# clockwork-tz

[![npm version](https://badge.fury.io/js/clockwork-tz.svg)](https://badge.fury.io/js/clockwork-tz)
[![CI](https://github.com/adamturner/clockwork-tz/workflows/CI/badge.svg)](https://github.com/adamturner/clockwork-tz/actions)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A comprehensive timezone library for JavaScript and TypeScript applications. Provides accurate timezone conversions with automatic DST handling, supporting both system-based and deterministic timezone calculations.

## Features

- **Accurate conversions** - Handles unusual timezone offsets (+10:30, +8:45, +5:45) and complex DST rules
- **Framework agnostic** - Works in Node.js, browsers, React Native, and Electron
- **Dual engine architecture** - System Intl API (default) or optional embedded IANA tzdb for consistency
- **TypeScript support** - Complete type definitions with strict typing
- **Real-time capabilities** - DST transition watching and live clock utilities
- **Zero dependencies** - Default engine uses platform APIs only
- **Universal builds** - ESM and CommonJS with tree-shaking support

## Installation

```bash
npm install clockwork-tz
```

## Quick Start

```javascript
import { initClockworkTZ, fromUTC, convert, format } from 'clockwork-tz'

// Initialize (optional - uses system timezone data by default)
initClockworkTZ()

// Convert UTC to any timezone
const result = fromUTC('2024-07-15T14:00:00.000Z', 'Australia/Lord_Howe')
console.log(result.local) // "2024-07-16 01:00:00.000"
console.log(result.offsetMinutes) // 660 (+11:00 DST)
console.log(result.isDST) // true

// Convert between timezones
const converted = convert('2024-07-15T16:30:00', 'Asia/Kathmandu', 'America/St_Johns')
console.log(converted.local) // "2024-07-15 06:45:00.000"

// Format with patterns
const formatted = format(new Date(), 'Pacific/Chatham', 'yyyy-MM-dd HH:mm zzz')
console.log(formatted) // "2024-07-16 03:45 +1345"
```

## Engines

### System Intl Engine (Default)

Uses platform `Intl.DateTimeFormat` and `date-fns-tz` for timezone calculations:

- No external data files
- Automatic OS/browser updates
- Suitable for most applications

### Embedded TZDB Engine (Optional)

Uses a specific IANA timezone database version for deterministic results:

- Consistent across all platforms
- Optional CDN updates with verification
- Ideal for applications requiring exact reproducibility

```javascript
initClockworkTZ({
  engine: 'embedded-tzdb',
  manifestURL: 'https://cdn.example.com/tzdb-manifest.json',
  autoUpdateIntervalMs: 24 * 60 * 60 * 1000, // Daily updates
})
```

#### Using Embedded TZDB Engine

The embedded engine provides deterministic timezone calculations using a specific version of the IANA timezone database. This ensures consistent behavior across platforms and over time.

**Basic Usage:**

```javascript
import { initClockworkTZ, fromUTC } from 'clockwork-tz'

// Initialize with embedded engine
initClockworkTZ({
  engine: 'embedded-tzdb',
  manifestURL: 'https://cdn.yourcompany.com/manifest.json',
})

// The engine will automatically fetch and verify timezone data
const result = fromUTC(new Date(), 'America/New_York')
console.log(result.local) // Deterministic result from embedded tzdb
```

**Loading Data Manually:**

```javascript
import { initClockworkTZ, getCurrentEngine } from 'clockwork-tz'
import tzdbData from './tzdb-2024b.json' // Your TZDB data file

// Initialize with embedded engine (no CDN)
initClockworkTZ({
  engine: 'embedded-tzdb',
})

// Load data manually
const engine = getCurrentEngine()
await engine.loadTzdbData(tzdbData, '2024b')

// Now ready to use
const result = fromUTC(new Date(), 'Europe/London')
```

**Auto-Update Configuration:**

```javascript
initClockworkTZ({
  engine: 'embedded-tzdb',
  manifestURL: 'https://cdn.yourcompany.com/manifest.json',
  autoUpdateIntervalMs: 24 * 60 * 60 * 1000, // Check daily
})

// Listen for data updates
onDataUpdate(version => {
  console.log(`Timezone data updated to version ${version}`)
})

// Force a manual update
await refreshTimezoneData()
```

**Signature Verification:**

The embedded engine automatically verifies cryptographic signatures of downloaded timezone data to ensure data integrity. This prevents tampering and ensures the data comes from a trusted source.

```javascript
// Signatures are verified automatically
// If verification fails, cached data is used instead
// Check the status:
const status = getStatus()
console.log(status.dataLoaded) // true if data is loaded and verified
console.log(status.tzdbVersion) // "2024b"
console.log(status.lastUpdate) // Date of last successful update
```

**Benefits of Embedded TZDB:**

1. **Deterministic**: Same results across all platforms and environments
2. **Reproducible**: Version-locked for consistent testing and debugging
3. **Historical Accuracy**: Access to complete IANA timezone history
4. **No Platform Dependencies**: Works even if system timezone data is outdated
5. **Verified Updates**: Cryptographically signed data ensures integrity

**When to Use:**

- Financial applications requiring audit trails
- Scientific simulations requiring reproducibility
- Applications deployed across heterogeneous environments
- When you need historical timezone accuracy
- When platform timezone data can't be trusted

**Production Setup:**

See [PRODUCTION.md](./PRODUCTION.md) for complete guide on:
- Generating cryptographic keys
- Building TZDB JSON data
- Setting up CDN infrastructure
- Configuring automatic updates



## API Reference

### Core Functions

#### `fromUTC(input, zone, options?)`

Convert UTC time to a specific timezone.

```javascript
const result = fromUTC('2024-07-15T14:00:00Z', 'Australia/Lord_Howe')
// Returns ClockworkTime object with local time, offset, DST status
```

#### `interpretLocal(localISO, zone, options?)`

Interpret a local time string in a specific timezone with disambiguation for DST transitions.

```javascript
// Handle ambiguous time during fall-back transition
const result = interpretLocal('2024-11-03T01:30:00', 'America/New_York', {
  disambiguation: 'latest', // 'earliest', 'latest', or 'reject'
})
```

#### `convert(input, fromZone, toZone, options?)`

Convert time from one timezone to another.

```javascript
const result = convert('2024-07-15T14:30:00', 'Asia/Kathmandu', 'Pacific/Chatham')
```

#### `format(input, zone, pattern?)`

Format a date/time in a specific timezone using date-fns patterns.

```javascript
const formatted = format(new Date(), 'Europe/London', 'yyyy-MM-dd HH:mm zzz')
```

### Utility Functions

#### `getOffset(input, zone)` & `isDST(input, zone)`

```javascript
const offset = getOffset(new Date(), 'Australia/Eucla') // 525 minutes (+8:45)
const inDST = isDST(new Date(), 'America/New_York') // true/false
```

#### `listTimeZones(options?)`

```javascript
const zones = listTimeZones({ labelStyle: 'offset' })
// Returns array of { value: string, label: string, offsetMinutes: number }
```

### Real-time Features

#### `onTick(callback, granularityMs?)`

```javascript
const stopTicking = onTick(now => {
  console.log('Current time:', format(now, 'UTC'))
}, 1000)

// Later: stopTicking()
```

#### `watchZoneTransitions(zone, callback)`

```javascript
const stopWatching = watchZoneTransitions('America/New_York', transitionDate => {
  console.log('DST transition at:', transitionDate)
})
```

## Handling DST Transitions

The library properly handles problematic times during DST transitions:

### Invalid Times (Spring Forward)

```javascript
try {
  // This time doesn't exist (2 AM becomes 3 AM)
  interpretLocal('2024-03-10T02:30:00', 'America/New_York', {
    disambiguation: 'reject',
  })
} catch (error) {
  console.log(error instanceof InvalidTimeError) // true
}

// Or handle gracefully
const result = interpretLocal('2024-03-10T02:30:00', 'America/New_York', {
  disambiguation: 'latest', // Use time after the gap
})
```

### Ambiguous Times (Fall Back)

```javascript
// This time occurs twice (1:30 AM happens twice)
const first = interpretLocal('2024-11-03T01:30:00', 'America/New_York', {
  disambiguation: 'earliest', // First occurrence (DST)
})

const second = interpretLocal('2024-11-03T01:30:00', 'America/New_York', {
  disambiguation: 'latest', // Second occurrence (standard)
})

console.log(first.isDST) // true
console.log(second.isDST) // false
```

## Unusual Timezone Support

The library handles timezone offsets that often cause issues in other libraries:

```javascript
// Lord Howe Island: +10:30 standard, +11:00 DST (30-minute shift)
const lordHowe = fromUTC('2024-01-15T12:00:00Z', 'Australia/Lord_Howe')
console.log(lordHowe.offsetMinutes) // 660 (+11:00)

// Eucla: Fixed +8:45 offset
const eucla = fromUTC('2024-07-15T12:00:00Z', 'Australia/Eucla')
console.log(eucla.offsetMinutes) // 525 (+8:45)

// Nepal: +5:45 offset
const kathmandu = fromUTC('2024-07-15T12:00:00Z', 'Asia/Kathmandu')
console.log(kathmandu.offsetMinutes) // 345 (+5:45)

// Chatham Islands: +12:45 standard, +13:45 DST
const chatham = fromUTC('2024-01-15T12:00:00Z', 'Pacific/Chatham')
console.log(chatham.offsetMinutes) // 825 (+13:45)

// Newfoundland: -3:30 standard, -2:30 DST
const stjohns = fromUTC('2024-07-15T12:00:00Z', 'America/St_Johns')
console.log(stjohns.offsetMinutes) // -150 (-2:30)
```

## Environment Support

### Node.js

```javascript
const { initClockworkTZ, fromUTC } = require('clockwork-tz')
// or
import { initClockworkTZ, fromUTC } from 'clockwork-tz'
```

### Browser

```html
<script type="module">
  import { initClockworkTZ, fromUTC } from 'https://cdn.skypack.dev/clockwork-tz'
</script>
```

### React/Vue/Angular

```javascript
import { initClockworkTZ, onTick } from 'clockwork-tz'

// React hook example
function useWorldClock(zones) {
  const [times, setTimes] = useState({})

  useEffect(() => {
    return onTick(now => {
      const newTimes = {}
      zones.forEach(zone => {
        newTimes[zone] = fromUTC(now, zone)
      })
      setTimes(newTimes)
    }, 1000)
  }, [zones])

  return times
}
```

## Format Patterns

Built-in format patterns for common use cases:

```javascript
import { FORMAT_PATTERNS, formatWithPattern } from 'clockwork-tz'

const date = new Date()
const zone = 'Europe/Paris'

formatWithPattern(date, zone, 'default') // "2024-07-15 16:30:00 CEST"
formatWithPattern(date, zone, 'human') // "July 15, 2024 at 4:30 PM CEST"
formatWithPattern(date, zone, 'iso8601') // "2024-07-15T16:30:00+02:00"
formatWithPattern(date, zone, 'rfc2822') // "Mon, 15 Jul 2024 16:30:00 +0200"
```

## TypeScript Support

Complete TypeScript definitions included:

```typescript
import type { ClockworkTime, Disambiguation, EngineKind } from 'clockwork-tz'

interface ClockworkTime {
  utc: string
  zone: string
  local: string
  offsetMinutes: number
  isDST: boolean
  source: EngineKind
  tzdbVersion?: string
}
```

## Testing

```bash
npm test                    # Run all tests
npm run test:watch         # Watch mode
npm run test:coverage      # With coverage report
```

The test suite covers:

- Unusual timezone offset calculations
- DST transition edge cases
- Ambiguous time handling
- Round-trip conversion accuracy
- Historical date processing

## Bundle Size

| Engine        | Gzipped | Notes                       |
| ------------- | ------- | --------------------------- |
| system-intl   | ~15KB   | Uses platform timezone data |
| embedded-tzdb | ~45KB   | Includes IANA tzdb subset   |

Tree-shaking friendly - only import what you use.

## Contributing

Contributions are welcome. Please read the contributing guidelines and ensure all tests pass before submitting a pull request.

## License

MIT License - see LICENSE file for details.

## Known Limitations

- Future timezone rule changes require updates
- Historical accuracy limited by platform data (pre-1970)
- JavaScript Date limitations (no leap second support)
- Some unusual timezone identifiers may not be supported by system engine

## Migration

### From moment-timezone

```javascript
// Before
moment.tz('2024-07-15 14:00', 'America/New_York').format()

// After
format('2024-07-15T14:00:00', 'America/New_York')
```

### From date-fns-tz

```javascript
// Before
formatInTimeZone(date, 'Europe/London', 'yyyy-MM-dd HH:mm zzz')

// After
format(date, 'Europe/London', 'yyyy-MM-dd HH:mm zzz')
```
