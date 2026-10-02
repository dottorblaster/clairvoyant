import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import type { EventRow, InviteRow, ParticipatingEventRow, RsvpRow } from '@clairvoyant/db'
import { MAX_DISCOVER_LIMIT } from '@clairvoyant/db'
import { EVENT_COLLECTION, RSVP_COLLECTION } from '@clairvoyant/lexicons'
import { MAX_BODY_BYTES } from '../../dist/app.js'
import { hashInviteToken } from '../../dist/invites.js'
import { createRateLimiters } from '../../dist/rate-limit.js'
import {
  cookieFor,
  createFakePds,
  createFakeStore,
  createTestApp,
} from '../../dist/testing/fakes.js'

const REF = `${RSVP_COLLECTION}#`
const DATE = new Date('2026-01-01T00:00:00.000Z')
const FUTURE = new Date('2026-06-01T12:00:00.000Z')
const EVENT_URI = `at://did:plc:author/${EVENT_COLLECTION}/abc`
const VIEWER = 'did:plc:viewer'
const INVITEE = 'did:plc:invitee'
const TOKEN = 'invite-token'

const eventRow = (
  uri: string,
  name: string,
  startsAt: Date | null = null,
  authorDid = 'did:plc:author',
): EventRow => ({
  uri,
  cid: `${uri}#cid`,
  author_did: authorDid,
  name,
  starts_at: startsAt,
  ends_at: null,
  description: null,
  locations: [],
  indexed_at: DATE,
  raw: { name },
})

const participatingRow = (uri: string, name: string, status: string): ParticipatingEventRow => ({
  ...eventRow(uri, name, FUTURE),
  rsvp_status: status,
  rsvp_indexed_at: DATE,
})

const rsvpRow = (uri: string, status: string, statusName: RsvpRow['status_name']): RsvpRow => ({
  uri,
  cid: `${uri}#cid`,
  author_did: VIEWER,
  subject_uri: EVENT_URI,
  status,
  status_name: statusName,
  indexed_at: DATE,
})

const inviteRow = (overrides: Partial<InviteRow> = {}): InviteRow => ({
  token_hash: hashInviteToken(TOKEN),
  event_uri: EVENT_URI,
  invitee_did: INVITEE,
  invitee_handle: 'invitee.test',
  inviter_did: VIEWER,
  inviter_handle: 'viewer.test',
  created_at: DATE,
  ...overrides,
})

const jsonPost = (body: unknown, headers: Record<string, string> = {}) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', ...headers },
  body: JSON.stringify(body),
})

describe('GET /api/me', () => {
  test('is unauthenticated without a session cookie', async () => {
    const { app } = createTestApp()
    const response = await app.request('/api/me')
    assert.equal(response.status, 401)
    assert.deepEqual(await response.json(), { error: 'unauthenticated' })
  })

  test('returns the DID and resolved handle', async () => {
    const { app, env } = createTestApp()
    const response = await app.request('/api/me', { headers: cookieFor(env, VIEWER) })

    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { did: VIEWER, handle: 'viewer.test' })
  })

  test('returns a null handle, and logs, when the session cannot be resolved', async () => {
    const { pds } = createFakePds({
      defaultAgent: {
        getSession: async () => {
          throw new Error('pds down')
        },
      },
    })
    const { app, env } = createTestApp({ pds })
    const response = await app.request('/api/me', { headers: cookieFor(env, VIEWER) })

    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { did: VIEWER, handle: null })
  })
})

