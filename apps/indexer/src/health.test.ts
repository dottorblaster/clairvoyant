import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createIndexerHealth, evaluateHealth } from '../dist/health.js'

describe('createIndexerHealth', () => {
  test('starts disconnected with no events', () => {
    const health = createIndexerHealth()

    assert.deepEqual(health.state(), { connected: false, lastSeq: null, lastEventAt: null })
  })

  test('records connection and events', () => {
    const health = createIndexerHealth({ now: () => 1_000 })

    health.markConnected()
    health.markEvent(42)

    assert.deepEqual(health.state(), { connected: true, lastSeq: 42, lastEventAt: 1_000 })

    health.markDisconnected()

    assert.equal(health.state().connected, false)
  })
})

describe('evaluateHealth', () => {
  test('liveness is always ok', () => {
    const result = evaluateHealth(
      '/health',
      { connected: false, lastSeq: null, lastEventAt: null },
      0,
    )

    assert.equal(result.status, 200)
    assert.deepEqual(result.body, { ok: true, connected: false })
  })

  test('readiness requires a connected, fresh stream', () => {
    const state = { connected: true, lastSeq: 7, lastEventAt: 1_000 }

    assert.equal(evaluateHealth('/ready', state, 1_500, 1_000).status, 200)
    assert.equal(evaluateHealth('/ready', state, 3_000, 1_000).status, 503)
    assert.equal(evaluateHealth('/ready', { ...state, connected: false }, 1_500, 1_000).status, 503)
    assert.equal(
      evaluateHealth('/ready', { connected: true, lastSeq: null, lastEventAt: null }, 1_500, 1_000)
        .status,
      503,
    )
  })

  test('unknown paths are 404', () => {
    const state = { connected: true, lastSeq: 1, lastEventAt: 0 }

    assert.equal(evaluateHealth('/nope', state, 0).status, 404)
  })
})
