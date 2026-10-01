import { closeDb, createDb, type DB } from '@clairvoyant/db'
import { serve } from '@hono/node-server'
import type { Kysely } from 'kysely'
import { createApp } from './app.js'
import type { AppDeps } from './context.js'
import { type Env, loadEnv } from './env.js'
import { createLogger, type Logger } from './logger.js'
import { createOAuthClient } from './oauth/client.js'
import { createPdsPort } from './pds.js'
import { createDbStore } from './store.js'

export interface Runtime {
  env: Env
  log: Logger
  db: Kysely<DB>
  deps: AppDeps
}

/** Wire the production dependencies from the environment. */
export const createRuntime = (env: Env = loadEnv()): Runtime => {
  const log = createLogger(env.LOG_LEVEL, { app: 'api' })
  const db = createDb({ connectionString: env.DATABASE_URL })
  const oauth = createOAuthClient(env, db)

  return {
    env,
    log,
    db,
    deps: { env, oauth, store: createDbStore(db), pds: createPdsPort(oauth), log },
  }
}

export interface ClosableServer {
  close(callback: (error?: Error) => void): void
}

/**
 * Build the graceful-shutdown handler. Kept separate from `process.once` so a
 * test can invoke it with a fake server/db/exit and no real signals.
 */
export const createShutdown = (
  server: ClosableServer,
  db: Kysely<DB>,
  log: Logger,
  exit: (code: number) => void,
): ((signal: string) => void) => {
  let shuttingDown = false

  return (signal: string) => {
    if (shuttingDown) return
    shuttingDown = true
    log.info('shutdown requested', { signal })

    server.close((error) => {
      if (error) log.error('error closing http server', { err: error })
      closeDb(db)
        .then(() => {
          log.info('api stopped')
          exit(error ? 1 : 0)
        })
        .catch((closeError: unknown) => {
          log.error('error closing database', { err: closeError })
          exit(1)
        })
    })
  }
}

const main = async (): Promise<void> => {
  const runtime = createRuntime()
  const app = createApp(runtime.deps)

  const server = serve({ fetch: app.fetch, port: runtime.env.PORT }, (info) => {
    runtime.log.info('api listening', { port: info.port, oauthMode: runtime.env.OAUTH_MODE })
  })

  const shutdown = createShutdown(server, runtime.db, runtime.log, (code) => process.exit(code))
  process.once('SIGINT', () => shutdown('SIGINT'))
  process.once('SIGTERM', () => shutdown('SIGTERM'))
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    const log = createLogger('error', { app: 'api' })
    log.error('fatal api error', { err: error })
    process.exit(1)
  })
}
