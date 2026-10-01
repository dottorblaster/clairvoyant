import { Agent } from '@atproto/api'
import {
  createInvite,
  getEventByUri,
  getInviteByTokenHash,
  listDiscoverEvents,
  listEventsByAuthor,
  listRsvpsForEvent,
  MAX_DISCOVER_LIMIT,
} from '@clairvoyant/db'
import { EVENT_COLLECTION, RSVP_COLLECTION } from '@clairvoyant/lexicons'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppDeps, HonoEnv } from '../context.js'
import { generateInviteToken, hashInviteToken } from '../invites.js'

export const apiRoutes = new Hono<HonoEnv>()

/**
 * `OAuthSession` structurally satisfies `SessionManager` (it exposes `did` and
 * `fetchHandler`), so it can be passed straight to `@atproto/api`'s `Agent`.
 */
const restoreAgent = async (deps: AppDeps, did: string) => {
  const session = await deps.oauth.restore(did)
  return new Agent(session)
}

const CreateEventSchema = z.object({
  name: z.string().min(1).max(256),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime().optional(),
  description: z.string().max(2_000).optional(),
})

const RsvpStatusSchema = z.enum(['going', 'notgoing', 'interested'])
type RsvpStatus = z.infer<typeof RsvpStatusSchema>

const RsvpRequestSchema = z.object({
  status: RsvpStatusSchema,
  inviteToken: z.string().min(1),
})

const CreateInviteSchema = z.object({
  handle: z.string().min(1).max(256),
})

/** How many events the discover feed returns when the caller does not ask. */
const DEFAULT_DISCOVER_LIMIT = 6

/**
 * `?limit=`. Digits only, so the `Number()` conversion below cannot yield NaN;
 * keeping it a string schema also means a missing parameter stays `undefined`
 * rather than being coerced.
 */
const DiscoverQuerySchema = z.object({
  limit: z.string().regex(/^\d+$/).optional(),
})

/**
 * Find the rkey of the user's existing RSVP for this event, if any. The lexicon
 * declares a `tid` key, but re-using the existing rkey keeps exactly one RSVP
 * per (user, event) instead of piling up duplicates.
 */
const findExistingRsvpRkey = async (
  agent: Agent,
  did: string,
  eventUri: string,
): Promise<string | null> => {
  let cursor: string | undefined

  for (let page = 0; page < 10; page += 1) {
    const listing = await agent.com.atproto.repo.listRecords({
      repo: did,
      collection: RSVP_COLLECTION,
      limit: 100,
      ...(cursor === undefined ? {} : { cursor }),
    })

    for (const record of listing.data.records) {
      const value = record.value as { subject?: { uri?: unknown } }
      if (value.subject?.uri === eventUri) {
        return record.uri.split('/').pop() ?? null
      }
    }

    cursor = listing.data.cursor
    if (cursor === undefined) break
  }

  return null
}

/** Write an RSVP record to the user's PDS (never to our database). */
const writeRsvpRecord = async (
  agent: Agent,
  did: string,
  eventUri: string,
  eventCid: string,
  status: RsvpStatus,
): Promise<{ uri: string; cid: string }> => {
  const record: Record<string, unknown> = {
    $type: RSVP_COLLECTION,
    status: `${RSVP_COLLECTION}#${status}`,
    subject: { uri: eventUri, cid: eventCid },
  }

  const existingRkey = await findExistingRsvpRkey(agent, did, eventUri)
  const result = existingRkey
    ? await agent.com.atproto.repo.putRecord({
        repo: did,
        collection: RSVP_COLLECTION,
        rkey: existingRkey,
        record,
      })
    : await agent.com.atproto.repo.createRecord({
        repo: did,
        collection: RSVP_COLLECTION,
        record,
      })

  return { uri: result.data.uri, cid: result.data.cid }
}

