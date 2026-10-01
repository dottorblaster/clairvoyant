import { describe, expect, test } from 'vitest'
import { formatEventStart, formatEventWindow } from './format'

const LOCALE = 'en-GB'
const TZ = 'UTC'

describe('formatEventStart', () => {
  test('says so when there is no date', () => {
    expect(formatEventStart(null)).toBe('No date set')
  })

  test('formats the instant', () => {
    expect(formatEventStart('2026-03-18T19:00:00Z', LOCALE, TZ)).toBe('18/03/2026, 19:00:00')
  })
})

describe('formatEventWindow', () => {
  test('says so when there is no start', () => {
    expect(formatEventWindow(null, null)).toBe('No date set')
    expect(formatEventWindow(null, '2026-03-18T22:00:00Z')).toBe('No date set')
  })

  test('shows only the start when the end is open', () => {
    expect(formatEventWindow('2026-03-18T19:00:00Z', null, LOCALE, TZ)).toBe('18/03/2026, 19:00:00')
  })

  test('shows both ends separated by an en dash', () => {
    expect(formatEventWindow('2026-03-18T19:00:00Z', '2026-03-18T22:00:00Z', LOCALE, TZ)).toBe(
      '18/03/2026, 19:00:00 – 18/03/2026, 22:00:00',
    )
  })
})
