// `status` uses advisory `knownValues`, so the network sends both the bare name
// (`going`) and the full ref (`community.lexicon.calendar.rsvp#going`). Every
// filter and normaliser has to accept both.
export const RSVP_STATUS_REF_PREFIX = 'community.lexicon.calendar.rsvp#'

export const RSVP_STATUS_NAMES = ['going', 'notgoing', 'interested'] as const

export type RsvpStatusName = (typeof RSVP_STATUS_NAMES)[number]

export const ATTENDING_STATUS_NAMES = ['going', 'interested'] as const

export type AttendingStatusName = (typeof ATTENDING_STATUS_NAMES)[number]

export const RSVP_STATUS_RANK: Record<RsvpStatusName, number> = {
  going: 0,
  interested: 1,
  notgoing: 2,
}

const isStatusName = (value: string): value is RsvpStatusName =>
  (RSVP_STATUS_NAMES as readonly string[]).includes(value)

export const isAttendingStatusName = (value: RsvpStatusName): value is AttendingStatusName =>
  (ATTENDING_STATUS_NAMES as readonly string[]).includes(value)

export const rawValuesFor = (name: RsvpStatusName): string[] => [
  name,
  `${RSVP_STATUS_REF_PREFIX}${name}`,
]

export const ALL_RAW_STATUS_VALUES: string[] = RSVP_STATUS_NAMES.flatMap(rawValuesFor)

export const ATTENDING_RAW_STATUS_VALUES: string[] = ATTENDING_STATUS_NAMES.flatMap(rawValuesFor)

export const rsvpStatusName = (raw: string): RsvpStatusName | null => {
  const name = raw.startsWith(RSVP_STATUS_REF_PREFIX)
    ? raw.slice(RSVP_STATUS_REF_PREFIX.length)
    : raw
  return isStatusName(name) ? name : null
}
