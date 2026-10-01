import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { parseEventRecord, parseRsvpRecord } from '../dist/records.js'

const ISO = '2026-01-01T00:00:00.000Z'

describe('parseEventRecord', () => {
  test('reads a name and optional dates', () => {
    assert.deepEqual(parseEventRecord({ name: 'Party', startsAt: ISO, endsAt: ISO }), {
      name: 'Party',
      startsAt: new Date(ISO),
      endsAt: new Date(ISO),
    })
  })

  test('treats missing dates as null', () => {
    assert.deepEqual(parseEventRecord({ name: 'Party' }), {
      name: 'Party',
      startsAt: null,
      endsAt: null,
    })
    assert.deepEqual(parseEventRecord({ name: 'Party', startsAt: null, endsAt: null }), {
      name: 'Party',
      startsAt: null,
      endsAt: null,
    })
  })

  test('accepts Date values as well as ISO strings', () => {
    const parsed = parseEventRecord({ name: 'Party', startsAt: new Date(ISO) })
    assert.equal(parsed?.startsAt?.getTime(), Date.parse(ISO))
  })

  test('rejects a record without a usable name', () => {
    for (const record of [null, 'x', 7, {}, { name: '' }, { name: 42 }]) {
      assert.equal(parseEventRecord(record), null, JSON.stringify(record))
    }
  })

  test('rejects an unparseable date rather than storing an epoch', () => {
    assert.equal(parseEventRecord({ name: 'Party', startsAt: 'not-a-date' }), null)
    assert.equal(parseEventRecord({ name: 'Party', endsAt: 'not-a-date' }), null)
    assert.equal(parseEventRecord({ name: 'Party', startsAt: new Date('nope') }), null)
    assert.equal(parseEventRecord({ name: 'Party', startsAt: 123 }), null)
  })
})

describe('parseRsvpRecord', () => {
  test('reads the subject URI and status', () => {
    assert.deepEqual(parseRsvpRecord({ subject: { uri: 'at://event/1' }, status: 'going' }), {
      subjectUri: 'at://event/1',
      status: 'going',
    })
  })

  test('rejects a missing or malformed subject', () => {
    for (const record of [
      null,
      {},
      { subject: null },
      { subject: 'x' },
      { subject: {} },
      { subject: { uri: '' } },
      { subject: { uri: 42 } },
    ]) {
      assert.equal(parseRsvpRecord(record), null, JSON.stringify(record))
    }
  })

  test('rejects a missing or non-string status', () => {
    assert.equal(parseRsvpRecord({ subject: { uri: 'at://event/1' } }), null)
    assert.equal(parseRsvpRecord({ subject: { uri: 'at://event/1' }, status: 3 }), null)
  })

  test('keeps an unknown status verbatim', () => {
    assert.equal(parseRsvpRecord({ subject: { uri: 'at://e' }, status: 'maybe' })?.status, 'maybe')
  })
})