describe('GET /api/me/events', () => {
  test('is unauthenticated without a session cookie', async () => {
    const { app } = createTestApp()
    assert.equal((await app.request('/api/me/events')).status, 401)
  })

  test('merges authored and RSVP\u2019d events with a role', async () => {
    const store = createFakeStore({
      events: [eventRow('at://a/mine', 'Mine', FUTURE, VIEWER)],
      participating: [participatingRow('at://a/theirs', 'Theirs', `${REF}going`)],
    }).store
    const { app, env } = createTestApp({ store })

    const response = await app.request('/api/me/events', { headers: cookieFor(env, VIEWER) })
    assert.equal(response.status, 200)

    const body = (await response.json()) as { events: Array<{ uri: string; role: string }> }
    const roles = new Map(body.events.map((event) => [event.uri, event.role]))
    assert.equal(roles.get('at://a/mine'), 'hosting')
    assert.equal(roles.get('at://a/theirs'), 'going')
  })
})

describe('GET /api/events', () => {
  test('uses the default discover limit', async () => {
    const { store, calls } = createFakeStore({ discover: [eventRow('at://a/1', 'One')] })
    const { app } = createTestApp({ store })

    const response = await app.request('/api/events')
    assert.equal(response.status, 200)
    assert.deepEqual(calls.listDiscoverEvents, [{ limit: 6 }])
    assert.equal(((await response.json()) as { events: unknown[] }).events.length, 1)
  })

  test('honours an explicit limit', async () => {
    const { store, calls } = createFakeStore()
    const { app } = createTestApp({ store })

    await app.request('/api/events?limit=3')
    assert.deepEqual(calls.listDiscoverEvents, [{ limit: 3 }])
  })

  test('rejects a non-numeric limit', async () => {
    const { app } = createTestApp()
    const response = await app.request('/api/events?limit=abc')
    assert.equal(response.status, 400)
    assert.equal(((await response.json()) as { error: string }).error, 'invalid_request')
  })

  test('rejects zero and values above the maximum', async () => {
    const { app } = createTestApp()
    for (const limit of ['0', String(MAX_DISCOVER_LIMIT + 1)]) {
      const response = await app.request(`/api/events?limit=${limit}`)
      assert.equal(response.status, 400, `limit=${limit}`)
    }
  })
})

describe('GET /api/events/:uri/rsvps', () => {
  test('returns the event and its RSVPs', async () => {
    const store = createFakeStore({
      events: [eventRow(EVENT_URI, 'One')],
      rsvps: [rsvpRow('at://r/1', `${REF}going`, 'going')],
    }).store
    const { app } = createTestApp({ store })

    const response = await app.request(`/api/events/${encodeURIComponent(EVENT_URI)}/rsvps`)
    assert.equal(response.status, 200)

    const body = (await response.json()) as {
      event: { uri: string }
      rsvps: Array<{ status_name: string | null }>
    }
    assert.equal(body.event.uri, EVENT_URI)
    assert.equal(body.rsvps[0]?.status_name, 'going')
  })

  test('404s when the event is not in the index', async () => {
    const { app } = createTestApp()
    const response = await app.request(`/api/events/${encodeURIComponent(EVENT_URI)}/rsvps`)
    assert.equal(response.status, 404)
  })

  test('400s on an undecodable URI segment', async () => {
    const { app } = createTestApp()
    const response = await app.request('/api/events/%zz/rsvps')
    assert.equal(response.status, 400)
    assert.deepEqual(await response.json(), { error: 'invalid_uri' })
  })
})

