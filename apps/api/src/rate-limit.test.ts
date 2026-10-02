import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createFixedWindowLimiter, createRateLimiters, RATE_LIMITS } from '../dist/rate-limit.js'

/** A controllable clock so window behaviour is tested without sleeping. */
const clock = (start = 1_000): { now: () => number; advance: (ms: number) => void } => {
  let current = start
  return { now: () => current, advance: (ms) => (current += ms) }
}

describe('createFixedWindowLimiter', () => {
  test('allows exactly `limit` requests and counts down the remainder', () => {
    const limiter = createFixedWindowLimiter({ limit: 3, windowMs: 1_000 })

    assert.deepEqual(limiter.check('did:a'), { allowed: true, remaining: 2, resetAfter: 1 })
    assert.deepEqual(limiter.check('did:a'), { allowed: true, remaining: 1, resetAfter: 1 })
    assert.deepEqual(limiter.check('did:a'), { allowed: true, remaining: 0, resetAfter: 1 })
  })

  test('blocks the request after the limit, without incrementing further', () => {
    const limiter = createFixedWindowLimiter({ limit: 1, windowMs: 60_000 })

    assert.equal(limiter.check('did:a').allowed, true)
    // Blocked repeatedly for the rest of the window rather than sliding.
    for (let i = 0; i < 3; i += 1) {
      const blocked = limiter.check('did:a')
      assert.equal(blocked.allowed, false)
      assert.equal(blocked.remaining, 0)
      assert.equal(blocked.resetAfter, 60)
    }
  })

  test('opens a new window once the previous one has elapsed', () => {
    const time = clock()
    const limiter = createFixedWindowLimiter({ limit: 1, windowMs: 1_000, now: time.now })

    assert.equal(limiter.check('did:a').allowed, true)
    assert.equal(limiter.check('did:a').allowed, false)

    time.advance(999)
    assert.equal(limiter.check('did:a').allowed, false)

    time.advance(1)
    assert.deepEqual(limiter.check('did:a'), { allowed: true, remaining: 0, resetAfter: 1 })
  })

  test('does not extend the window when a blocked key keeps knocking', () => {
    const time = clock()
    const limiter = createFixedWindowLimiter({ limit: 1, windowMs: 1_000, now: time.now })

    limiter.check('did:a')
    time.advance(500)
    assert.equal(limiter.check('did:a').resetAfter, 1) // window ends at t=1000, not t=1500
    time.advance(500)
    assert.equal(limiter.check('did:a').allowed, true)
  })

  test('tracks each key independently', () => {
    const limiter = createFixedWindowLimiter({ limit: 1, windowMs: 1_000 })

    assert.equal(limiter.check('did:a').allowed, true)
    assert.equal(limiter.check('did:a').allowed, false)
    assert.equal(limiter.check('did:b').allowed, true)
  })

  test('sweeps expired keys once the soft cap is reached', () => {
    const time = clock()
    const limiter = createFixedWindowLimiter({
      limit: 5,
      windowMs: 1_000,
      now: time.now,
      maxKeys: 2,
    })

    limiter.check('did:a')
    limiter.check('did:b')
    time.advance(1_000) // both windows are now expired

    // Room for a third key exists only because the sweep removed the stale two.
    assert.equal(limiter.check('did:c').allowed, true)
    // `did:a` was swept, so it starts a fresh window rather than staying blocked.
    assert.equal(limiter.check('did:a').allowed, true)
  })

  test('clamps a non-positive limit to one', () => {
    const limiter = createFixedWindowLimiter({ limit: 0, windowMs: 1_000 })
    assert.equal(limiter.limit, 1)
    assert.equal(limiter.check('did:a').allowed, true)
    assert.equal(limiter.check('did:a').allowed, false)
  })
})

describe('createRateLimiters', () => {
  test('builds one limiter per bucket from the shared defaults', () => {
    const limits = createRateLimiters()

    assert.deepEqual(Object.keys(limits).sort(), ['createEvent', 'createInvite', 'rsvp'])
    assert.equal(limits.createEvent.limit, RATE_LIMITS.createEvent.limit)
    assert.equal(limits.createInvite.windowMs, RATE_LIMITS.createInvite.windowMs)
    assert.equal(limits.rsvp.limit, RATE_LIMITS.rsvp.limit)
  })

  test('applies per-bucket overrides and shares one clock across buckets', () => {
    const time = clock()
    const limits = createRateLimiters(time.now, { createEvent: { limit: 1, windowMs: 1_000 } })

    assert.equal(limits.createEvent.limit, 1)
    assert.equal(limits.createEvent.check('did:a').allowed, true)
    assert.equal(limits.createEvent.check('did:a').allowed, false)

    // Same clock, separate bucket, so it is untouched by the exhausted one.
    assert.equal(limits.rsvp.check('did:a').allowed, true)

    time.advance(1_000)
    assert.equal(limits.createEvent.check('did:a').allowed, true)
  })
})
