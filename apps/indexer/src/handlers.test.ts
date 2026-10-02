import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import type { TypedEvent } from '@bsky/jetstream'
import type { EventUpsert, RsvpUpsert } from '@clairvoyant/db'
import { EVENT_COLLECTION, RSVP_COLLECTION } from '@clairvoyant/lexicons'
import { createProjector } from '../dist/handlers.js'
import type { Logger } from '../dist/logger.js'
import type { ProjectorStore } from '../dist/store.js'

const DID = 'did:plc:author'
const OTHER_DID = 'did:plc:other'
const TIME = '2026-01-01T00:00:00.000Z'
const CID = 'bafyreifrkdbnkvfjujntdaeigolnrjj3srrs53tfixjhmacclps72qlov4'

interface Ops {
  upsertEvent: EventUpsert[]
  deleteEventByUri: string[]
  upsertRsvp: RsvpUpsert[]
  deleteRsvpByUri: string[]
  deleteAllByDid: string[]
  writeCursor: number[]
}

const createFakeProjectorStore = () => {
  const ops: Ops = {
    upsertEvent: [],
    deleteEventByUri: [],
    upsertRsvp: [],
    deleteRsvpByUri: [],
    deleteAllByDid: [],
    writeCursor: [],
  }

  const store: ProjectorStore = {
    async readCursor() {
      return 0
    },
    async transaction(run) {
      return run({
        upsertEvent: async (input) => {
          ops.upsertEvent.push(input)
        },
        deleteEventByUri: async (uri) => {
          ops.deleteEventByUri.push(uri)
        },
        upsertRsvp: async (input) => {
          ops.upsertRsvp.push(input)
        },
        deleteRsvpByUri: async (uri) => {
          ops.deleteRsvpByUri.push(uri)
        },
        deleteAllByDid: async (did) => {
          ops.deleteAllByDid.push(did)
        },
        writeCursor: async (seq) => {
          ops.writeCursor.push(seq)
        },
      })
    },
  }

  return { store, ops }
}

interface CapturedLog {
  level: string
  message: string
}

const fakeLogger = () => {
  const entries: CapturedLog[] = []
  const make =
    (level: string) =>
    (message: string): void => {
      entries.push({ level, message })
    }
  const logger: Logger = {
    debug: make('debug'),
    info: make('info'),
    warn: make('warn'),
    error: make('error'),
  }
  return { logger, entries }
}

const setup = () => {
  const { store, ops } = createFakeProjectorStore()
  const { logger, entries } = fakeLogger()
  return { project: createProjector({ store, log: logger }), ops, entries }
}

const commitCreate = (
  collection: string,
  rkey: string,
  record: Record<string, unknown>,
  did = DID,
): TypedEvent =>
  ({
    kind: 'commit',
    did,
    seq: 1,
    time: TIME,
    commit: { operation: 'create', collection, rkey, rev: 'rev', cid: CID, record },
  }) as unknown as TypedEvent

const commitDelete = (collection: string, rkey: string, did = DID): TypedEvent =>
  ({
    kind: 'commit',
    did,
    seq: 2,
    time: TIME,
    commit: { operation: 'delete', collection, rkey, rev: 'rev' },
  }) as unknown as TypedEvent

const eventRecord = (overrides: Record<string, unknown> = {}) => ({
  $type: EVENT_COLLECTION,
  name: 'Party',
  createdAt: TIME,
  ...overrides,
})

const rsvpRecord = (overrides: Record<string, unknown> = {}) => ({
  $type: RSVP_COLLECTION,
  status: `${RSVP_COLLECTION}#going`,
  subject: { uri: `at://${DID}/${EVENT_COLLECTION}/1`, cid: CID },
  ...overrides,
})

