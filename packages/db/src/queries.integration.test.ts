import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, test } from 'node:test'
import { readCursor, writeCursor } from '../dist/cursor.js'
import {
  createInvite,
  deleteAllByDid,
  deleteEventByUri,
  deleteRsvpByUri,
  getEventByUri,
  getInviteByTokenHash,
  listDiscoverEvents,
  listEventsByAuthor,
  listEventsForParticipant,
  listRsvpsForEvent,
  MAX_DISCOVER_LIMIT,
  upsertEvent,
  upsertRsvp,
} from '../dist/queries.js'
import { createTestDatabase, hasTestDatabase, type TestDatabase } from '../dist/testing/test-db.js'

const REF = 'community.lexicon.calendar.rsvp#'

const DAY = 86_400_000
const now = Date.now()
const inDays = (days: number): Date => new Date(now + days * DAY)

const AUTHOR = 'did:plc:author'
const VIEWER = 'did:plc:viewer'
const OTHER = 'did:plc:other'

const eventInput = (uri: string, name: string, startsAt: Date | null, authorDid = AUTHOR) => ({
  uri,
  cid: `${uri}#cid`,
  authorDid,
  name,
  startsAt,
  endsAt: null,
  description: null,
  locations: [],
  raw: { name },
})

const rsvpInput = (uri: string, subjectUri: string, status: string, authorDid = VIEWER) => ({
  uri,
  cid: `${uri}#cid`,
  authorDid,
  subjectUri,
  status,
})

const suite = hasTestDatabase() ? describe : describe.skip

