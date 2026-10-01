import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  EVENT_COLLECTION,
  INDEXED_COLLECTIONS,
  isIndexedCollection,
  RSVP_COLLECTION,
} from '../dist/collections.js'

describe('collection NSIDs', () => {
  test('are the exact community lexicon identifiers', () => {
    assert.equal(EVENT_COLLECTION, 'community.lexicon.calendar.event')
    assert.equal(RSVP_COLLECTION, 'community.lexicon.calendar.rsvp')
  })

  test('INDEXED_COLLECTIONS contains exactly the two indexed collections', () => {
    assert.deepEqual([...INDEXED_COLLECTIONS], [EVENT_COLLECTION, RSVP_COLLECTION])
  })
})

describe('isIndexedCollection', () => {
  test('accepts the indexed collections', () => {
    assert.equal(isIndexedCollection(EVENT_COLLECTION), true)
    assert.equal(isIndexedCollection(RSVP_COLLECTION), true)
  })

  test('rejects anything else', () => {
    for (const value of [
      '',
      'app.bsky.feed.post',
      'community.lexicon.calendar.event#uri',
      'community.lexicon.calendar',
      'COMMUNITY.LEXICON.CALENDAR.EVENT',
    ]) {
      assert.equal(isIndexedCollection(value), false, `expected false for ${JSON.stringify(value)}`)
    }
  })
})