apiRoutes.get('/me', async (c) => {
  const deps = c.get('deps')
  const did = c.get('did')
  if (!did) return c.json({ error: 'unauthenticated' }, 401)

  let handle: string | null = null
  try {
    const agent = await restoreAgent(deps, did)
    const session = await agent.com.atproto.server.getSession()
    handle = session.data.handle
  } catch (error) {
    deps.log.warn('could not resolve handle for did', { did, err: error })
  }

  return c.json({ did, handle })
})

apiRoutes.get('/me/events', async (c) => {
  const deps = c.get('deps')
  const did = c.get('did')
  if (!did) return c.json({ error: 'unauthenticated' }, 401)

  const events = await listEventsByAuthor(deps.db, did)
  return c.json({ events })
})

// GET /api/events — the public discover feed.
//
// Deliberately unauthenticated: this is how a visitor with no account finds
// something to open. Every row is a projection of a public AT Protocol record,
// and the event detail route is public for the same reason, so this exposes
// nothing that is not already readable from the network. Note that the index
// covers the whole collection network-wide, not just this app's users.
apiRoutes.get('/events', async (c) => {
  const deps = c.get('deps')

  const parsed = DiscoverQuerySchema.safeParse({ limit: c.req.query('limit') })
  if (!parsed.success) {
    return c.json({ error: 'invalid_request', message: 'limit must be a positive integer' }, 400)
  }

  const limit = parsed.data.limit === undefined ? DEFAULT_DISCOVER_LIMIT : Number(parsed.data.limit)
  if (limit < 1 || limit > MAX_DISCOVER_LIMIT) {
    return c.json(
      { error: 'invalid_request', message: `limit must be between 1 and ${MAX_DISCOVER_LIMIT}` },
      400,
    )
  }

  const events = await listDiscoverEvents(deps.db, { limit })
  return c.json({ events })
})

apiRoutes.get('/events/:encodedUri/rsvps', async (c) => {
  const deps = c.get('deps')
  const encodedUri = c.req.param('encodedUri')

  let uri: string
  try {
    uri = decodeURIComponent(encodedUri)
  } catch {
    return c.json({ error: 'invalid_uri' }, 400)
  }

  const [event, rsvps] = await Promise.all([
    getEventByUri(deps.db, uri),
    listRsvpsForEvent(deps.db, uri),
  ])

  if (!event) return c.json({ error: 'not_found' }, 404)
  return c.json({ event, rsvps })
})

apiRoutes.post('/events/:encodedUri/rsvp', async (c) => {
  const deps = c.get('deps')
  const did = c.get('did')
  if (!did) return c.json({ error: 'unauthenticated' }, 401)

  let uri: string
  try {
    uri = decodeURIComponent(c.req.param('encodedUri'))
  } catch {
    return c.json({ error: 'invalid_uri' }, 400)
  }

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'invalid_json' }, 400)
  }

  const parsed = RsvpRequestSchema.safeParse(body)
  if (!parsed.success) {
    return c.json(
      {
        error: 'invalid_request',
        message: "status must be 'going', 'notgoing' or 'interested' and inviteToken is required",
      },
      400,
    )
  }

  // Strict invite-only: the caller must hold an invite for this event addressed
  // to their own DID. This is the real enforcement of "the invite works just for
  // the person invited" — the UI is only cosmetic.
  const invite = await getInviteByTokenHash(deps.db, hashInviteToken(parsed.data.inviteToken))
  if (!invite || invite.event_uri !== uri || invite.invitee_did !== did) {
    return c.json({ error: 'invite_required' }, 403)
  }

  // The RSVP's `subject` is a StrongRef, so we need the event record's CID.
  const event = await getEventByUri(deps.db, uri)
  if (!event) return c.json({ error: 'not_found' }, 404)

  const agent = await restoreAgent(deps, did)

  try {
    const result = await writeRsvpRecord(agent, did, uri, event.cid, parsed.data.status)
    return c.json(result, 201)
  } catch (error) {
    deps.log.error('failed to write rsvp to PDS', { did, uri, err: error })
    return c.json({ error: 'pds_write_failed' }, 502)
  }
})

