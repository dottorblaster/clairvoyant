import { describe, expect, test } from 'vitest'
import { partitionEventsByStart } from './eventSections'

const now = new Date('2026-06-15T12:00:00Z')
const event = (id: string, startsAt: string | null) => ({ id, starts_at: startsAt })

describe('partitionEventsByStart', () => {
  test('splits upcoming, past and undated while preserving order', () => {
    const { upcoming, past, undated } = partitionEventsByStart(
      [
        event('past-old', '2020-01-01T00:00:00Z'),
        event('soon', '2026-06-16T00:00:00Z'),
        event('undated', null),
        event('past-recent', '2026-06-01T00:00:00Z'),
      ],
      now,
    )

    expect(upcoming.map((e) => e.id)).toEqual(['soon'])
    expect(past.map((e) => e.id)).toEqual(['past-old', 'past-recent'])
    expect(undated.map((e) => e.id)).toEqual(['undated'])
  })

  test('an event starting exactly now counts as upcoming', () => {
    const { upcoming, past } = partitionEventsByStart([event('now', '2026-06-15T12:00:00Z')], now)
    expect(upcoming.map((e) => e.id)).toEqual(['now'])
    expect(past).toEqual([])
  })

  test('handles an empty list', () => {
    expect(partitionEventsByStart([], now)).toEqual({ upcoming: [], past: [], undated: [] })
  })
})
