import type { OAuthClientMetadataInput } from '@atproto/oauth-client-node'
import type { Env } from '../env.js'

export const OAUTH_SCOPE =
  'atproto repo:community.lexicon.calendar.event repo:community.lexicon.calendar.rsvp'

const requirePublicUrl = (env: Env): string => {
  if (!env.PUBLIC_URL) throw new Error('PUBLIC_URL is required when OAUTH_MODE=web')
  return env.PUBLIC_URL.replace(/\/+$/, '')
}

export const getRedirectUri = (env: Env): string =>
  env.OAUTH_MODE === 'loopback'
    ? `http://127.0.0.1:${env.PORT}/oauth/callback`
    : `${requirePublicUrl(env)}/oauth/callback`

/**
 * The atproto OAuth "loopback" client encodes its redirect URI and scope into a
 * synthetic `http://localhost` client_id, so no HTTPS metadata document is
 * needed during local development.
 */
export const getClientId = (env: Env): string => {
  if (env.OAUTH_MODE === 'loopback') {
    const params = new URLSearchParams({
      redirect_uri: getRedirectUri(env),
      scope: OAUTH_SCOPE,
    })
    return `http://localhost?${params.toString()}`
  }
  return `${requirePublicUrl(env)}/oauth/client-metadata.json`
}

export const buildClientMetadata = (env: Env): OAuthClientMetadataInput => ({
  client_id: getClientId(env),
  client_name: 'Clairvoyant',
  client_uri:
    env.OAUTH_MODE === 'loopback' ? `http://localhost:${env.PORT}` : requirePublicUrl(env),
  redirect_uris: [getRedirectUri(env)],
  scope: OAUTH_SCOPE,
  grant_types: ['authorization_code', 'refresh_token'],
  response_types: ['code'],
  application_type: 'web',
  token_endpoint_auth_method: 'none',
  dpop_bound_access_tokens: true,
})