// POST /api/events/:uri/invites — any logged-in user can invite someone by
// handle. The handle is resolved to a DID and the invite is bound to it, so the
// resulting link can only be used by that person.
apiRoutes.post('/events/:encodedUri/invites', async (c) => {
  const deps = c.get('deps')
  const did = c.get('did')
  if (!did) return c.json({ error: 'unauthenticated' }, 401)

  let uri: string
  try {
    uri = decodeURIComponent(c.req.param('encodedUri'))
  } catch {
    return c.json({ error: 'invalid_uri' }, 400)
  }

  const event = await getEventByUri(deps.db, uri)
  if (!event) return c.json({ error: 'not_found' }, 404)

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'invalid_json' }, 400)
  }

  const parsed = CreateInviteSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid_request', issues: parsed.error.issues }, 400)

  const handle = parsed.data.handle.trim().replace(/^@/, '')
  const agent = await restoreAgent(deps, did)

  let inviteeDid: string
  try {
    const resolved = await agent.com.atproto.identity.resolveHandle({ handle })
    inviteeDid = resolved.data.did
  } catch (error) {
    deps.log.warn('could not resolve invitee handle', { handle, err: error })
    return c.json({ error: 'handle_not_found', handle }, 400)
  }

  let inviterHandle = did
  try {
    const session = await agent.com.atproto.server.getSession()
    inviterHandle = session.data.handle
  } catch (error) {
    deps.log.warn('could not resolve inviter handle', { did, err: error })
  }

  const token = generateInviteToken()
  try {
    await createInvite(deps.db, {
      tokenHash: hashInviteToken(token),
      eventUri: uri,
      inviteeDid,
      inviteeHandle: handle,
      inviterDid: did,
      inviterHandle,
    })
  } catch (error) {
    deps.log.error('failed to create invite', { did, uri, handle, err: error })
    return c.json({ error: 'invite_failed' }, 500)
  }

  return c.json({ token, eventUri: uri, inviteeHandle: handle, inviteeDid, inviterHandle }, 201)
})

// GET /api/invites/:token — validate an invite for the current viewer. Used by
// the event page to decide whether to show the RSVP controls. `matchesViewer`
// is null when nobody is logged in.
apiRoutes.get('/invites/:token', async (c) => {
  const deps = c.get('deps')
  const did = c.get('did')
  const token = c.req.param('token')
  if (!token) return c.json({ valid: false, reason: 'not_found' })

  const invite = await getInviteByTokenHash(deps.db, hashInviteToken(token))
  if (!invite) return c.json({ valid: false, reason: 'not_found' })

  return c.json({
    valid: true,
    eventUri: invite.event_uri,
    inviteeHandle: invite.invitee_handle,
    inviterHandle: invite.inviter_handle,
    matchesViewer: did === null ? null : did === invite.invitee_did,
  })
})

apiRoutes.post('/events', async (c) => {
  const deps = c.get('deps')
  const did = c.get('did')
  if (!did) return c.json({ error: 'unauthenticated' }, 401)

  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'invalid_json' }, 400)
  }

  const parsed = CreateEventSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: 'invalid_request', issues: parsed.error.issues }, 400)
  }

  // The requested fields mirror `community.lexicon.calendar.event`: `name` and
  // `createdAt` are required; `startsAt`/`endsAt`/`description` are optional.
  const record: Record<string, unknown> = {
    $type: EVENT_COLLECTION,
    name: parsed.data.name,
    createdAt: new Date().toISOString(),
    startsAt: parsed.data.startsAt,
  }
  if (parsed.data.endsAt !== undefined) record.endsAt = parsed.data.endsAt
  if (parsed.data.description !== undefined) record.description = parsed.data.description

  try {
    const agent = await restoreAgent(deps, did)
    // IMPORTANT: write to the user's PDS, never to our database
    const result = await agent.com.atproto.repo.createRecord({
      repo: did,
      collection: EVENT_COLLECTION,
      record,
    })
    return c.json({ uri: result.data.uri, cid: result.data.cid }, 201)
  } catch (error) {
    deps.log.error('failed to create event on PDS', { did, err: error })
    return c.json({ error: 'pds_write_failed' }, 502)
  }
})
