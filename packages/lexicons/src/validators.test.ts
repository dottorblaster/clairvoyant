import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { community } from '../dist/index.js'

/**
 * The generated bindings are the runtime gate for the indexer: Jetstream output
 * is not cryptographically verified, so `$safeValidate` is what stands between
 * the wire and Postgres. These tests pin the contract the indexer relies on.
 */
const event = community.lexicon.calendar.event
const rsvp = community.lexicon.calendar.rsvp

const EVENT_TYPE = 'community.lexicon.calendar.event'
const RSVP_TYPE = 'community.lexicon.calendar.rsvp'
const CREATED_AT = '2026-01-01T00:00:00.000Z'
const URI = 'at://did:plc:author/community.lexicon.calendar.event/abc'
const CID = 'bafyreifrkdbnkvfjujntdaeigolnrjj3srrs53tfixjhmacclps72qlov4'

const validEvent = { $type: EVENT_TYPE, name: 'Launch party', createdAt: CREATED_AT }
const validRsvp = {
  $type: RSVP_TYPE,
  status: 'community.lexicon.calendar.rsvp#going',
  subject: { uri: URI, cid: CID },
}

describe('event record validation', () => {
  test('accepts a minimal record', () => {
    assert.equal(event.$safeValidate(validEvent).success, true)
  })

  test('accepts the optional fields the API writes', () => {
    const result = event.$safeValidate({
      ...validEvent,
      startsAt: CREATED_AT,
      endsAt: CREATED_AT,
      description: 'Bring a friend',
    })
    assert.equal(result.success, true)
  })

  test('rejects a record without $type', () => {
    assert.equal(event.$safeValidate({ name: 'x', createdAt: CREATED_AT }).success, false)
  })

  test('rejects a missing name', () => {
    assert.equal(event.$safeValidate({ $type: EVENT_TYPE, createdAt: CREATED_AT }).success, false)
  })

  test('rejects a non-datetime createdAt', () => {
    assert.equal(event.$safeValidate({ ...validEvent, createdAt: 'not-a-date' }).success, false)
  })

  test('rejects a non-string name', () => {
    assert.equal(event.$safeValidate({ ...validEvent, name: 42 }).success, false)
  })

  test('rejects non-objects', () => {
    for (const value of [null, undefined, 'x', 7, []]) {
      assert.equal(event.$safeValidate(value).success, false)
    }
  })
})

describe('rsvp record validation', () => {
  test('accepts a record with a strongRef subject', () => {
    assert.equal(rsvp.$safeValidate(validRsvp).success, true)
  })

  test('requires status, even though the schema declares a default', () => {
    assert.equal(
      rsvp.$safeValidate({ $type: RSVP_TYPE, subject: { uri: URI, cid: CID } }).success,
      false,
    )
  })

  test('requires a subject', () => {
    assert.equal(rsvp.$safeValidate({ $type: RSVP_TYPE, status: 'going' }).success, false)
  })

  test('requires the subject URI to be an AT-URI', () => {
    const result = rsvp.$safeValidate({ ...validRsvp, subject: { uri: 'not-a-uri', cid: CID } })
    assert.equal(result.success, false)
  })

  test('accepts an unknown status, because knownValues is advisory', () => {
    // This is exactly why `packages/db` normalises both spellings instead of
    // relying on the lexicon to restrict the value.
    assert.equal(rsvp.$safeValidate({ ...validRsvp, status: 'maybe' }).success, true)
    assert.equal(rsvp.$safeValidate({ ...validRsvp, status: 'going' }).success, true)
  })
})
