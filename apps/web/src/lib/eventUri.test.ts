import { EVENT_COLLECTION } from '@clairvoyant/lexicons'
import { describe, expect, test } from 'vitest'
import { buildEventPath, buildEventUri, parseEventUri, rkeyFromUri } from './eventUri'

const DID = 'did:plc:author'
const URI = `at://${DID}/${EVENT_COLLECTION}/abc`

describe('buildEventUri', () => {
  test('composes an at-uri from the did and rkey', () => {
    expect(buildEventUri(DID, 'abc')).toBe(URI)
  })
})

describe('buildEventPath', () => {
  test('builds the human-readable route', () => {
    expect(buildEventPath(DID, 'abc')).toBe(`/p/${DID}/e/abc`)
  })
})

describe('parseEventUri', () => {
  test('round-trips a built uri', () => {
    expect(parseEventUri(URI)).toEqual({ did: DID, rkey: 'abc' })
  })

  test('tolerates a uri without the at:// prefix', () => {
    expect(parseEventUri(`${DID}/${EVENT_COLLECTION}/abc`)).toEqual({ did: DID, rkey: 'abc' })
  })

  test('returns null when the did or rkey is missing', () => {
    expect(parseEventUri('at://did:plc:author')).toBeNull()
    expect(parseEventUri('at://did:plc:author/collection')).toBeNull()
    expect(parseEventUri('')).toBeNull()
  })
})

describe('rkeyFromUri', () => {
  test('returns the last path segment', () => {
    expect(rkeyFromUri(URI)).toBe('abc')
  })

  test('returns an empty string when there is no rkey', () => {
    expect(rkeyFromUri('at://')).toBe('')
  })
})
