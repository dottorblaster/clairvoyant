import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { EVENT_COLLECTION, RSVP_COLLECTION } from '@clairvoyant/lexicons'
import { isValidEventRecord, isValidRsvpRecord } from '../dist/validate.js'

const CREATED_AT = '2026-01-01T00:00:00.000Z'
const CID = 'bafyreifrkdbnkvfjujntdaeigolnrjj3srrs53tfixjhmacclps72qlov4'
const validEvent = { $type: EVENT_COLLECTION, name: 'Party', createdAt: CREATED_AT }
const validRsvp = {
  $type: RSVP_COLLECTION,
  status: `${RSVP_COLLECTION}#going`,
  subject: { uri: `at://did:plc:x/${EVENT_COLLECTION}/1`, cid: CID },
}

describe('isValidEventRecord', () => {
  test('accepts a record the indexer can project', () => {
    assert.equal(isValidEventRecord(validEvent), true)
  })

  test('rejects a record the projection would choke on', () => {
    assert.equal(isValidEventRecord({ ...validEvent, name: undefined }), false)
    assert.equal(isValidEventRecord('x'), false)
  })
})

describe('isValidRsvpRecord', () => {
  test('accepts a record with a strongRef subject', () => {
    assert.equal(isValidRsvpRecord(validRsvp), true)
  })

  test('rejects a malformed subject', () => {
    assert.equal(isValidRsvpRecord({ ...validRsvp, subject: { uri: 'nope', cid: CID } }), false)
    assert.equal(isValidRsvpRecord({ $type: RSVP_COLLECTION, status: 'going' }), false)
  })
})
