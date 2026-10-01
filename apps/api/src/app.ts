import { Hono } from 'hono'
import { getCookie } from 'hono/cookie'
import type { AppDeps, HonoEnv } from './context.js'
import { apiRoutes } from './routes/api.js'
import { oauthRoutes } from './routes/oauth.js'
import { parseSession } from './session-cookie.js'

export const createApp = (deps: AppDeps): Hono<HonoEnv> => {
  const app = new Hono<HonoEnv>()

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

  app.route('/oauth', oauthRoutes)
  app.route('/api', apiRoutes)

  app.notFound((c) => c.json({ error: 'not_found' }, 404))

  app.onError((error, c) => {
    deps.log.error('unhandled request error', { err: error, path: c.req.path })
    return c.json({ error: 'internal_server_error' }, 500)
  })

  return app
}
