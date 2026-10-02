import type { MiddlewareHandler } from 'hono'
import type { HonoEnv } from './context.js'

export const RATE_LIMIT_BUCKETS = ['createEvent', 'createInvite', 'rsvp'] as const

export type RateLimitBucket = (typeof RATE_LIMIT_BUCKETS)[number]

export interface RateLimitConfig {
  limit: number
  windowMs: number
}

export const RATE_LIMITS: Record<RateLimitBucket, RateLimitConfig> = {
  createEvent: { limit: 10, windowMs: 10 * 60_000 },
  createInvite: { limit: 30, windowMs: 10 * 60_000 },
  rsvp: { limit: 30, windowMs: 10 * 60_000 },
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAfter: number
}

export interface RateLimiter extends RateLimitConfig {
  check(key: string): RateLimitResult
}

export interface FixedWindowOptions extends RateLimitConfig {
  now?: () => number
  maxKeys?: number
}

export const createFixedWindowLimiter = (options: FixedWindowOptions): RateLimiter => {
  const limit = Math.max(1, Math.floor(options.limit))
  const windowMs = Math.max(1, Math.floor(options.windowMs))
  const now = options.now ?? Date.now
  const maxKeys = options.maxKeys ?? 10_000
  const windows = new Map<string, { start: number; count: number }>()

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
