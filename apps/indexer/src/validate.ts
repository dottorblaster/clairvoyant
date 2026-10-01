import { community } from '@clairvoyant/lexicons'

/**
 * Jetstream output is NOT cryptographically verified: the service is a trusted
 * relay that hands us JSON. Every record is therefore validated at runtime
 * against the Lexicon schemas generated from `packages/lexicons` before it is
 * allowed anywhere near the database. Invalid records are skipped (see
 * `handlers.ts`), never written.
 *
 * The generated modules expose `$safeValidate(value)` returning a discriminated
 * `{ success: true, value } | { success: false, error }` result.
 */
export const isValidEventRecord = (value: unknown): boolean =>
  community.lexicon.calendar.event.$safeValidate(value).success

export const isValidRsvpRecord = (value: unknown): boolean =>
  community.lexicon.calendar.rsvp.$safeValidate(value).success
