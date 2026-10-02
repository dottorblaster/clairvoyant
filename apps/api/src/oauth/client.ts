import { NodeOAuthClient } from '@atproto/oauth-client-node'
import type { DB } from '@clairvoyant/db'
import type { Kysely } from 'kysely'
import type { Env } from '../env.js'
import { buildClientMetadata } from './metadata.js'
import { createOAuthStores } from './store.js'

export { OAUTH_SCOPE } from './metadata.js'

export const createOAuthClient = (env: Env, db: Kysely<DB>): NodeOAuthClient => {
  const { stateStore, sessionStore } = createOAuthStores(db)

  return new NodeOAuthClient({
    clientMetadata: buildClientMetadata(env),
    stateStore,
    sessionStore,
    allowHttp: env.OAUTH_MODE === 'loopback',
  })
}

export type OAuthClient = ReturnType<typeof createOAuthClient>
