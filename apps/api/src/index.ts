import { closeDb, createDb } from '@clairvoyant/db'
import { serve } from '@hono/node-server'
import { createApp } from './app.js'
import { loadEnv } from './env.js'
import { createLogger } from './logger.js'
import { createOAuthClient } from './oauth/client.js'

const main = async (): Promise<void> => {
  const env = loadEnv()
  const log = createLogger(env.LOG_LEVEL, { app: 'api' })

  const db = createDb({ connectionString: env.DATABASE_URL })
  const oauth = createOAuthClient(env, db)
  const app = createApp({ env, db, oauth, log })

  const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
    log.info('api listening', { port: info.port, oauthMode: env.OAUTH_MODE })
  })

  let shuttingDown = false
  const shutdown = (signal: string): void => {
    if (shuttingDown) return
    shuttingDown = true
    log.info('shutdown requested', { signal })

    server.close((error) => {
      if (error) log.error('error closing http server', { err: error })
      closeDb(db)
        .then(() => {
          const exitCode = error ? 1 : 0
          log.info('api stopped')
          process.exit(exitCode)
        })
        .catch((closeError: unknown) => {
          log.error('error closing database', { err: closeError })
          process.exit(1)
        })
    })
  }

  process.once('SIGINT', () => shutdown('SIGINT'))
  process.once('SIGTERM', () => shutdown('SIGTERM'))
}

main().catch((error: unknown) => {
  const log = createLogger('error', { app: 'api' })
  log.error('fatal api error', { err: error })
  process.exit(1)
})
