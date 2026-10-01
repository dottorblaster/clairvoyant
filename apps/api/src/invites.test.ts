import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { generateInviteToken, hashInviteToken } from '../dist/invites.js'

describe('generateInviteToken', () => {
  test('produces a 32-byte base64url token', () => {
    const token = generateInviteToken()
    assert.equal(token.length, 43)
    assert.match(token, /^[A-Za-z0-9_-]+$/)
  })

  test('never repeats across many calls', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => generateInviteToken()))
    assert.equal(tokens.size, 200)
  })
})

describe('hashInviteToken', () => {
  test('is a deterministic SHA-256 in base64url', () => {
    assert.equal(hashInviteToken('hello'), 'LPJNul-wow4m6DsqxbninhsWHlwfp0JecwQzYpOLmCQ')
    assert.equal(hashInviteToken('hello'), hashInviteToken('hello'))
  })

  test('differs for different tokens', () => {
    assert.notEqual(hashInviteToken('a'), hashInviteToken('b'))
  })

  test('does not contain the raw token', () => {
    const token = generateInviteToken()
    assert.ok(!hashInviteToken(token).includes(token))
  })
})
