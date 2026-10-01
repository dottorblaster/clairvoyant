export interface EventSections<T> {
  upcoming: T[]
  past: T[]
  undated: T[]
}

/**
 * Split a list of events into the three sections "my events" renders. The API
 * already ordered them, so a single pass in order preserves that order. An event
 * starting exactly at `now` counts as upcoming.
 */
export const partitionEventsByStart = <T extends { starts_at: string | null }>(
  events: readonly T[],
  now: Date,
): EventSections<T> => {
  const upcoming: T[] = []
  const past: T[] = []
  const undated: T[] = []

  for (const event of events) {
    if (event.starts_at === null) {
      undated.push(event)
      continue
    }
    const start = new Date(event.starts_at)
    if (start >= now) upcoming.push(event)
    else past.push(event)
  }

  return { upcoming, past, undated }
}
