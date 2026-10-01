import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { buildClientMetadata } from '../../dist/oauth/metadata.js'
import { cookieFor, createFakeLogger, createTestApp, testEnv } from '../../dist/testing/fakes.js'

const setCookies = (response: Response): string[] => {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] }
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie()
  const single = response.headers.get('set-cookie')
  return single ? [single] : []
}

const cookieNamed = (response: Response, name: string): string | undefined =>
  setCookies(response).find((cookie) => cookie.startsWith(`${name}=`))

describe('GET /oauth/client-metadata.json', () => {
  test('serves the client metadata for the configured mode', async () => {
    const { app, env } = createTestApp()
    const response = await app.request('/oauth/client-metadata.json')

    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), buildClientMetadata(env))
  })
})

describe('GET /oauth/jwks.json', () => {
  test('publishes an empty keyset for a public DPoP client', async () => {
    const { app } = createTestApp()
    const response = await app.request('/oauth/jwks.json')

    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { keys: [] })
  })
})

describe('GET /oauth/login', () => {
  test('requires a handle', async () => {
    const { app } = createTestApp()
    const response = await app.request('/oauth/login')

    assert.equal(response.status, 400)
    assert.deepEqual(await response.json(), {
      error: 'invalid_request',
      message: 'handle query parameter is required',
    })
  })

  test('redirects to the authorize URL from the OAuth client', async () => {
    const { app } = createTestApp()
    const response = await app.request('/oauth/login?handle=alice.test')

    assert.equal(response.status, 302)
    assert.equal(
      response.headers.get('location'),
      'https://pds.example/oauth/authorize?client_id=x',
    )
  })

  test('remembers a safe relative return path in a short-lived cookie', async () => {
    const { app } = createTestApp()
    const response = await app.request('/oauth/login?handle=alice.test&return_to=%2Fevents%2Fabc')

    const cookie = cookieNamed(response, 'oauth_return_to')
    assert.ok(cookie)
    assert.match(cookie, /oauth_return_to=%2Fevents%2Fabc/)
    assert.match(cookie, /HttpOnly/)
    assert.match(cookie, /Max-Age=600/)
  })

  test('ignores an unsafe return path, so this cannot be an open redirect', async () => {
    const { app } = createTestApp()

    for (const returnTo of ['//evil.example', 'https://evil.example', 'javascript:alert(1)']) {
      const response = await app.request(
        `/oauth/login?handle=alice.test&return_to=${encodeURIComponent(returnTo)}`,
      )
      assert.equal(
        cookieNamed(response, 'oauth_return_to'),
        undefined,
        `set cookie for ${returnTo}`,
      )
    }
  })
})

describe('GET /oauth/callback', () => {
  test('sets the session cookie and redirects to the web origin', async () => {
    const { app, env } = createTestApp()
    const response = await app.request('/oauth/callback?code=abc&state=state')

    assert.equal(response.status, 302)
    assert.equal(response.headers.get('location'), `${env.WEB_ORIGIN}/events`)

    const cookie = cookieNamed(response, env.COOKIE_NAME)
    assert.ok(cookie)
    assert.match(cookie, /HttpOnly/)
    assert.match(cookie, /SameSite=Lax/)
    assert.match(cookie, /Path=\//)
    assert.match(cookie, /Max-Age=2592000/)
    assert.doesNotMatch(cookie, /Secure/)
  })

  test('honours a remembered return path', async () => {
    const { app, env } = createTestApp()
    const response = await app.request('/oauth/callback?code=abc&state=state', {
      headers: { Cookie: 'oauth_return_to=/events/abc' },
    })

    assert.equal(response.headers.get('location'), `${env.WEB_ORIGIN}/events/abc`)
  })

  test('marks the cookie Secure in production', async () => {
    const { app, env } = createTestApp({ env: testEnv({ NODE_ENV: 'production' }) })
    const response = await app.request('/oauth/callback?code=abc&state=state')

    const cookie = cookieNamed(response, env.COOKIE_NAME)
    assert.ok(cookie)
    assert.match(cookie, /Secure/)
  })

  test('returns a logged 400 when the exchange fails', async () => {
    const fakeLog = createFakeLogger()
    const { app } = createTestApp({
      log: fakeLog.logger,
      oauth: {
        callback: async () => {
          throw new Error('bad state')
        },
      },
    })

    const response = await app.request('/oauth/callback?code=abc&state=state')

    assert.equal(response.status, 400)
    assert.deepEqual(await response.json(), { error: 'oauth_callback_failed' })
    assert.ok(fakeLog.entries.some((entry) => entry.message === 'OAuth callback failed'))
  })
})

describe('POST /oauth/logout', () => {
  test('revokes the session and clears the cookie', async () => {
    const revoked: string[] = []
    const { app, env } = createTestApp({
      oauth: {
        revoke: async (did: string) => {
          revoked.push(did)
        },
      },
    })

    const response = await app.request('/oauth/logout', {
      method: 'POST',
      headers: cookieFor(env, 'did:plc:viewer'),
    })

    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { ok: true })
    assert.deepEqual(revoked, ['did:plc:viewer'])
    assert.ok(cookieNamed(response, env.COOKIE_NAME))
  })

  test('succeeds without a session and does not call revoke', async () => {
    const revoked: string[] = []
    const { app } = createTestApp({
      oauth: {
        revoke: async (did: string) => {
          revoked.push(did)
        },
      },
    })

    const response = await app.request('/oauth/logout', { method: 'POST' })

    assert.equal(response.status, 200)
    assert.deepEqual(revoked, [])
  })

  test('still clears the cookie when revocation fails', async () => {
    const fakeLog = createFakeLogger()
    const { app, env } = createTestApp({
      log: fakeLog.logger,
      oauth: {
        revoke: async () => {
          throw new Error('pds down')
        },
      },
    })

    const response = await app.request('/oauth/logout', {
      method: 'POST',
      headers: cookieFor(env),
    })

    assert.equal(response.status, 200)
    assert.ok(cookieNamed(response, env.COOKIE_NAME))
    assert.ok(fakeLog.entries.some((entry) => entry.message === 'failed to revoke OAuth session'))
  })
})