describe('POST /api/events/:uri/rsvp', () => {
  const url = `/api/events/${encodeURIComponent(EVENT_URI)}/rsvp`
  const validBody = { status: 'going', inviteToken: TOKEN }

  const withInvite = (overrides: Partial<InviteRow> = {}) =>
    createTestApp({
      env: undefined,
      store: createFakeStore({
        events: [eventRow(EVENT_URI, 'One')],
        invites: [inviteRow(overrides)],
      }).store,
    })

  test('is unauthenticated without a session cookie', async () => {
    const { app } = createTestApp()
    const response = await app.request(url, jsonPost(validBody))
    assert.equal(response.status, 401)
  })

  test('rejects an unparseable body', async () => {
    const { app, env } = createTestApp()
    const response = await app.request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...cookieFor(env, VIEWER) },
      body: 'not json',
    })
    assert.equal(response.status, 400)
    assert.deepEqual(await response.json(), { error: 'invalid_json' })
  })

  test('rejects a body without a known status or invite token', async () => {
    const { app, env } = createTestApp()
    for (const body of [{}, { status: 'maybe', inviteToken: TOKEN }, { status: 'going' }]) {
      const response = await app.request(url, jsonPost(body, cookieFor(env, VIEWER)))
      assert.equal(response.status, 400, JSON.stringify(body))
    }
  })

  test('403s without an invite', async () => {
    const { app, env } = createTestApp()
    const response = await app.request(url, jsonPost(validBody, cookieFor(env, VIEWER)))
    assert.equal(response.status, 403)
    assert.deepEqual(await response.json(), { error: 'invite_required' })
  })

  test('403s when the invite belongs to another event or another person', async () => {
    for (const overrides of [
      { event_uri: 'at://someone/else' },
      { invitee_did: 'did:plc:someone-else' },
    ]) {
      const built = withInvite(overrides)
      const response = await built.app.request(
        url,
        jsonPost(validBody, cookieFor(built.env, VIEWER)),
      )
      assert.equal(response.status, 403, JSON.stringify(overrides))
    }
  })

  test('404s when the invite is valid but the event is missing', async () => {
    const { app, env } = createTestApp({
      store: createFakeStore({ invites: [inviteRow({ invitee_did: VIEWER })] }).store,
    })
    const response = await app.request(url, jsonPost(validBody, cookieFor(env, VIEWER)))
    assert.equal(response.status, 404)
  })

  test('writes the RSVP to the PDS and returns its reference', async () => {
    const written: Array<Record<string, unknown>> = []
    const { pds } = createFakePds({
      defaultAgent: {
        createRecord: async (input) => {
          written.push(input.record)
          return { uri: 'at://did:plc:viewer/rsvp/new', cid: 'cid-new' }
        },
      },
    })
    const built = createTestApp({
      pds,
      store: createFakeStore({
        events: [eventRow(EVENT_URI, 'One')],
        invites: [inviteRow({ invitee_did: VIEWER })],
      }).store,
    })

    const response = await built.app.request(
      url,
      jsonPost({ status: 'interested', inviteToken: TOKEN }, cookieFor(built.env, VIEWER)),
    )

    assert.equal(response.status, 201)
    assert.deepEqual(await response.json(), {
      uri: 'at://did:plc:viewer/rsvp/new',
      cid: 'cid-new',
    })
    assert.deepEqual(written[0]?.subject, { uri: EVENT_URI, cid: `${EVENT_URI}#cid` })
    assert.equal(written[0]?.status, `${REF}interested`)
  })

  test('returns 502 and logs when the PDS write fails', async () => {
    const { pds } = createFakePds({
      defaultAgent: {
        createRecord: async () => {
          throw new Error('pds down')
        },
      },
    })
    const built = createTestApp({
      pds,
      store: createFakeStore({
        events: [eventRow(EVENT_URI, 'One')],
        invites: [inviteRow({ invitee_did: VIEWER })],
      }).store,
    })

    const response = await built.app.request(url, jsonPost(validBody, cookieFor(built.env, VIEWER)))
    assert.equal(response.status, 502)
    assert.deepEqual(await response.json(), { error: 'pds_write_failed' })
  })
})

