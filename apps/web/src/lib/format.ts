/**
 * `startsAt` is optional in `community.lexicon.calendar.event` — only `createdAt`
 * and `name` are required — so an indexed event really can have no date. Every
 * formatter here has to cope with that instead of rendering the epoch.
 *
 * `locale`/`timeZone` are injectable so tests are deterministic; both default to
 * the environment's choice, which is what the app wants.
 */
const instant = (value: string, locale?: string, timeZone?: string): string =>
  new Date(value).toLocaleString(locale, timeZone === undefined ? undefined : { timeZone })

/** `"18/03/2026, 19:00 – 18/03/2026, 22:00"`, or just the start when open-ended. */
export const formatEventWindow = (
  startsAt: string | null,
  endsAt: string | null,
  locale?: string,
  timeZone?: string,
): string => {
  if (startsAt === null) return 'No date set'
  if (endsAt === null) return instant(startsAt, locale, timeZone)
  return `${instant(startsAt, locale, timeZone)} – ${instant(endsAt, locale, timeZone)}`
}

/** The short form used in lists: just when it starts. */
export const formatEventStart = (
  startsAt: string | null,
  locale?: string,
  timeZone?: string,
): string => (startsAt === null ? 'No date set' : instant(startsAt, locale, timeZone))
