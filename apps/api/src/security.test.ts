import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createFakeStore, createTestApp, testEnv } from '../dist/testing/fakes.js'

describe('security headers', () => {
  test('sets the baseline hardening headers', async () => {
    const { app } = createTestApp()
    const response = await app.request('/health')

    assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer')
    assert.equal(response.headers.get('x-frame-options'), 'DENY')
    assert.equal(response.headers.get('cross-origin-resource-policy'), 'same-origin')
    assert.equal(
      response.headers.get('content-security-policy'),
      "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    )
  })

  test('omits HSTS outside production', async () => {
    const { app } = createTestApp()
    const response = await app.request('/health')

    assert.equal(response.headers.get('strict-transport-security'), null)
  })

  test('sets HSTS in production', async () => {
    const { app } = createTestApp({ env: testEnv({ NODE_ENV: 'production' }) })
    const response = await app.request('/health')

    assert.equal(
      response.headers.get('strict-transport-security'),
      'max-age=31536000; includeSubDomains',
    )
  })
})

describe('GET /ready', () => {
  test('reports ready when the database responds', async () => {
    const { app } = createTestApp()
    const response = await app.request('/ready')

    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { ok: true, checks: { db: 'up' } })
  })

  test('reports 503 when the database fails', async () => {
    const { store } = createFakeStore({ failPing: new Error('down') })
    const { app } = createTestApp({ store })
    const response = await app.request('/ready')

    assert.equal(response.status, 503)
    assert.deepEqual(await response.json(), { ok: false, checks: { db: 'down' } })
  })
})
