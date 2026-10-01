import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { RSVP_COLLECTION } from '@clairvoyant/lexicons'
import type { PdsAgent } from '../dist/pds.js'
import { findExistingRsvpRkey, writeRsvpRecord } from '../dist/pds.js'

const EVENT_URI = 'at://did:plc:author/community.lexicon.calendar.event/abc'
const RSVP_URI = `at://did:plc:viewer/${RSVP_COLLECTION}/rkey123`

interface AgentCalls {
  listRecords: Array<{ collection: string; limit: number; cursor?: string }>
  createRecord: Array<{ collection: string; record: Record<string, unknown> }>
  putRecord: Array<{ collection: string; rkey: string; record: Record<string, unknown> }>
}

const fakeAgent = (overrides: Partial<PdsAgent> = {}): { agent: PdsAgent; calls: AgentCalls } => {
  const calls: AgentCalls = { listRecords: [], createRecord: [], putRecord: [] }

  const agent: PdsAgent = {
    async listRecords(input) {
      calls.listRecords.push(input)
      return { records: [] }
    },
    async createRecord(input) {
      calls.createRecord.push(input)
      return { uri: 'at://did:plc:viewer/col/new', cid: 'cid-new' }
    },
    async putRecord(input) {
      calls.putRecord.push(input)
      return { uri: `at://did:plc:viewer/col/${input.rkey}`, cid: 'cid-put' }
    },
    async getSession() {
      return { handle: 'viewer.test' }
    },
    async resolveHandle() {
      return 'did:plc:invitee'
    },
    ...overrides,
  }

  return { agent, calls }
}

const rsvpRecord = (subjectUri: string) => ({
  uri: RSVP_URI,
  value: {
    $type: RSVP_COLLECTION,
    status: `${RSVP_COLLECTION}#going`,
    subject: { uri: subjectUri },
  },
})

describe('findExistingRsvpRkey', () => {
  test('returns the rkey of a record pointing at the event', async () => {
    const { agent, calls } = fakeAgent({
      listRecords: async (input) => {
        calls.listRecords.push(input)
        return { records: [rsvpRecord(EVENT_URI)] }
      },
    })

    assert.equal(await findExistingRsvpRkey(agent, EVENT_URI), 'rkey123')
  })

  test('ignores records for other events and malformed subjects', async () => {
    const { agent, calls } = fakeAgent({
      listRecords: async (input) => {
        calls.listRecords.push(input)
        return {
          records: [
            { uri: 'at://x/other/1', value: { subject: { uri: 'at://other' } } },
            { uri: 'at://x/malformed/1', value: {} },
            rsvpRecord(EVENT_URI),
          ],
        }
      },
    })

    assert.equal(await findExistingRsvpRkey(agent, EVENT_URI), 'rkey123')
  })

  test('paginates with the cursor until it finds a match', async () => {
    const { agent, calls } = fakeAgent({
      listRecords: async (input) => {
        calls.listRecords.push(input)
        if (input.cursor === undefined) {
          return { records: [rsvpRecord('at://other')], cursor: 'page-2' }
        }
        return { records: [rsvpRecord(EVENT_URI)] }
      },
    })

    assert.equal(await findExistingRsvpRkey(agent, EVENT_URI), 'rkey123')
    assert.equal(calls.listRecords.length, 2)
    assert.equal(calls.listRecords[1]?.cursor, 'page-2')
  })

  test('gives up after ten pages and returns null', async () => {
    const { agent, calls } = fakeAgent({
      listRecords: async (input) => {
        calls.listRecords.push(input)
        return { records: [], cursor: 'always-more' }
      },
    })

    assert.equal(await findExistingRsvpRkey(agent, EVENT_URI), null)
    assert.equal(calls.listRecords.length, 10)
  })

  test('asks for 100 records of the rsvp collection', async () => {
    const { agent, calls } = fakeAgent()
    await findExistingRsvpRkey(agent, EVENT_URI)
    assert.equal(calls.listRecords[0]?.collection, RSVP_COLLECTION)
    assert.equal(calls.listRecords[0]?.limit, 100)
  })
})

describe('writeRsvpRecord', () => {
  test('creates a record when the viewer has no RSVP yet', async () => {
    const { agent, calls } = fakeAgent()

    const result = await writeRsvpRecord(agent, EVENT_URI, 'cid-event', 'going')

    assert.equal(calls.createRecord.length, 1)
    assert.equal(calls.putRecord.length, 0)
    const record = calls.createRecord[0]?.record as Record<string, unknown>
    assert.equal(record.$type, RSVP_COLLECTION)
    assert.equal(record.status, `${RSVP_COLLECTION}#going`)
    assert.deepEqual(record.subject, { uri: EVENT_URI, cid: 'cid-event' })
    assert.equal(result.cid, 'cid-new')
  })

  test('updates the existing record in place when one is found', async () => {
    const { agent, calls } = fakeAgent({
      listRecords: async (input) => {
        calls.listRecords.push(input)
        return { records: [rsvpRecord(EVENT_URI)] }
      },
    })

    await writeRsvpRecord(agent, EVENT_URI, 'cid-event', 'interested')

    assert.equal(calls.createRecord.length, 0)
    assert.equal(calls.putRecord.length, 1)
    assert.equal(calls.putRecord[0]?.rkey, 'rkey123')
    assert.equal(calls.putRecord[0]?.record.status, `${RSVP_COLLECTION}#interested`)
  })
})
