import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { parseSession, serializeSession } from '../dist/session-cookie.js'

const SECRET = 'a-long-enough-secret-for-tests-123456'
const DID = 'did:plc:abcdefghijklmnopqrstuvwx'

describe('session cookie', () => {
  test('round-trips the DID', () => {
    assert.equal(parseSession(SECRET, serializeSession(SECRET, DID)), DID)
  })

  test('rejects a cookie signed with a different secret', () => {
    const cookie = serializeSession(SECRET, DID)
    assert.equal(parseSession('another-secret-that-is-long-enough', cookie), null)
  })

  test('rejects a tampered payload', () => {
    const cookie = serializeSession(SECRET, DID)
    const [payload, signature] = cookie.split('.')
    const forgedPayload = Buffer.from('did:plc:someoneelse', 'utf8').toString('base64url')
    assert.equal(parseSession(SECRET, `${forgedPayload}.${signature}`), null)
    assert.ok(payload)
  })

  test('rejects a tampered signature', () => {
    const cookie = serializeSession(SECRET, DID)
    const [payload] = cookie.split('.')
    assert.equal(parseSession(SECRET, `${payload}.AAAA`), null)
  })

  test('rejects a missing or empty cookie', () => {
    assert.equal(parseSession(SECRET, undefined), null)
    assert.equal(parseSession(SECRET, ''), null)
  })

  test('rejects malformed values', () => {
    for (const value of ['nodot', '.', '.sig', 'payload.', 'a.b.c']) {
      assert.equal(parseSession(SECRET, value), null, `expected null for ${JSON.stringify(value)}`)
    }
  })

  test('rejects a correctly signed payload that is not a DID', () => {
    assert.equal(parseSession(SECRET, serializeSession(SECRET, 'not-a-did')), null)
  })
})
