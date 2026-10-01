/**
 * `community.lexicon.calendar.rsvp` stores `status` as a string whose
 * `knownValues` are *full refs*:
 *
 *   community.lexicon.calendar.rsvp#going
 *   community.lexicon.calendar.rsvp#interested
 *   community.lexicon.calendar.rsvp#notgoing
 *
 * `knownValues` is advisory, not an enum, and the indexer stores whatever the
 * network sent verbatim. So the bare name is also out there. Measured on the
 * live index:
 *
 *   community.lexicon.calendar.rsvp#going       4021
 *   community.lexicon.calendar.rsvp#interested  1699
 *   community.lexicon.calendar.rsvp#notgoing     146
 *   going                                         32
 *
 * A filter on the bare name alone therefore matches 32 of 5898 rows and silently
 * drops the rest. Everything that reads a status must accept both spellings,
 * which is why the raw-value lists below are derived from one constant rather
 * than written out at each call site.
 */

export const RSVP_STATUS_REF_PREFIX = 'community.lexicon.calendar.rsvp#'

export const RSVP_STATUS_NAMES = ['going', 'notgoing', 'interested'] as const

export type RsvpStatusName = (typeof RSVP_STATUS_NAMES)[number]

/** The statuses that mean "I want to be there". */
export const ATTENDING_STATUS_NAMES = ['going', 'interested'] as const

export type AttendingStatusName = (typeof ATTENDING_STATUS_NAMES)[number]

/**
 * How committed each status is; lower is stronger. Used to resolve the
 * duplicates described in `mergeMyEvents`.
 */
export const RSVP_STATUS_RANK: Record<RsvpStatusName, number> = {
  going: 0,
  interested: 1,
  notgoing: 2,
}

const isStatusName = (value: string): value is RsvpStatusName =>
  (RSVP_STATUS_NAMES as readonly string[]).includes(value)

export const isAttendingStatusName = (value: RsvpStatusName): value is AttendingStatusName =>
  (ATTENDING_STATUS_NAMES as readonly string[]).includes(value)

/** Every raw network spelling of one status: the bare name and the ref. */
export const rawValuesFor = (name: RsvpStatusName): string[] => [
  name,
  `${RSVP_STATUS_REF_PREFIX}${name}`,
]

/** Every raw spelling of every status, for `WHERE status IN (...)`. */
export const ALL_RAW_STATUS_VALUES: string[] = RSVP_STATUS_NAMES.flatMap(rawValuesFor)

/** Every raw spelling that means the author wants to attend. */
export const ATTENDING_RAW_STATUS_VALUES: string[] = ATTENDING_STATUS_NAMES.flatMap(rawValuesFor)

/**
 * The bare name behind a stored status, or `null` when the network sent
 * something this lexicon version does not know about. Callers should treat
 * `null` as "unknown" rather than guessing.
 */
export const rsvpStatusName = (raw: string): RsvpStatusName | null => {
  const name = raw.startsWith(RSVP_STATUS_REF_PREFIX)
    ? raw.slice(RSVP_STATUS_REF_PREFIX.length)
    : raw
  return isStatusName(name) ? name : null
}
