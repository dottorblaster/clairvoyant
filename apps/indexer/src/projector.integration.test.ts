import assert from 'node:assert/strict'
import { after, before, beforeEach, describe, test } from 'node:test'
import type { TypedEvent } from '@bsky/jetstream'
import { readCursor } from '@clairvoyant/db'
import { createTestDatabase, hasTestDatabase, type TestDatabase } from '@clairvoyant/db/testing'
import { EVENT_COLLECTION, RSVP_COLLECTION } from '@clairvoyant/lexicons'
import { createProjector } from '../dist/handlers.js'
import type { Logger } from '../dist/logger.js'
import { createKyselyProjectorStore } from '../dist/store.js'

const DID = 'did:plc:author'
const TIME = '2026-01-01T00:00:00.000Z'
const CID = 'bafyreifrkdbnkvfjujntdaeigolnrjj3srrs53tfixjhmacclps72qlov4'
const EVENT_URI = `at://${DID}/${EVENT_COLLECTION}/abc`
const RSVP_URI = `at://${DID}/${RSVP_COLLECTION}/r1`

const silent: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}

const commitCreate = (collection: string, rkey: string, record: unknown, seq: number): TypedEvent =>
  ({
    kind: 'commit',
    did: DID,
    seq,
    time: TIME,
    commit: { operation: 'create', collection, rkey, rev: 'rev', cid: CID, record },
  }) as unknown as TypedEvent

const commitDelete = (collection: string, rkey: string, seq: number): TypedEvent =>
  ({
    kind: 'commit',
    did: DID,
    seq,
    time: TIME,
    commit: { operation: 'delete', collection, rkey, rev: 'rev' },
  }) as unknown as TypedEvent

const suite = hasTestDatabase() ? describe : describe.skip

suite('projector (Postgres integration)', () => {
  let testDb: TestDatabase
  let project: (event: TypedEvent) => Promise<void>

  before(async () => {
    testDb = await createTestDatabase()
  })

  after(async () => {
    await testDb.dispose()
  })

  beforeEach(async () => {
    await testDb.reset()
    project = createProjector({ store: createKyselyProjectorStore(testDb.db), log: silent })
  })

  test('folds a created event into the index and advances the cursor', async () => {
    await project(
      commitCreate(
        EVENT_COLLECTION,
        'abc',
        { $type: EVENT_COLLECTION, name: 'Party', createdAt: TIME, startsAt: TIME },
        11,
      ),
    )

    const row = await testDb.db
      .selectFrom('event')
      .selectAll()
      .where('uri', '=', EVENT_URI)
      .executeTakeFirst()
    assert.equal(row?.name, 'Party')
    assert.equal(row?.starts_at?.getTime(), Date.parse(TIME))
    assert.equal(await readCursor(testDb.db), 11)
  })

  test('is idempotent across replays of the same commit', async () => {
    const event = commitCreate(
      EVENT_COLLECTION,
      'abc',
      { $type: EVENT_COLLECTION, name: 'Party', createdAt: TIME },
      1,
    )
    await project(event)
    await project(event)

    assert.equal((await testDb.db.selectFrom('event').selectAll().execute()).length, 1)
  })

  test('removes an event on a delete commit', async () => {
    await project(
      commitCreate(
        EVENT_COLLECTION,
        'abc',
        { $type: EVENT_COLLECTION, name: 'Party', createdAt: TIME },
        1,
      ),
    )
    await project(commitDelete(EVENT_COLLECTION, 'abc', 2))

    assert.equal((await testDb.db.selectFrom('event').selectAll().execute()).length, 0)
    assert.equal(await readCursor(testDb.db), 2)
  })

  test('folds a created RSVP in with its subject URI', async () => {
    await project(
      commitCreate(
        RSVP_COLLECTION,
        'r1',
        {
          $type: RSVP_COLLECTION,
          status: `${RSVP_COLLECTION}#going`,
          subject: { uri: EVENT_URI, cid: CID },
        },
        7,
      ),
    )

    const row = await testDb.db
      .selectFrom('rsvp')
      .selectAll()
      .where('uri', '=', RSVP_URI)
      .executeTakeFirst()
    assert.equal(row?.subject_uri, EVENT_URI)
    assert.equal(row?.status, `${RSVP_COLLECTION}#going`)
  })

  test('drops every derived row when the account is deleted', async () => {
    await project(
      commitCreate(
        EVENT_COLLECTION,
        'abc',
        { $type: EVENT_COLLECTION, name: 'Party', createdAt: TIME },
        1,
      ),
    )
    await project({
      kind: 'account',
      did: DID,
      seq: 2,
      time: TIME,
      account: { did: DID, active: false, status: 'deleted' },
    } as unknown as TypedEvent)

    assert.equal((await testDb.db.selectFrom('event').selectAll().execute()).length, 0)
    assert.equal(await readCursor(testDb.db), 2)
  })

  test('clears derived rows on a sync event', async () => {
    await project(
      commitCreate(
        EVENT_COLLECTION,
        'abc',
        { $type: EVENT_COLLECTION, name: 'Party', createdAt: TIME },
        1,
      ),
    )
    await project({
      kind: 'sync',
      did: DID,
      seq: 2,
      time: TIME,
      sync: { did: DID, rev: 'rev' },
    } as unknown as TypedEvent)

    assert.equal((await testDb.db.selectFrom('event').selectAll().execute()).length, 0)
  })
})
