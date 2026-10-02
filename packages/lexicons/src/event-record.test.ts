import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { formatEventLocations, parseEventDetails } from '../dist/event-record.js'

const ADDRESS = 'community.lexicon.location.address'
const GEO = 'community.lexicon.location.geo'
const FSQ = 'community.lexicon.location.fsq'
const HTHREE = 'community.lexicon.location.hthree'
const EVENT_URI = 'community.lexicon.calendar.event#uri'

describe('parseEventDetails', () => {
  test('returns nothing for a missing or non-object record', () => {
    for (const value of [null, undefined, 'x', 7, [], true]) {
      assert.deepEqual(parseEventDetails(value), { description: null, locations: [] })
    }
  })

  test('returns nothing for an empty record', () => {
    assert.deepEqual(parseEventDetails({}), { description: null, locations: [] })
  })

  test('reads and trims the description', () => {
    assert.equal(
      parseEventDetails({ description: '  Bring a friend  ' }).description,
      'Bring a friend',
    )
  })

  test('treats a blank or non-string description as absent', () => {
    assert.equal(parseEventDetails({ description: '   ' }).description, null)
    assert.equal(parseEventDetails({ description: 42 }).description, null)
  })

  test('preserves the description verbatim; escaping is the renderer\u2019s job', () => {
    const payload = '<script>alert(1)</script>'
    assert.equal(parseEventDetails({ description: payload }).description, payload)
  })

  test('keeps location objects in order and drops non-objects', () => {
    const address = { $type: ADDRESS, country: 'IT' }
    const uri = { $type: EVENT_URI, uri: 'https://example.com' }
    assert.deepEqual(parseEventDetails({ locations: [address, null, 'x', 3, uri] }).locations, [
      address,
      uri,
    ])
  })

  test('ignores a non-array locations field', () => {
    assert.deepEqual(parseEventDetails({ locations: { country: 'IT' } }).locations, [])
  })
})

describe('formatEventLocations', () => {
  test('returns nothing for a missing or non-array value', () => {
    for (const value of [null, undefined, 'x', 7, {}, true]) {
      assert.deepEqual(formatEventLocations(value), [])
    }
  })

  test('formats an event#uri location, preferring its name', () => {
    assert.deepEqual(
      formatEventLocations([
        { $type: EVENT_URI, uri: 'https://meet.example.com/abc', name: 'Online' },
        { $type: EVENT_URI, uri: 'https://meet.example.com/xyz' },
      ]),
      ['Online', 'https://meet.example.com/xyz'],
    )
  })

  test('assembles an address from its present parts, in order', () => {
    assert.deepEqual(
      formatEventLocations([
        {
          $type: ADDRESS,
          name: 'The Grand Hall',
          street: '12 Main St',
          locality: 'Springfield',
          region: 'IL',
          postalCode: '62704',
          country: 'US',
        },
        { $type: ADDRESS, country: 'IT' },
      ]),
      ['The Grand Hall, 12 Main St, Springfield, IL, 62704, US', 'IT'],
    )
  })

  test('formats geographic coordinates, with or without a name', () => {
    assert.deepEqual(
      formatEventLocations([
        { $type: GEO, name: 'The park', latitude: '45.0', longitude: '9.0', altitude: '120' },
        { $type: GEO, latitude: '45.1', longitude: '9.1' },
      ]),
      ['The park (45.0, 9.0)', '45.1, 9.1'],
    )
  })

  test('formats an fsq location from its coordinates', () => {
    assert.deepEqual(
      formatEventLocations([{ $type: FSQ, name: 'Cafe', latitude: '1', longitude: '2' }]),
      ['Cafe (1, 2)'],
    )
  })

  test('formats an H3 cell', () => {
    assert.deepEqual(
      formatEventLocations([
        { $type: HTHREE, name: 'Neighbourhood', value: '8928308280fffff' },
        { $type: HTHREE, value: '8928308281fffff' },
      ]),
      ['Neighbourhood', '8928308281fffff'],
    )
  })

  test('falls back to the object shape when $type is missing', () => {
    assert.deepEqual(
      formatEventLocations([
        { street: '1 Road', country: 'FR' },
        { uri: 'https://example.com' },
        { value: 'abc' },
        { latitude: '1', longitude: '2' },
      ]),
      ['1 Road, FR', 'https://example.com', 'abc', '1, 2'],
    )
  })

  test('skips entries that carry nothing displayable', () => {
    assert.deepEqual(formatEventLocations([null, 'x', 3, {}, { $type: ADDRESS }]), [])
  })

  test('de-duplicates identical labels but keeps order', () => {
    assert.deepEqual(
      formatEventLocations([
        { $type: ADDRESS, country: 'IT' },
        { $type: ADDRESS, country: 'FR' },
        { $type: ADDRESS, country: 'IT' },
      ]),
      ['IT', 'FR'],
    )
  })
})