describe('POST /api/events/:uri/invites', () => {
  const url = `/api/events/${encodeURIComponent(EVENT_URI)}/invites`

  const eventStore = () => createFakeStore({ events: [eventRow(EVENT_URI, 'One')] })

  test('is unauthenticated without a session cookie', async () => {
    const { app } = createTestApp()
    assert.equal((await app.request(url, jsonPost({ handle: 'invitee.test' }))).status, 401)
  })

  test('rejects an invalid body', async () => {
    const { app, env } = createTestApp({ store: eventStore().store })
    for (const body of [{}, { handle: '' }, { handle: 'x'.repeat(257) }]) {
      const response = await app.request(url, jsonPost(body, cookieFor(env, VIEWER)))
      assert.equal(response.status, 400, JSON.stringify(body))
    }
  })

  test('404s when the event is missing', async () => {
    const { app, env } = createTestApp()
    const response = await app.request(url, jsonPost({ handle: 'invitee.test' }, cookieFor(env)))
    assert.equal(response.status, 404)
  })

  test('400s when the handle cannot be resolved', async () => {
    const { pds } = createFakePds({
      defaultAgent: {
        resolveHandle: async () => {
          throw new Error('not found')
        },
      },
    })
    const { app, env } = createTestApp({ pds, store: eventStore().store })
    const response = await app.request(
      url,
      jsonPost({ handle: 'nobody.test' }, cookieFor(env, VIEWER)),
    )
    assert.equal(response.status, 400)
    assert.equal(((await response.json()) as { error: string }).error, 'handle_not_found')
  })

  test('mints an invite bound to the resolved DID and normalises the handle', async () => {
    const store = eventStore()
    const { app, env } = createTestApp({ store: store.store })

    const response = await app.request(
      url,
      jsonPost({ handle: ' @invitee.test ' }, cookieFor(env, VIEWER)),
    )

    assert.equal(response.status, 201)
    const body = (await response.json()) as {
      token: string
      eventUri: string
      inviteeHandle: string
      inviteeDid: string
      inviterHandle: string
    }
    assert.equal(body.eventUri, EVENT_URI)
    assert.equal(body.inviteeHandle, 'invitee.test')
    assert.equal(body.inviteeDid, INVITEE)
    assert.equal(body.inviterHandle, 'viewer.test')

    assert.equal(store.calls.createInvite.length, 1)
    assert.equal(store.calls.createInvite[0]?.tokenHash, hashInviteToken(body.token))
    assert.equal(store.calls.createInvite[0]?.inviteeDid, INVITEE)
  })

  test('falls back to the DID when the inviter handle cannot be resolved', async () => {
    const { pds } = createFakePds({
      defaultAgent: {
        getSession: async () => {
          throw new Error('no session')
        },
      },
    })
    const { app, env } = createTestApp({ pds, store: eventStore().store })
    const response = await app.request(
      url,
      jsonPost({ handle: 'invitee.test' }, cookieFor(env, VIEWER)),
    )

    assert.equal(response.status, 201)
    assert.equal(((await response.json()) as { inviterHandle: string }).inviterHandle, VIEWER)
  })

  test('500s and logs when the invite cannot be stored', async () => {
    const store = createFakeStore({
      events: [eventRow(EVENT_URI, 'One')],
      failCreateInvite: new Error('db down'),
    })
    const { app, env } = createTestApp({ store: store.store })
    const response = await app.request(
      url,
      jsonPost({ handle: 'invitee.test' }, cookieFor(env, VIEWER)),
    )
    assert.equal(response.status, 500)
    assert.deepEqual(await response.json(), { error: 'invite_failed' })
  })
})

describe('GET /api/invites/:token', () => {
  test('reports an unknown token as not found', async () => {
    const { app } = createTestApp()
    const response = await app.request('/api/invites/nope')
    assert.deepEqual(await response.json(), { valid: false, reason: 'not_found' })
  })

  test('reports matchesViewer null when nobody is logged in', async () => {
    const { app } = createTestApp({ store: createFakeStore({ invites: [inviteRow()] }).store })
    const response = await app.request(`/api/invites/${TOKEN}`)

    const body = (await response.json()) as { valid: boolean; matchesViewer: boolean | null }
    assert.equal(body.valid, true)
    assert.equal(body.matchesViewer, null)
  })

  test('matches the invitee and rejects anyone else', async () => {
    const store = createFakeStore({ invites: [inviteRow()] }).store

    const asInvitee = createTestApp({ store })
    const matched = await asInvitee.app.request(`/api/invites/${TOKEN}`, {
      headers: cookieFor(asInvitee.env, INVITEE),
    })
    assert.equal(((await matched.json()) as { matchesViewer: boolean }).matchesViewer, true)

    const asOther = createTestApp({ store })
    const rejected = await asOther.app.request(`/api/invites/${TOKEN}`, {
      headers: cookieFor(asOther.env, VIEWER),
    })
    assert.equal(((await rejected.json()) as { matchesViewer: boolean }).matchesViewer, false)
  })
})

