export interface EventSections<T> {
  upcoming: T[]
  past: T[]
  undated: T[]
}

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
