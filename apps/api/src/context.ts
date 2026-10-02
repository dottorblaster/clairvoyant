import type { Env } from './env.js'
import type { Logger } from './logger.js'
import type { OAuthClient } from './oauth/client.js'
import type { PdsPort } from './pds.js'
import type { RateLimiters } from './rate-limit.js'
import type { Store } from './store.js'

/** Small IOC container */
export interface AppDeps {
  env: Env
  oauth: OAuthClient
  store: Store
  pds: PdsPort
  log: Logger
  /** Per-account rate limiters for the PDS-writing endpoints. */
  limits: RateLimiters
}

export interface AppVariables {
  deps: AppDeps
  did: string | null
}

export type HonoEnv = { Variables: AppVariables }
