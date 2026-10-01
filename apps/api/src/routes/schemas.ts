import { z } from 'zod'

/** How many events the discover feed returns when the caller does not ask. */
export const DEFAULT_DISCOVER_LIMIT = 6

export const CreateEventSchema = z.object({
  name: z.string().min(1).max(256),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime().optional(),
  description: z.string().max(2_000).optional(),
})

export const RsvpStatusSchema = z.enum(['going', 'notgoing', 'interested'])
export type RsvpStatus = z.infer<typeof RsvpStatusSchema>

export const RsvpRequestSchema = z.object({
  status: RsvpStatusSchema,
  inviteToken: z.string().min(1),
})

export const CreateInviteSchema = z.object({
  handle: z.string().min(1).max(256),
})

/**
 * `?limit=`. Digits only, so the `Number()` conversion below cannot yield NaN;
 * keeping it a string schema also means a missing parameter stays `undefined`
 * rather than being coerced.
 */
export const DiscoverQuerySchema = z.object({
  limit: z.string().regex(/^\d+$/).optional(),
})
