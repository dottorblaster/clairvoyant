import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { loadEnv } from '../dist/env.js'

const SECRET = 'a'.repeat(32)

const required = { DATABASE_URL: 'postgres://user:pass@127.0.0.1:5432/app', COOKIE_SECRET: SECRET }

describe('loadEnv defaults', () => {
  test('fills in every optional value', () => {
    const env = loadEnv(required)
    assert.equal(env.NODE_ENV, 'development')
    assert.equal(env.PORT, 3000)
    assert.equal(env.OAUTH_MODE, 'loopback')
    assert.equal(env.WEB_ORIGIN, 'http://127.0.0.1:5173')
    assert.equal(env.COOKIE_NAME, 'clairvoyant_session')
    assert.equal(env.LOG_LEVEL, 'info')
    assert.equal(env.PUBLIC_URL, undefined)
  })

  test('coerces PORT from a string', () => {
    assert.equal(loadEnv({ ...required, PORT: '8080' }).PORT, 8080)
  })
})

describe('loadEnv required values', () => {
  test('requires DATABASE_URL', () => {
    assert.throws(() => loadEnv({ COOKIE_SECRET: SECRET }), /DATABASE_URL/)
  })

  test('requires COOKIE_SECRET of at least 32 characters', () => {
    assert.throws(
      () => loadEnv({ DATABASE_URL: 'postgres://x', COOKIE_SECRET: 'short' }),
      /COOKIE_SECRET/,
    )
  })

  test('rejects an invalid NODE_ENV', () => {
    assert.throws(() => loadEnv({ ...required, NODE_ENV: 'staging' }), /NODE_ENV/)
  })

  test('formats issues with their path', () => {
    assert.throws(
      () => loadEnv({}),
      (error: unknown) => {
        assert.ok(error instanceof Error)
        assert.match(error.message, /Invalid api environment/)
        assert.match(error.message, /DATABASE_URL/)
        return true
      },
    )
  })
})

describe('loadEnv OAUTH_MODE=web', () => {
  test('requires PUBLIC_URL', () => {
    assert.throws(() => loadEnv({ ...required, OAUTH_MODE: 'web' }), /PUBLIC_URL/)
  })

  test('accepts a public HTTPS origin and skips the loopback check', () => {
    const env = loadEnv({
      ...required,
      OAUTH_MODE: 'web',
      PUBLIC_URL: 'https://api.example.com',
      WEB_ORIGIN: 'https://app.example.com',
    })
    assert.equal(env.OAUTH_MODE, 'web')
    assert.equal(env.PUBLIC_URL, 'https://api.example.com')
  })
})

describe('loadEnv OAUTH_MODE=loopback', () => {
  test('accepts 127.0.0.1 and IPv6 loopback', () => {
    assert.equal(
      loadEnv({ ...required, WEB_ORIGIN: 'http://127.0.0.1:5173' }).WEB_ORIGIN,
      'http://127.0.0.1:5173',
    )
    assert.equal(
      loadEnv({ ...required, WEB_ORIGIN: 'http://[::1]:5173' }).WEB_ORIGIN,
      'http://[::1]:5173',
    )
  })

  test('rejects localhost, because cookies are host-scoped', () => {
    assert.throws(
      () => loadEnv({ ...required, WEB_ORIGIN: 'http://localhost:5173' }),
      /loopback host/,
    )
  })

  test('rejects a routable host', () => {
    assert.throws(
      () => loadEnv({ ...required, WEB_ORIGIN: 'https://app.example.com' }),
      /loopback host/,
    )
  })

  test('rejects a malformed WEB_ORIGIN as a url', () => {
    assert.throws(() => loadEnv({ ...required, WEB_ORIGIN: 'not a url' }), /WEB_ORIGIN/)
  })
})