describe('POST /api/events', () => {
  const validBody = { name: 'Launch party', startsAt: '2026-07-01T18:00:00.000Z' }

  test('is unauthenticated without a session cookie', async () => {
    const { app } = createTestApp()
    assert.equal((await app.request('/api/events', jsonPost(validBody))).status, 401)
  })

  test('rejects an unparseable body', async () => {
    const { app, env } = createTestApp()
    const response = await app.request('/api/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...cookieFor(env) },
      body: 'nope',
    })
    assert.equal(response.status, 400)
    assert.deepEqual(await response.json(), { error: 'invalid_json' })
  })

  test('rejects invalid fields', async () => {
    const { app, env } = createTestApp()
    const invalid = [
      {},
      { name: '', startsAt: validBody.startsAt },
      { name: 'x', startsAt: 'not-a-date' },
      { name: 'x', startsAt: validBody.startsAt, endsAt: 'nope' },
      { name: 'x', startsAt: validBody.startsAt, description: 'd'.repeat(2001) },
    ]
    for (const body of invalid) {
      const response = await app.request('/api/events', jsonPost(body, cookieFor(env)))
      assert.equal(response.status, 400, JSON.stringify(body))
    }
  })

  test('writes a minimal record to the PDS', async () => {
    const written: Array<Record<string, unknown>> = []
    const { pds } = createFakePds({
      defaultAgent: {
        createRecord: async (input) => {
          written.push(input.record)
          return { uri: 'at://did:plc:viewer/event/new', cid: 'cid-new' }
        },
      },
    })
    const { app, env } = createTestApp({ pds })

    const response = await app.request('/api/events', jsonPost(validBody, cookieFor(env)))

    assert.equal(response.status, 201)
    assert.deepEqual(await response.json(), {
      uri: 'at://did:plc:viewer/event/new',
      cid: 'cid-new',
    })
    const record = written[0] ?? {}
    assert.equal(record.$type, EVENT_COLLECTION)
    assert.equal(record.name, 'Launch party')
    assert.equal(record.startsAt, validBody.startsAt)
    assert.equal(typeof record.createdAt, 'string')
    assert.ok(!('endsAt' in record))
    assert.ok(!('description' in record))
  })

  test('includes optional fields when given', async () => {
    const written: Array<Record<string, unknown>> = []
    const { pds } = createFakePds({
      defaultAgent: {
        createRecord: async (input) => {
          written.push(input.record)
          return { uri: 'at://x', cid: 'cid' }
        },
      },
    })
    const { app, env } = createTestApp({ pds })

    await app.request(
      '/api/events',
      jsonPost(
        { ...validBody, endsAt: '2026-07-01T22:00:00.000Z', description: 'BYO' },
        cookieFor(env),
      ),
    )

    assert.equal(written[0]?.endsAt, '2026-07-01T22:00:00.000Z')
    assert.equal(written[0]?.description, 'BYO')
  })

  test('returns 502 when the PDS write fails', async () => {
    const { pds } = createFakePds({
      defaultAgent: {
        createRecord: async () => {
          throw new Error('pds down')
        },
      },
    })
    const { app, env } = createTestApp({ pds })

    const response = await app.request('/api/events', jsonPost(validBody, cookieFor(env)))
    assert.equal(response.status, 502)
    assert.deepEqual(await response.json(), { error: 'pds_write_failed' })
  })
})

