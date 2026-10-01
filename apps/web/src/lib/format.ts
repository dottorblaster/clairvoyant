/**
 * `startsAt` is optional in `community.lexicon.calendar.event` — only `createdAt`
 * and `name` are required — so an indexed event really can have no date. Every
 * formatter here has to cope with that instead of rendering the epoch.
 */

const instant = (value: string): string => new Date(value).toLocaleString()

/** `"18/03/2026, 19:00 – 18/03/2026, 22:00"`, or just the start when open-ended. */
export const formatEventWindow = (startsAt: string | null, endsAt: string | null): string => {
  if (startsAt === null) return 'No date set'
  if (endsAt === null) return instant(startsAt)
  return `${instant(startsAt)} – ${instant(endsAt)}`
}

/** The short form used in lists: just when it starts. */
export const formatEventStart = (startsAt: string | null): string =>
  startsAt === null ? 'No date set' : instant(startsAt)