describe('createProjector commit events', () => {
  test('projects a created event with a derived AT-URI', async () => {
    const { project, ops } = setup()
    await project(commitCreate(EVENT_COLLECTION, 'abc', eventRecord({ startsAt: TIME })))

    assert.equal(ops.upsertEvent.length, 1)
    const input = ops.upsertEvent[0]
    assert.equal(input?.uri, `at://${DID}/${EVENT_COLLECTION}/abc`)
    assert.equal(input?.cid, CID)
    assert.equal(input?.authorDid, DID)
    assert.equal(input?.name, 'Party')
    assert.equal(input?.startsAt?.getTime(), Date.parse(TIME))
    assert.equal(input?.endsAt, null)
    assert.equal(input?.description, null)
    assert.deepEqual(input?.locations, [])
    assert.deepEqual(input?.raw, eventRecord({ startsAt: TIME }))
  })

  test('projects the endsAt field when present', async () => {
    const { project, ops } = setup()
    await project(
      commitCreate(EVENT_COLLECTION, 'abc', eventRecord({ startsAt: TIME, endsAt: TIME })),
    )
    assert.equal(ops.upsertEvent[0]?.endsAt?.getTime(), Date.parse(TIME))
  })

  test('deletes an event by derived AT-URI', async () => {
    const { project, ops } = setup()
    await project(commitDelete(EVENT_COLLECTION, 'abc'))
    assert.deepEqual(ops.deleteEventByUri, [`at://${DID}/${EVENT_COLLECTION}/abc`])
  })

  test('skips an event that fails Lexicon validation and warns', async () => {
    const { project, ops, entries } = setup()
    await project(commitCreate(EVENT_COLLECTION, 'abc', { $type: EVENT_COLLECTION, name: 'x' }))

    assert.equal(ops.upsertEvent.length, 0)
    assert.ok(entries.some((entry) => entry.level === 'warn' && entry.message.includes('event')))
  })

  test('projects a created RSVP with the subject URI and verbatim status', async () => {
    const { project, ops } = setup()
    await project(commitCreate(RSVP_COLLECTION, 'r1', rsvpRecord()))

    assert.equal(ops.upsertRsvp.length, 1)
    const input = ops.upsertRsvp[0]
    assert.equal(input?.uri, `at://${DID}/${RSVP_COLLECTION}/r1`)
    assert.equal(input?.subjectUri, `at://${DID}/${EVENT_COLLECTION}/1`)
    assert.equal(input?.status, `${RSVP_COLLECTION}#going`)
  })

  test('deletes an RSVP by derived AT-URI', async () => {
    const { project, ops } = setup()
    await project(commitDelete(RSVP_COLLECTION, 'r1'))
    assert.deepEqual(ops.deleteRsvpByUri, [`at://${DID}/${RSVP_COLLECTION}/r1`])
  })

  test('skips an RSVP that fails Lexicon validation and warns', async () => {
    const { project, ops, entries } = setup()
    await project(commitCreate(RSVP_COLLECTION, 'r1', { $type: RSVP_COLLECTION, status: 'going' }))

    assert.equal(ops.upsertRsvp.length, 0)
    assert.ok(entries.some((entry) => entry.level === 'warn' && entry.message.includes('rsvp')))
  })

  test('ignores commits for collections it does not index, but still advances the cursor', async () => {
    const { project, ops } = setup()
    await project(commitCreate('app.bsky.feed.post', 'p1', { text: 'hi' }))

    assert.equal(ops.upsertEvent.length, 0)
    assert.equal(ops.upsertRsvp.length, 0)
    assert.deepEqual(ops.writeCursor, [1])
  })

  test('never touches another author\u2019s rows when projecting a commit', async () => {
    const { project, ops } = setup()
    await project(commitCreate(EVENT_COLLECTION, 'abc', eventRecord(), OTHER_DID))
    assert.equal(ops.upsertEvent[0]?.authorDid, OTHER_DID)
    assert.equal(ops.deleteAllByDid.length, 0)
  })
})

describe('createProjector account, sync and identity events', () => {
  test('removes every derived row for a deleted account', async () => {
    const { project, ops, entries } = setup()
    await project({
      kind: 'account',
      did: DID,
      seq: 9,
      time: TIME,
      account: { did: DID, active: false, status: 'deleted' },
    } as unknown as TypedEvent)

    assert.deepEqual(ops.deleteAllByDid, [DID])
    assert.deepEqual(ops.writeCursor, [9])
    assert.ok(entries.some((entry) => entry.level === 'info'))
  })

  test('keeps rows for an account that is merely deactivated', async () => {
    const { project, ops } = setup()
    await project({
      kind: 'account',
      did: DID,
      seq: 9,
      time: TIME,
      account: { did: DID, active: false, status: 'deactivated' },
    } as unknown as TypedEvent)

    assert.deepEqual(ops.deleteAllByDid, [])
  })

  test('clears derived rows on a sync event', async () => {
    const { project, ops, entries } = setup()
    await project({
      kind: 'sync',
      did: DID,
      seq: 5,
      time: TIME,
      sync: { did: DID, rev: 'rev' },
    } as unknown as TypedEvent)

    assert.deepEqual(ops.deleteAllByDid, [DID])
    assert.deepEqual(ops.writeCursor, [5])
    assert.ok(entries.some((entry) => entry.level === 'info'))
  })

  test('ignores identity changes but still advances the cursor', async () => {
    const { project, ops, entries } = setup()
    await project({
      kind: 'identity',
      did: DID,
      seq: 6,
      time: TIME,
      identity: { did: DID, handle: 'author.test' },
    } as unknown as TypedEvent)

    assert.deepEqual(ops.deleteAllByDid, [])
    assert.deepEqual(ops.writeCursor, [6])
    assert.ok(entries.some((entry) => entry.level === 'debug'))
  })

  test('writes the cursor exactly once per event, whatever the kind', async () => {
    const { project, ops } = setup()
    await project(commitCreate(EVENT_COLLECTION, 'abc', eventRecord()))
    await project(commitDelete(EVENT_COLLECTION, 'abc'))
    await project({
      kind: 'identity',
      did: DID,
      seq: 3,
      time: TIME,
      identity: { did: DID },
    } as unknown as TypedEvent)

    assert.deepEqual(ops.writeCursor, [1, 2, 3])
  })
})
