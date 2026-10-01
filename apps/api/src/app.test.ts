import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import type { Store } from '../dist/store.js'
import { createFakeLogger, createFakeStore, createTestApp } from '../dist/testing/fakes.js'

describe('createApp', () => {
  test('serves a health check', async () => {
    const { app } = createTestApp()
    const response = await app.request('/health')

    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { ok: true })
  })

  test('returns a JSON 404 for unknown paths', async () => {
    const { app } = createTestApp()
    const response = await app.request('/nope')

    assert.equal(response.status, 404)
    assert.deepEqual(await response.json(), { error: 'not_found' })
  })

  test('turns an unhandled handler error into a logged JSON 500', async () => {
    const { store } = createFakeStore()
    const throwing: Store = {
      ...store,
      listDiscoverEvents: async () => {
        throw new Error('kaboom')
      },
    }
    const fakeLog = createFakeLogger()
    const { app } = createTestApp({ store: throwing, log: fakeLog.logger })

    const response = await app.request('/api/events')

    assert.equal(response.status, 500)
    assert.deepEqual(await response.json(), { error: 'internal_server_error' })
    assert.ok(
      fakeLog.entries.some(
        (entry) =>
          entry.level === 'error' &&
          entry.message === 'unhandled request error' &&
          entry.meta?.path === '/api/events',
      ),
    )
  })

  test('treats a malformed session cookie as unauthenticated', async () => {
    const { app, env } = createTestApp()
    const response = await app.request('/api/me', {
      headers: { Cookie: `${env.COOKIE_NAME}=garbage` },
    })

    assert.equal(response.status, 401)
  })
})