describe('mutation rate limiting', () => {
  const validBody = { name: 'Launch party', startsAt: '2026-07-01T18:00:00.000Z' }

  test('429s once the account exhausts its window, and recovers after it', async () => {
    let now = 0
    const limits = createRateLimiters(() => now, { createEvent: { limit: 1, windowMs: 60_000 } })
    const { app, env } = createTestApp({ limits })

    const first = await app.request('/api/events', jsonPost(validBody, cookieFor(env, VIEWER)))
    assert.equal(first.status, 201)
    assert.equal(first.headers.get('ratelimit-remaining'), '0')

    const blocked = await app.request('/api/events', jsonPost(validBody, cookieFor(env, VIEWER)))
    assert.equal(blocked.status, 429)
    assert.deepEqual(await blocked.json(), {
      error: 'rate_limited',
      message: 'Too many requests. Try again later.',
    })
    assert.equal(blocked.headers.get('retry-after'), '60')

    now = 60_000
    const recovered = await app.request('/api/events', jsonPost(validBody, cookieFor(env, VIEWER)))
    assert.equal(recovered.status, 201)
  })

  test('charges each account to its own bucket', async () => {
    const limits = createRateLimiters(() => 0, { createEvent: { limit: 1, windowMs: 60_000 } })
    const { app, env } = createTestApp({ limits })

    const viewer = await app.request('/api/events', jsonPost(validBody, cookieFor(env, VIEWER)))
    assert.equal(viewer.status, 201)

    const other = await app.request(
      '/api/events',
      jsonPost(validBody, cookieFor(env, 'did:plc:someone-else')),
    )
    assert.equal(other.status, 201)
  })

  test('leaves unauthenticated requests to the 401, not the limiter', async () => {
    const limits = createRateLimiters(() => 0, { createEvent: { limit: 1, windowMs: 60_000 } })
    const { app } = createTestApp({ limits })

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await app.request('/api/events', jsonPost(validBody))
      assert.equal(response.status, 401)
    }
  })

  test('limits each bucket independently', async () => {
    const limits = createRateLimiters(() => 0, { createInvite: { limit: 1, windowMs: 60_000 } })
    const store = createFakeStore({ events: [eventRow(EVENT_URI, 'One')] })
    const { app, env } = createTestApp({ store: store.store, limits })
    const url = `/api/events/${encodeURIComponent(EVENT_URI)}/invites`

    const minted = await app.request(url, jsonPost({ handle: 'a.test' }, cookieFor(env)))
    assert.equal(minted.status, 201)

    const blocked = await app.request(url, jsonPost({ handle: 'b.test' }, cookieFor(env)))
    assert.equal(blocked.status, 429)

    const created = await app.request('/api/events', jsonPost(validBody, cookieFor(env)))
    assert.equal(created.status, 201)
  })
})

describe('request body limit', () => {
  test('413s a body above the cap', async () => {
    const { app, env } = createTestApp()
    const response = await app.request(
      '/api/events',
      jsonPost(
        { name: 'x'.repeat(MAX_BODY_BYTES + 1), startsAt: '2026-07-01T18:00:00.000Z' },
        cookieFor(env),
      ),
    )

    assert.equal(response.status, 413)
    assert.equal(((await response.json()) as { error: string }).error, 'payload_too_large')
  })

  test('accepts a body comfortably below the cap', async () => {
    const { app, env } = createTestApp()
    const response = await app.request(
      '/api/events',
      jsonPost(
        {
          name: 'Party',
          startsAt: '2026-07-01T18:00:00.000Z',
          description: 'x'.repeat(2_000),
        },
        cookieFor(env),
      ),
    )
    assert.equal(response.status, 201)
  })
})
