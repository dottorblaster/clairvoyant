import { describe, expect, test } from 'vitest'
import { buildInviteUrl, buildLoginUrl, normalizeHandle } from './handle'

describe('normalizeHandle', () => {
  test('trims whitespace and a leading @', () => {
    expect(normalizeHandle('  @alice.test ')).toBe('alice.test')
    expect(normalizeHandle('alice.test')).toBe('alice.test')
  })

  test('leaves an inner @ alone', () => {
    expect(normalizeHandle('alice@b.test')).toBe('alice@b.test')
  })
})

describe('buildLoginUrl', () => {
  test('encodes the handle', () => {
    expect(buildLoginUrl('alice.test')).toBe('/oauth/login?handle=alice.test')
  })

  test('includes the return path when given one', () => {
    expect(buildLoginUrl('alice.test', '/p/did/e/abc?invite=t')).toBe(
      '/oauth/login?handle=alice.test&return_to=%2Fp%2Fdid%2Fe%2Fabc%3Finvite%3Dt',
    )
  })

  test('omits an empty return path', () => {
    expect(buildLoginUrl('alice.test', '')).toBe('/oauth/login?handle=alice.test')
  })
})

describe('buildInviteUrl', () => {
  test('appends the token to the event path', () => {
    expect(buildInviteUrl('https://app.example', '/p/did/e/abc', 'tok')).toBe(
      'https://app.example/p/did/e/abc?invite=tok',
    )
  })
})
