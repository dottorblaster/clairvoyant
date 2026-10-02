import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { HonoEnv } from '../context.js'
import type { Env } from '../env.js'
import { OAUTH_SCOPE } from '../oauth/client.js'
import { buildClientMetadata } from '../oauth/metadata.js'
import { serializeSession } from '../session-cookie.js'

export const oauthRoutes = new Hono<HonoEnv>()

const secureCookies = (env: Env): boolean => env.COOKIE_SECURE ?? env.NODE_ENV === 'production'

const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30
const RETURN_TO_COOKIE = 'oauth_return_to'

const safeReturnTo = (value: string | undefined): string | null => {
  if (!value?.startsWith('/') || value.startsWith('//')) return null
  return value
}

oauthRoutes.get('/client-metadata.json', (c) => {
  const { env } = c.get('deps')
  const response = buildClientMetadata(env)
  return c.json(response)
})

oauthRoutes.get('/jwks.json', (c) => {
  return c.json({ keys: [] })
})

oauthRoutes.get('/login', async (c) => {
  const deps = c.get('deps')
  const handle = c.req.query('handle')
  if (!handle) {
    return c.json({ error: 'invalid_request', message: 'handle query parameter is required' }, 400)
  }

  const returnTo = safeReturnTo(c.req.query('return_to'))
  if (returnTo) {
    setCookie(c, RETURN_TO_COOKIE, returnTo, {
      httpOnly: true,
      secure: secureCookies(deps.env),
      sameSite: 'Lax',
      path: '/',
      maxAge: 600,
    })
  }

  const url = await deps.oauth.authorize(handle, { scope: OAUTH_SCOPE })
  return c.redirect(url.toString())
})

oauthRoutes.get('/callback', (c) => {
  const deps = c.get('deps')
  const params = new URL(c.req.url).searchParams

  return deps.oauth
    .callback(params)
    .then(({ session }) => {
      setCookie(c, deps.env.COOKIE_NAME, serializeSession(deps.env.COOKIE_SECRET, session.did), {
        httpOnly: true,
        secure: secureCookies(deps.env),
        sameSite: 'Lax',
        path: '/',
        maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
      })

      const returnTo = safeReturnTo(getCookie(c, RETURN_TO_COOKIE))
      deleteCookie(c, RETURN_TO_COOKIE, { path: '/' })

      return c.redirect(`${deps.env.WEB_ORIGIN}${returnTo ?? '/events'}`)
    })
    .catch((error: unknown) => {
      deps.log.error('OAuth callback failed', { err: error })
      return c.json({ error: 'oauth_callback_failed' }, 400)
    })
})

oauthRoutes.post('/logout', async (c) => {
  const deps = c.get('deps')
  const did = c.get('did')

  if (did) {
    await deps.oauth.revoke(did).catch((error: unknown) => {
      deps.log.warn('failed to revoke OAuth session', { did, err: error })
    })
  }

  deleteCookie(c, deps.env.COOKIE_NAME, { path: '/' })
  return c.json({ ok: true })
})
