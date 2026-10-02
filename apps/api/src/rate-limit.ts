import type { MiddlewareHandler } from 'hono'
import type { HonoEnv } from './context.js'

/** The mutating endpoints that are rate limited, each with its own bucket. */
export const RATE_LIMIT_BUCKETS = ['createEvent', 'createInvite', 'rsvp'] as const

export type RateLimitBucket = (typeof RATE_LIMIT_BUCKETS)[number]

export interface RateLimitConfig {
  /** Requests allowed per key per window. */
  limit: number
  windowMs: number
}

/**
 * Per-account fixed windows. The limits are generous enough that normal use
 * never notices, but a single account cannot hammer the endpoints that make the
 * API write to a PDS on its behalf.
 */
export const RATE_LIMITS: Record<RateLimitBucket, RateLimitConfig> = {
  createEvent: { limit: 10, windowMs: 10 * 60_000 },
  createInvite: { limit: 30, windowMs: 10 * 60_000 },
  rsvp: { limit: 30, windowMs: 10 * 60_000 },
}

export interface RateLimitResult {
  allowed: boolean
  /** Requests left in the current window. */
  remaining: number
  /** Whole seconds until the current window resets; always `>= 0`. */
  resetAfter: number
}

/**
 * A counter keyed by account. Deliberately small: one instance per bucket, with
 * the clock injected so the window behaviour is testable without sleeping.
 */
export interface RateLimiter extends RateLimitConfig {
  check(key: string): RateLimitResult
}

export interface FixedWindowOptions extends RateLimitConfig {
  /** Milliseconds clock; defaults to `Date.now`. */
  now?: () => number
  /** Soft cap on tracked keys before expired windows are swept. */
  maxKeys?: number
}

/**
 * A fixed-window counter. The window starts on the key's first request and is
 * not extended by later requests, so a burst cannot push the reset out forever.
 */
export const createFixedWindowLimiter = (options: FixedWindowOptions): RateLimiter => {
  const limit = Math.max(1, Math.floor(options.limit))
  const windowMs = Math.max(1, Math.floor(options.windowMs))
  const now = options.now ?? Date.now
  const maxKeys = options.maxKeys ?? 10_000
  const windows = new Map<string, { start: number; count: number }>()

  // An expired window is normally overwritten by the key's next request; this
  // sweep only bounds memory for keys that never come back.
  const sweep = (at: number): void => {
    for (const [key, window] of windows) {
      if (at - window.start >= windowMs) windows.delete(key)
    }
  }

  return {
    limit,
    windowMs,
    check(key) {
      const at = now()
      if (windows.size >= maxKeys) sweep(at)

      const current = windows.get(key)
      if (current === undefined || at - current.start >= windowMs) {
        windows.set(key, { start: at, count: 1 })
        return { allowed: true, remaining: limit - 1, resetAfter: Math.ceil(windowMs / 1_000) }
      }

      const resetAfter = Math.max(0, Math.ceil((current.start + windowMs - at) / 1_000))
      if (current.count >= limit) return { allowed: false, remaining: 0, resetAfter }

      current.count += 1
      return { allowed: true, remaining: limit - current.count, resetAfter }
    },
  }
}

export type RateLimiters = Record<RateLimitBucket, RateLimiter>

/**
 * Build one limiter per bucket, all sharing a clock. `overrides` exists so tests
 * can shrink a window instead of making `RATE_LIMITS[bucket].limit + 1` requests.
 */
export const createRateLimiters = (
  now: () => number = Date.now,
  overrides: Partial<Record<RateLimitBucket, Partial<RateLimitConfig>>> = {},
): RateLimiters => {
  const build = (bucket: RateLimitBucket): RateLimiter =>
    createFixedWindowLimiter({ ...RATE_LIMITS[bucket], ...(overrides[bucket] ?? {}), now })

  return {
    createEvent: build('createEvent'),
    createInvite: build('createInvite'),
    rsvp: build('rsvp'),
  }
}

/**
 * Middleware charging one bucket to the signed-in account. A request with no
 * session is left untouched: there is no account to charge yet, and the route
 * answers with its own 401. The limiter comes from the injected deps, so a test
 * can drive its clock.
 */
export const rateLimit =
  (bucket: RateLimitBucket): MiddlewareHandler<HonoEnv> =>
  async (c, next) => {
    const did = c.get('did')
    if (did === null) return next()

    const limiter = c.get('deps').limits[bucket]
    const result = limiter.check(did)

    c.header('RateLimit-Limit', String(limiter.limit))
    c.header('RateLimit-Remaining', String(result.remaining))
    c.header('RateLimit-Reset', String(result.resetAfter))

    if (!result.allowed) {
      c.header('Retry-After', String(result.resetAfter))
      return c.json({ error: 'rate_limited', message: 'Too many requests. Try again later.' }, 429)
    }

    await next()
  }
