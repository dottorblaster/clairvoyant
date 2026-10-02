import { MAX_DISCOVER_LIMIT, mergeMyEvents, sortMyEvents } from '@clairvoyant/db'
import { EVENT_COLLECTION } from '@clairvoyant/lexicons'
import { Hono } from 'hono'
import type { HonoEnv } from '../context.js'
import { generateInviteToken, hashInviteToken } from '../invites.js'
import { writeRsvpRecord } from '../pds.js'
import { rateLimit } from '../rate-limit.js'
import {
  CreateEventSchema,
  CreateInviteSchema,
  DEFAULT_DISCOVER_LIMIT,
  DiscoverQuerySchema,
  RsvpRequestSchema,
} from './schemas.js'

export const apiRoutes = new Hono<HonoEnv>()

const decodeUriParam = (encoded: string): string | null => {
  try {
    return decodeURIComponent(encoded)
  } catch {
    return null
  }
}

apiRoutes.get('/me', async (c) => {
  const deps = c.get('deps')
  const did = c.get('did')
  if (!did) return c.json({ error: 'unauthenticated' }, 401)

  let handle: string | null = null
  try {
    const session = await deps.pds.withAgent(did, (agent) => agent.getSession())
    handle = session.handle
  } catch (error) {
    deps.log.warn('could not resolve handle for did', { did, err: error })
  }

  return c.json({ did, handle })
})

apiRoutes.get('/me/events', async (c) => {
  const deps = c.get('deps')
  const did = c.get('did')
  if (!did) return c.json({ error: 'unauthenticated' }, 401)

  const [authored, participating] = await Promise.all([
    deps.store.listEventsByAuthor(did),
    deps.store.listEventsForParticipant(did),
  ])

  return c.json({ events: sortMyEvents(mergeMyEvents(authored, participating), new Date()) })
})

// Public on purpose: the discover feed is how a visitor with no account finds an
// event to open. Every row is already readable from the network.
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

  const events = await deps.store.listDiscoverEvents({ limit })
  return c.json({ events })
})

apiRoutes.get('/events/:encodedUri/rsvps', async (c) => {
  const deps = c.get('deps')
  const uri = decodeUriParam(c.req.param('encodedUri'))
  if (uri === null) return c.json({ error: 'invalid_uri' }, 400)

  const [event, rsvps] = await Promise.all([
    deps.store.getEventByUri(uri),
    deps.store.listRsvpsForEvent(uri),
  ])

  if (!event) return c.json({ error: 'not_found' }, 404)
  return c.json({ event, rsvps })
})

apiRoutes.post('/events/:encodedUri/rsvp', rateLimit('rsvp'), async (c) => {
  const deps = c.get('deps')
  const did = c.get('did')
  if (!did) return c.json({ error: 'unauthenticated' }, 401)

  const uri = decodeUriParam(c.req.param('encodedUri'))
  if (uri === null) return c.json({ error: 'invalid_uri' }, 400)

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

  // Invite-only: the caller must hold an invite for this event addressed to
  // their own DID. The UI is only cosmetic; this is the enforcement.
  const invite = await deps.store.getInviteByTokenHash(hashInviteToken(parsed.data.inviteToken))
  if (!invite || invite.event_uri !== uri || invite.invitee_did !== did) {
    return c.json({ error: 'invite_required' }, 403)
  }

  const event = await deps.store.getEventByUri(uri)
  if (!event) return c.json({ error: 'not_found' }, 404)

  try {
    const result = await deps.pds.withAgent(did, (agent) =>
      writeRsvpRecord(agent, uri, event.cid, parsed.data.status),
    )
    return c.json(result, 201)
  } catch (error) {
    deps.log.error('failed to write rsvp to PDS', { did, uri, err: error })
    return c.json({ error: 'pds_write_failed' }, 502)
  }
})

apiRoutes.post('/events/:encodedUri/invites', rateLimit('createInvite'), async (c) => {
  const deps = c.get('deps')
  const did = c.get('did')
  if (!did) return c.json({ error: 'unauthenticated' }, 401)

  const uri = decodeUriParam(c.req.param('encodedUri'))
  if (uri === null) return c.json({ error: 'invalid_uri' }, 400)

  const event = await deps.store.getEventByUri(uri)
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

  let inviteeDid: string
  try {
    inviteeDid = await deps.pds.withAgent(did, (agent) => agent.resolveHandle(handle))
  } catch (error) {
    deps.log.warn('could not resolve invitee handle', { handle, err: error })
    return c.json({ error: 'handle_not_found', handle }, 400)
  }

  let inviterHandle = did
  try {
    const session = await deps.pds.withAgent(did, (agent) => agent.getSession())
    inviterHandle = session.handle
  } catch (error) {
    deps.log.warn('could not resolve inviter handle', { did, err: error })
  }

  const token = generateInviteToken()
  try {
    await deps.store.createInvite({
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

apiRoutes.get('/invites/:token', async (c) => {
  const deps = c.get('deps')
  const did = c.get('did')
  const token = c.req.param('token')
  if (!token) return c.json({ valid: false, reason: 'not_found' })

  const invite = await deps.store.getInviteByTokenHash(hashInviteToken(token))
  if (!invite) return c.json({ valid: false, reason: 'not_found' })

  return c.json({
    valid: true,
    eventUri: invite.event_uri,
    inviteeHandle: invite.invitee_handle,
    inviterHandle: invite.inviter_handle,
    matchesViewer: did === null ? null : did === invite.invitee_did,
  })
})

apiRoutes.post('/events', rateLimit('createEvent'), async (c) => {
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

  // Writes go to the user's PDS, never to our database.
  const record: Record<string, unknown> = {
    $type: EVENT_COLLECTION,
    name: parsed.data.name,
    createdAt: new Date().toISOString(),
    startsAt: parsed.data.startsAt,
  }
  if (parsed.data.endsAt !== undefined) record.endsAt = parsed.data.endsAt
  if (parsed.data.description !== undefined) record.description = parsed.data.description

  try {
    const result = await deps.pds.withAgent(did, (agent) =>
      agent.createRecord({ collection: EVENT_COLLECTION, record }),
    )
    return c.json({ uri: result.uri, cid: result.cid }, 201)
  } catch (error) {
    deps.log.error('failed to create event on PDS', { did, err: error })
    return c.json({ error: 'pds_write_failed' }, 502)
  }
})
