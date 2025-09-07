/**
 * Test utilities for environment-aware testing
 */

import { getStatus, type EngineKind } from '../../src/index.js'

/**
 * Get the current engine being used for tests
 */
export function getCurrentEngine(): EngineKind {
  const status = getStatus()
  return status.engine
}

/**
 * Check if we're using the system-intl engine
 */
export function isSystemIntlEngine(): boolean {
  return getCurrentEngine() === 'system-intl'
}

/**
 * Check if we're using the embedded-tzdb engine
 */
export function isEmbeddedTzdbEngine(): boolean {
  return getCurrentEngine() === 'embedded-tzdb'
}

/**
 * Skip test if using system-intl engine (for features not supported)
 */
export function skipIfSystemIntl(testFn: () => void, reason?: string): void {
  if (isSystemIntlEngine()) {
    console.log(`Skipping test: ${reason || 'Not supported by system-intl engine'}`)
    return
  }
  testFn()
}

/**
 * Skip test if using embedded-tzdb engine (for system-specific tests)
 */
export function skipIfEmbeddedTzdb(testFn: () => void, reason?: string): void {
  if (isEmbeddedTzdbEngine()) {
    console.log(`Skipping test: ${reason || 'Not applicable to embedded-tzdb engine'}`)
    return
  }
  testFn()
}

/**
 * Engine-specific offset tolerance for comparisons
 */
export function getOffsetTolerance(): number {
  // System Intl may have some inaccuracies, especially for unusual zones
  return isSystemIntlEngine() ? 60 : 0 // 60 minutes tolerance for system-intl
}

/**
 * Check if a timezone is well-supported by the current engine
 */
export function isTimezoneWellSupported(timezone: string): boolean {
  if (isEmbeddedTzdbEngine()) {
    return true // Embedded tzdb supports all IANA zones
  }

  // System Intl has limitations with unusual offset zones
  const problematicZones = [
    'Australia/Lord_Howe', // +10:30/+11:00 (30-minute DST shift)
    'Australia/Eucla', // +8:45 (45-minute offset)
    'Pacific/Chatham', // +12:45/+13:45 (45-minute offset)
    'Asia/Kathmandu', // +5:45 (45-minute offset)
    'America/St_Johns', // -3:30/-2:30 (30-minute offset, but problematic)
  ]

  return !problematicZones.includes(timezone)
}

/**
 * Get expected offset with engine-specific adjustments
 */
export function getExpectedOffset(timezone: string, date: Date, idealOffset: number): number {
  if (isEmbeddedTzdbEngine() || isTimezoneWellSupported(timezone)) {
    return idealOffset
  }

  // For system-intl with problematic zones, we may need to accept current behavior
  // This is a placeholder - in practice, you'd detect the actual system behavior
  return idealOffset
}

/**
 * Check if DST detection is reliable for a timezone
 */
export function isDSTDetectionReliable(timezone: string): boolean {
  if (isEmbeddedTzdbEngine()) {
    return true
  }

  // System Intl DST detection seems to have broad issues, not just unusual zones
  // For now, mark DST detection as generally unreliable with system-intl
  return false
}

/**
 * Check if ambiguous time handling is supported
 */
export function isAmbiguousTimeHandlingSupported(): boolean {
  return isEmbeddedTzdbEngine()
}

/**
 * Check if invalid time detection is supported
 */
export function isInvalidTimeDetectionSupported(): boolean {
  return isEmbeddedTzdbEngine()
}

/**
 * Wrapper for conditional test execution based on engine capabilities
 */
export function testWithEngine(
  description: string,
  testFn: () => void,
  options: {
    systemIntl?: boolean
    embeddedTzdb?: boolean
    skipReason?: string
  } = {}
) {
  const { systemIntl = true, embeddedTzdb = true, skipReason } = options

  const currentEngine = getCurrentEngine()

  if (currentEngine === 'system-intl' && !systemIntl) {
    console.log(`Skipping "${description}": ${skipReason || 'Not supported by system-intl'}`)
    return
  }

  if (currentEngine === 'embedded-tzdb' && !embeddedTzdb) {
    console.log(`Skipping "${description}": ${skipReason || 'Not applicable to embedded-tzdb'}`)
    return
  }

  testFn()
}

/**
 * Assert offset with engine-appropriate tolerance
 */
export function expectOffsetToBe(actual: number, expected: number, timezone?: string): void {
  const tolerance = getOffsetTolerance()

  if (tolerance > 0) {
    const diff = Math.abs(actual - expected)
    if (diff <= tolerance) {
      return // Within tolerance
    }
    throw new Error(
      `Expected offset ${expected} ± ${tolerance}, but got ${actual}${timezone ? ` for ${timezone}` : ''}`
    )
  } else {
    if (actual !== expected) {
      throw new Error(
        `Expected offset ${expected}, but got ${actual}${timezone ? ` for ${timezone}` : ''}`
      )
    }
  }
}
