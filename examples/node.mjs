#!/usr/bin/env node

/**
 * Node.js example demonstrating clockwork-tz usage
 *
 * Run with: node examples/node.mjs
 */

import {
  initClockworkTZ,
  fromUTC,
  convert,
  format,
  listTimeZones,
  onTick,
  watchZoneTransitions,
  getStatus,
  FORMAT_PATTERNS,
} from '../dist/index.js'

// Initialize the library
console.log('Initializing clockwork-tz...')
initClockworkTZ({ engine: 'system-intl' })

const status = getStatus()
console.log(`Initialized with ${status.engine} engine`)
console.log(`   TZDB Version: ${status.tzdbVersion || 'N/A (using system)'}`)
console.log(`   Data Loaded: ${status.dataLoaded}`)
console.log()

// Example 1: Convert a UTC meeting time to multiple zones
console.log('Example 1: Global Meeting Time Conversion')
console.log('='.repeat(50))

const meetingUTC = '2024-07-15T14:00:00.000Z' // 2 PM UTC
const meetingZones = [
  'UTC',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Australia/Lord_Howe', // Unusual +10:30/+11:00 offset
  'Asia/Kathmandu', // +5:45 offset
  'America/St_Johns', // -3:30/-2:30 offset
]

console.log(`Meeting scheduled for: ${meetingUTC}`)
console.log()

meetingZones.forEach(zone => {
  const result = fromUTC(meetingUTC, zone)
  const formatted = format(meetingUTC, zone, FORMAT_PATTERNS.human)

  console.log(`${zone.padEnd(20)} | ${formatted}`)
  console.log(
    `${' '.repeat(20)} | Offset: ${formatOffset(result.offsetMinutes)}, DST: ${result.isDST ? 'Yes' : 'No'}`
  )
  console.log()
})

// Example 2: Handle timezone conversions with unusual offsets
console.log('Example 2: Unusual Timezone Conversions')
console.log('='.repeat(50))

const localTime = '2024-07-15T16:30:00' // 4:30 PM local time

const conversions = [
  { from: 'Australia/Lord_Howe', to: 'Pacific/Chatham', name: 'Lord Howe → Chatham' },
  { from: 'Asia/Kathmandu', to: 'Australia/Eucla', name: 'Kathmandu → Eucla' },
  { from: 'America/St_Johns', to: 'Asia/Kolkata', name: 'Newfoundland → India' },
]

conversions.forEach(({ from, to, name }) => {
  const result = convert(localTime, from, to)

  console.log(`${name}:`)
  console.log(`  ${localTime} in ${from}`)
  console.log(`  = ${result.local} in ${to}`)
  console.log(`  (UTC: ${result.utc})`)
  console.log()
})

// Example 3: List timezones with different label styles
console.log('Example 3: Timezone Listing')
console.log('='.repeat(50))

const labelStyles = ['original', 'offset', 'abbrev']

labelStyles.forEach(labelStyle => {
  console.log(`\nLabel style: ${labelStyle}`)
  console.log('-'.repeat(30))

  const zones = listTimeZones({ labelStyle }).filter(zone =>
    ['UTC', 'America/New_York', 'Europe/London', 'Asia/Tokyo', 'Australia/Lord_Howe'].includes(
      zone.value
    )
  )

  zones.forEach(zone => {
    console.log(`${zone.value.padEnd(20)} | ${zone.label}`)
  })
})

// Example 4: Real-time clock with multiple timezones
console.log('\nExample 4: Real-time Multi-timezone Clock')
console.log('='.repeat(50))

const clockZones = ['UTC', 'America/New_York', 'Europe/London', 'Asia/Tokyo', 'Australia/Sydney']

let tickCount = 0
const maxTicks = 5 // Run for 5 seconds

console.log('Starting real-time clock (5 seconds)...\n')

const stopTicking = onTick(now => {
  // Clear previous lines
  if (tickCount > 0) {
    process.stdout.write('\x1B[' + clockZones.length + 'A') // Move cursor up
  }

  clockZones.forEach(zone => {
    const formatted = format(now, zone, 'yyyy-MM-dd HH:mm:ss zzz')
    console.log(`${zone.padEnd(20)} | ${formatted}`)
  })

  tickCount++
  if (tickCount >= maxTicks) {
    stopTicking()
    console.log('\nReal-time clock stopped')

    // Example 5: Watch for timezone transitions
    console.log('\nExample 5: Timezone Transition Watching')
    console.log('='.repeat(50))

    // Note: This is just a demonstration - actual transitions are rare
    console.log('Setting up transition watchers for major zones...')

    const watchedZones = ['America/New_York', 'Europe/London', 'Australia/Sydney']
    const watchers = []

    watchedZones.forEach(zone => {
      const stopWatching = watchZoneTransitions(zone, transitionDate => {
        console.log(`Timezone transition detected in ${zone} at ${transitionDate}`)
      })
      watchers.push(stopWatching)
    })

    console.log(`Watching ${watchedZones.length} zones for DST transitions...`)
    console.log('   (In a real app, this would run continuously)')

    // Clean up after a short delay
    setTimeout(() => {
      watchers.forEach(stop => stop())
      console.log('Stopped watching for transitions')

      // Final example: Error handling
      console.log('\nExample 6: Error Handling')
      console.log('='.repeat(50))

      try {
        // Try to use an invalid timezone
        fromUTC(meetingUTC, 'Invalid/Timezone')
      } catch (error) {
        console.log(`Caught expected error: ${error.message}`)
      }

      try {
        // Try to interpret an invalid local time during DST transition
        convert('2024-03-10T02:30:00', 'America/New_York', 'UTC', { disambiguation: 'reject' })
      } catch (error) {
        console.log(`Caught expected error: ${error.message}`)
      }

      console.log('\nAll examples completed successfully!')
      console.log('\nFor more information, visit: https://github.com/adamturner/clockwork-tz')
    }, 1000)
  }
}, 1000)

// Utility function to format offset
function formatOffset(offsetMinutes) {
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const absMinutes = Math.abs(offsetMinutes)
  const hours = Math.floor(absMinutes / 60)
  const minutes = absMinutes % 60

  return `${sign}${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
}

// Handle process termination gracefully
process.on('SIGINT', () => {
  console.log('\n\nGoodbye!')
  process.exit(0)
})