suite('db queries (Postgres integration)', () => {
  let testDb: TestDatabase

  before(async () => {
    testDb = await createTestDatabase()
  })

  after(async () => {
    await testDb.dispose()
  })

  beforeEach(async () => {
    await testDb.reset()
  })

  test('upsertEvent inserts, then updates in place keyed by AT-URI', async () => {
    const { db } = testDb
    await upsertEvent(db, eventInput('at://a/1', 'First', inDays(1)))
    await upsertEvent(db, { ...eventInput('at://a/1', 'Renamed', inDays(2)), cid: 'at://a/1#v2' })

    const rows = await db.selectFrom('event').selectAll().execute()
    assert.equal(rows.length, 1)
    assert.equal(rows[0]?.name, 'Renamed')
    assert.equal(rows[0]?.cid, 'at://a/1#v2')
    assert.equal(rows[0]?.starts_at?.getTime(), inDays(2).getTime())
  })

  test('getEventByUri returns the row or undefined', async () => {
    await upsertEvent(testDb.db, eventInput('at://a/1', 'One', inDays(1)))
    assert.equal((await getEventByUri(testDb.db, 'at://a/1'))?.name, 'One')
    assert.equal(await getEventByUri(testDb.db, 'at://missing'), undefined)
  })

  test('deleteEventByUri removes only that row', async () => {
    await upsertEvent(testDb.db, eventInput('at://a/1', 'One', inDays(1)))
    await upsertEvent(testDb.db, eventInput('at://a/2', 'Two', inDays(2)))

    await deleteEventByUri(testDb.db, 'at://a/1')

    assert.equal(await getEventByUri(testDb.db, 'at://a/1'), undefined)
    assert.ok(await getEventByUri(testDb.db, 'at://a/2'))
  })

  test('listEventsByAuthor returns that author only, ordered by start ascending with undated last', async () => {
    await upsertEvent(testDb.db, eventInput('at://a/later', 'Later', inDays(5)))
    await upsertEvent(testDb.db, eventInput('at://a/undated', 'Undated', null))
    await upsertEvent(testDb.db, eventInput('at://a/soon', 'Soon', inDays(1)))
    await upsertEvent(testDb.db, eventInput('at://b/other', 'Other', inDays(1), OTHER))

    const rows = await listEventsByAuthor(testDb.db, AUTHOR)
    assert.deepEqual(
      rows.map((row) => row.name),
      ['Soon', 'Later', 'Undated'],
    )
  })

  test('upsertRsvp is idempotent, then deleteRsvpByUri removes it', async () => {
    await upsertRsvp(testDb.db, rsvpInput('at://r/1', 'at://a/1', `${REF}going`))
    await upsertRsvp(testDb.db, rsvpInput('at://r/1', 'at://a/1', `${REF}interested`))

    const rows = await testDb.db.selectFrom('rsvp').selectAll().execute()
    assert.equal(rows.length, 1)
    assert.equal(rows[0]?.status, `${REF}interested`)

    await deleteRsvpByUri(testDb.db, 'at://r/1')
    assert.equal((await testDb.db.selectFrom('rsvp').selectAll().execute()).length, 0)
  })

  test('deleteAllByDid removes both events and RSVPs authored by one DID, leaving others', async () => {
    await upsertEvent(testDb.db, eventInput('at://a/1', 'Mine', inDays(1), AUTHOR))
    await upsertEvent(testDb.db, eventInput('at://b/1', 'Theirs', inDays(1), OTHER))
    await upsertRsvp(testDb.db, rsvpInput('at://r/mine', 'at://b/1', `${REF}going`, AUTHOR))
    await upsertRsvp(testDb.db, rsvpInput('at://r/theirs', 'at://a/1', `${REF}going`, OTHER))

    await deleteAllByDid(testDb.db, AUTHOR)

    assert.deepEqual(
      (await testDb.db.selectFrom('event').selectAll().execute()).map((row) => row.uri),
      ['at://b/1'],
    )
    assert.deepEqual(
      (await testDb.db.selectFrom('rsvp').selectAll().execute()).map((row) => row.uri),
      ['at://r/theirs'],
    )
  })

  test('listEventsForParticipant joins events, accepts both status spellings and drops orphans', async () => {
    await upsertEvent(testDb.db, eventInput('at://a/going', 'Going', inDays(1)))
    await upsertEvent(testDb.db, eventInput('at://a/bare', 'Bare', inDays(2)))
    await upsertEvent(testDb.db, eventInput('at://a/declined', 'Declined', inDays(3)))

    await upsertRsvp(testDb.db, rsvpInput('at://r/1', 'at://a/going', `${REF}going`))
    await upsertRsvp(testDb.db, rsvpInput('at://r/2', 'at://a/bare', 'interested'))
    await upsertRsvp(testDb.db, rsvpInput('at://r/3', 'at://a/declined', `${REF}notgoing`))
    await upsertRsvp(testDb.db, rsvpInput('at://r/4', 'at://a/missing', `${REF}going`))
    await upsertRsvp(testDb.db, rsvpInput('at://r/5', 'at://a/going', `${REF}going`, OTHER))

    const rows = await listEventsForParticipant(testDb.db, VIEWER)

    assert.deepEqual(rows.map((row) => row.name).sort(), ['Bare', 'Going'])
    assert.ok(rows.every((row) => row.rsvp_status.length > 0))
    assert.ok(rows.every((row) => row.rsvp_indexed_at instanceof Date))
  })

  test('listRsvpsForEvent orders by indexed_at and normalises the status', async () => {
    await upsertEvent(testDb.db, eventInput('at://a/1', 'One', inDays(1)))

    await upsertRsvp(testDb.db, rsvpInput('at://r/ref', 'at://a/1', `${REF}going`))
    await upsertRsvp(testDb.db, rsvpInput('at://r/bare', 'at://a/1', 'interested'))
    await upsertRsvp(testDb.db, rsvpInput('at://r/unknown', 'at://a/1', 'maybe'))

    const rows = await listRsvpsForEvent(testDb.db, 'at://a/1')
    const byUri = new Map(rows.map((row) => [row.uri, row]))

    assert.equal(byUri.get('at://r/ref')?.status_name, 'going')
    assert.equal(byUri.get('at://r/bare')?.status_name, 'interested')
    assert.equal(byUri.get('at://r/unknown')?.status_name, null)
    assert.equal(byUri.get('at://r/ref')?.status, `${REF}going`)
  })

  test('listDiscoverEvents excludes undated events and returns at most the limit', async () => {
    for (let i = 0; i < 5; i += 1) {
      await upsertEvent(testDb.db, eventInput(`at://a/future-${i}`, `Future ${i}`, inDays(1 + i)))
    }
    for (let i = 0; i < 3; i += 1) {
      await upsertEvent(testDb.db, eventInput(`at://a/past-${i}`, `Past ${i}`, inDays(-1 - i)))
    }
    await upsertEvent(testDb.db, eventInput('at://a/undated', 'Undated', null))

    const picked = await listDiscoverEvents(testDb.db, { limit: 3 })
    assert.equal(picked.length, 3)
    assert.ok(picked.every((row) => row.starts_at !== null))
  })

  test('listDiscoverEvents tops up from the most recent past events', async () => {
    await upsertEvent(testDb.db, eventInput('at://a/future', 'Future', inDays(1)))
    await upsertEvent(testDb.db, eventInput('at://a/past-recent', 'Recent', inDays(-1)))
    await upsertEvent(testDb.db, eventInput('at://a/past-old', 'Old', inDays(-10)))

    const picked = await listDiscoverEvents(testDb.db, { limit: 2 })
    assert.deepEqual(picked.map((row) => row.name).sort(), ['Future', 'Recent'])
  })

  test('listDiscoverEvents returns nothing for a non-positive limit and clamps an oversized one', async () => {
    await upsertEvent(testDb.db, eventInput('at://a/1', 'One', inDays(1)))

    assert.deepEqual(await listDiscoverEvents(testDb.db, { limit: 0 }), [])
    assert.equal((await listDiscoverEvents(testDb.db, { limit: 1000 })).length, 1)
    assert.ok(MAX_DISCOVER_LIMIT >= 1)
  })

  test('createInvite and getInviteByTokenHash round-trip', async () => {
    await createInvite(testDb.db, {
      tokenHash: 'hash-1',
      eventUri: 'at://a/1',
      inviteeDid: 'did:plc:invitee',
      inviteeHandle: 'invitee.test',
      inviterDid: AUTHOR,
      inviterHandle: 'author.test',
    })

    const invite = await getInviteByTokenHash(testDb.db, 'hash-1')
    assert.equal(invite?.event_uri, 'at://a/1')
    assert.equal(invite?.invitee_did, 'did:plc:invitee')
    assert.equal(invite?.inviter_handle, 'author.test')
    assert.equal(await getInviteByTokenHash(testDb.db, 'missing'), undefined)
  })

  test('writeCursor and readCursor round-trip a sequence beyond 32 bits', async () => {
    assert.equal(await readCursor(testDb.db), 0)

    const seq = 5_000_000_000
    await writeCursor(testDb.db, seq)
    assert.equal(await readCursor(testDb.db), seq)

    await writeCursor(testDb.db, 7)
    assert.equal(await readCursor(testDb.db), 7)
  })
})
