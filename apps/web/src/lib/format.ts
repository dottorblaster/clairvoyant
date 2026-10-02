// startsAt is optional in the lexicon, so every formatter has to cope with an undated event.
const instant = (value: string, locale?: string, timeZone?: string): string =>
  new Date(value).toLocaleString(locale, timeZone === undefined ? undefined : { timeZone })

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

export const formatEventStart = (
  startsAt: string | null,
  locale?: string,
  timeZone?: string,
): string => (startsAt === null ? 'No date set' : instant(startsAt, locale, timeZone))
