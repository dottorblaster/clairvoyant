import { community } from '@clairvoyant/lexicons'

export const isValidEventRecord = (value: unknown): boolean =>
  community.lexicon.calendar.event.$safeValidate(value).success

export const isValidRsvpRecord = (value: unknown): boolean =>
  community.lexicon.calendar.rsvp.$safeValidate(value).success
