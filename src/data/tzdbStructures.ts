/**
 * Comprehensive TZDB data structures based on IANA timezone database format
 * 
 * This module defines the complete structure for timezone data that will be
 * used by the EmbeddedTzdbEngine for deterministic timezone calculations.
 */

/**
 * Root TZDB data structure
 */
export interface TzdbData {
  /** TZDB version (e.g., "2024a") */
  version: string
  /** Timezone zones with their rules and transitions */
  zones: Record<string, TzdbZone>
  /** DST/offset rules referenced by zones */
  rules: Record<string, TzdbRule[]>
  /** Timezone aliases/links (e.g., "US/Eastern" -> "America/New_York") */
  links: Record<string, string>
  /** Leap second information */
  leapSeconds?: TzdbLeapSecond[]
  /** Metadata about the database */
  metadata: TzdbMetadata
}

/**
 * Database metadata
 */
export interface TzdbMetadata {
  /** Build timestamp */
  buildTime: string
  /** Source data hash for integrity */
  dataHash: string
  /** Supported date range */
  dateRange: {
    start: string // ISO date
    end: string   // ISO date
  }
  /** Number of zones included */
  zoneCount: number
  /** Number of rules included */
  ruleCount: number
}

/**
 * Timezone zone definition
 */
export interface TzdbZone {
  /** Zone identifier (e.g., "America/New_York") */
  name: string
  /** Timezone transitions (chronologically ordered) */
  transitions: TzdbTransition[]
  /** Default rule before first transition */
  defaultRule?: TzdbZoneRule
  /** Human-readable names in different locales */
  displayNames?: Record<string, string>
}

/**
 * Timezone transition point
 */
export interface TzdbTransition {
  /** Unix timestamp when transition occurs (UTC) */
  timestamp: number
  /** Zone rule that becomes active after this transition */
  rule: TzdbZoneRule
  /** Type of transition */
  type: 'standard' | 'daylight' | 'war' | 'custom'
}

/**
 * Zone rule defining offset and DST behavior
 */
export interface TzdbZoneRule {
  /** Base offset from UTC in minutes */
  offsetMinutes: number
  /** DST rule name (if any) */
  dstRule?: string
  /** Timezone abbreviation (e.g., "EST", "EDT") */
  abbreviation: string
  /** Additional offset for DST in minutes */
  dstOffsetMinutes?: number
  /** Whether this rule represents DST */
  isDst: boolean
}

/**
 * DST rule definition
 */
export interface TzdbRule {
  /** Rule name */
  name: string
  /** Starting year (inclusive) */
  fromYear: number
  /** Ending year (inclusive, 9999 for ongoing) */
  toYear: number
  /** Month when rule applies (1-12) */
  month: number
  /** Day specification */
  day: TzdbDaySpec
  /** Time when transition occurs */
  time: TzdbTimeSpec
  /** Offset change in minutes */
  offsetMinutes: number
  /** Timezone abbreviation during this rule */
  abbreviation: string
}

/**
 * Day specification for DST rules
 */
export interface TzdbDaySpec {
  /** Type of day specification */
  type: 'exact' | 'last' | 'first' | 'before' | 'after'
  /** Day of month (1-31) for exact, day of week (0-6, Sun=0) for others */
  value: number
  /** Reference day for before/after types */
  reference?: number
}

/**
 * Time specification for transitions
 */
export interface TzdbTimeSpec {
  /** Hour (0-23) */
  hour: number
  /** Minute (0-59) */
  minute: number
  /** Second (0-59) */
  second: number
  /** Time type */
  type: 'wall' | 'standard' | 'utc'
}

/**
 * Leap second definition
 */
export interface TzdbLeapSecond {
  /** Unix timestamp of leap second */
  timestamp: number
  /** Adjustment (+1 or -1 seconds) */
  adjustment: number
}

/**
 * Parsed and indexed TZDB data for fast lookups
 */
export interface ParsedTzdbData {
  /** Original data version */
  version: string
  /** Indexed zones for O(1) lookup */
  zones: Map<string, ParsedZone>
  /** Zone aliases */
  aliases: Map<string, string>
  /** All timezone identifiers (canonical + aliases) */
  identifiers: Set<string>
  /** Metadata */
  metadata: TzdbMetadata
  /** Leap seconds for precise calculations */
  leapSeconds: TzdbLeapSecond[]
}

/**
 * Parsed zone with pre-computed transitions
 */
export interface ParsedZone {
  /** Zone name */
  name: string
  /** Sorted transitions for binary search */
  transitions: ParsedTransition[]
  /** Display names */
  displayNames: Record<string, string>
  /** Current active rule (cached) */
  currentRule?: TzdbZoneRule
  /** Earliest transition timestamp */
  earliestTransition?: number
  /** Latest transition timestamp */
  latestTransition?: number
}

/**
 * Parsed transition with computed values
 */
export interface ParsedTransition {
  /** Transition timestamp (UTC) */
  timestamp: number
  /** Active rule after transition */
  rule: TzdbZoneRule
  /** Transition type */
  type: TzdbTransition['type']
  /** Local time when transition occurs */
  localTimestamp: number
  /** Whether this creates an invalid time gap */
  createsGap: boolean
  /** Whether this creates an ambiguous time overlap */
  createsOverlap: boolean
  /** Duration of gap/overlap in minutes */
  gapOverlapMinutes?: number
}

/**
 * Timezone calculation result
 */
export interface TzdbCalculationResult {
  /** Calculated offset in minutes */
  offsetMinutes: number
  /** Whether DST is active */
  isDst: boolean
  /** Timezone abbreviation */
  abbreviation: string
  /** Transition that applies (if any) */
  transition?: ParsedTransition
  /** Next transition (for predictive calculations) */
  nextTransition?: ParsedTransition
}

/**
 * Time ambiguity information during DST transitions
 */
export interface TimeAmbiguityInfo {
  /** Whether the time is ambiguous */
  isAmbiguous: boolean
  /** Whether the time is invalid (gap) */
  isInvalid: boolean
  /** Possible interpretations for ambiguous times */
  interpretations?: {
    earlier: TzdbCalculationResult
    later: TzdbCalculationResult
  }
  /** Suggested time for invalid times */
  suggestedTime?: {
    earliest: Date
    latest: Date
  }
}



