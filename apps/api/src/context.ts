import type { DB } from '@clairvoyant/db'
import type { Kysely } from 'kysely'
import type { Env } from './env.js'
import type { Logger } from './logger.js'
import type { OAuthClient } from './oauth/client.js'

/** Small IOC container */
export interface AppDeps {
  env: Env
  db: Kysely<DB>
  oauth: OAuthClient
  log: Logger
}

export interface AppVariables {
  deps: AppDeps
  did: string | null
}

export type HonoEnv = { Variables: AppVariables }
