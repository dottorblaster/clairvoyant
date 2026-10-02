import { httpInstrumentationMiddleware } from '@hono/otel'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { getCookie } from 'hono/cookie'
import type { AppDeps, HonoEnv } from './context.js'
import { apiRoutes } from './routes/api.js'
import { oauthRoutes } from './routes/oauth.js'
import { createSecurityHeaders } from './security-headers.js'
import { parseSession } from './session-cookie.js'

/**
 * Every request body this API accepts is a small JSON document (the largest is
 * a 2000-character event description), so anything above this is rejected up
 * front rather than parsed. Checked against `Content-Length` when present and
 * by streaming when it is not.
 */
export const MAX_BODY_BYTES = 32 * 1024

const READINESS_TIMEOUT_MS = 2_000

const withTimeout = async (promise: Promise<void>, ms: number): Promise<void> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('readiness check timed out')), ms)
      }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

export const createApp = (deps: AppDeps): Hono<HonoEnv> => {
  const app = new Hono<HonoEnv>()

  // One server span plus `http.server.request.duration` per request, with the
  // Hono route pattern as `http.route`. A no-op unless a tracer provider is
  // registered, so this is safe to mount unconditionally.
  app.use(httpInstrumentationMiddleware())

  app.use('*', createSecurityHeaders(deps.env))

  app.use(
    '*',
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) =>
        c.json(
          {
            error: 'payload_too_large',
            message: `Request body must be at most ${MAX_BODY_BYTES} bytes`,
          },
          413,
        ),
    }),
  )

  // Dependencies are injected per-request rather than kept in module state.
  app.use('*', async (c, next) => {
    c.set('deps', deps)
    await next()
  })

  // Resolve the signed session cookie (DID only) into `c.get('did')`.
  app.use('*', async (c, next) => {
    const cookie = getCookie(c, deps.env.COOKIE_NAME)
    c.set('did', parseSession(deps.env.COOKIE_SECRET, cookie))
    await next()
  })

  app.get('/health', (c) => c.json({ ok: true }))

  app.get('/ready', async (c) => {
    try {
      await withTimeout(deps.store.ping(), READINESS_TIMEOUT_MS)
      return c.json({ ok: true, checks: { db: 'up' } })
    } catch (error) {
      deps.log.error('readiness check failed', { err: error })
      return c.json({ ok: false, checks: { db: 'down' } }, 503)
    }
  })

  app.route('/oauth', oauthRoutes)
  app.route('/api', apiRoutes)

  app.notFound((c) => c.json({ error: 'not_found' }, 404))

  app.onError((error, c) => {
    deps.log.error('unhandled request error', { err: error, path: c.req.path })
    return c.json({ error: 'internal_server_error' }, 500)
  })

  return app
}
