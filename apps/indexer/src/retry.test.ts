import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  BASE_BACKOFF_MS,
  classifyError,
  decideOnFailure,
  getRetryAfter,
  MAX_BACKOFF_MS,
  nextBackoffMs,
} from '../dist/retry.js'

describe('getRetryAfter', () => {
  test('reads whole seconds', () => {
    assert.equal(getRetryAfter('2'), 2_000)
    assert.equal(getRetryAfter('0'), 0)
  })

  test('reads an HTTP-date relative to now', () => {
    const future = new Date(Date.now() + 5_000).toUTCString()
    const ms = getRetryAfter(future)
    assert.ok(ms !== undefined && ms >= 0 && ms <= 6_000, `unexpected ${ms}`)
  })

  test('clamps a past date to zero', () => {
    assert.equal(getRetryAfter(new Date(Date.now() - 60_000).toUTCString()), 0)
  })

  test('returns undefined for missing or unparseable values', () => {
    assert.equal(getRetryAfter(null), undefined)
    assert.equal(getRetryAfter(''), undefined)
    assert.equal(getRetryAfter('later'), undefined)
  })
})

describe('classifyError', () => {
  test('returns nothing useful for a primitive', () => {
    assert.deepEqual(classifyError('boom'), {})
    assert.deepEqual(classifyError(null), {})
  })

  test('reads a top-level status', () => {
    assert.deepEqual(classifyError({ status: 401 }), { status: 401 })
  })

  test('falls back to response.status', () => {
    assert.deepEqual(classifyError({ response: { status: 429 } }), { status: 429 })
  })

  test('ignores a non-numeric status', () => {
    assert.deepEqual(classifyError({ status: '401' }), { status: undefined })
  })

  test('reads Retry-After from response.headers.get', () => {
    const error = {
      response: {
        status: 429,
        headers: { get: (name: string) => (name === 'retry-after' ? '3' : null) },
      },
    }
    assert.deepEqual(classifyError(error), { status: 429, retryAfterMs: 3_000 })
  })

  test('ignores a headers object without a get function', () => {
    assert.deepEqual(classifyError({ response: { status: 429, headers: {} } }), { status: 429 })
  })
})

describe('nextBackoffMs', () => {
  test('doubles', () => {
    assert.equal(nextBackoffMs(1_000), 2_000)
  })

  test('caps at the maximum', () => {
    assert.equal(nextBackoffMs(40_000), MAX_BACKOFF_MS)
    assert.equal(nextBackoffMs(MAX_BACKOFF_MS), MAX_BACKOFF_MS)
  })
})

describe('decideOnFailure', () => {
  test('a 401 is fatal', () => {
    assert.deepEqual(decideOnFailure({ status: 401 }, BASE_BACKOFF_MS), {
      action: 'fatal',
      status: 401,
    })
  })

  test('a 429 honours Retry-After', () => {
    const decision = decideOnFailure(
      { response: { status: 429, headers: { get: () => '5' } } },
      BASE_BACKOFF_MS,
    )
    assert.deepEqual(decision, {
      action: 'wait',
      waitMs: 5_000,
      nextBackoffMs: 2_000,
      rateLimited: true,
    })
  })

  test('a 429 without Retry-After waits the current backoff', () => {
    const decision = decideOnFailure({ status: 429 }, BASE_BACKOFF_MS)
    assert.equal(decision.action, 'wait')
    if (decision.action === 'wait') {
      assert.equal(decision.waitMs, BASE_BACKOFF_MS)
      assert.equal(decision.rateLimited, true)
    }
  })

  test('any other failure backs off exponentially', () => {
    const decision = decideOnFailure(new Error('socket reset'), 4_000)
    assert.deepEqual(decision, {
      action: 'wait',
      waitMs: 4_000,
      nextBackoffMs: 8_000,
      rateLimited: false,
    })
  })
})
