import { closeDb, createDb } from '@clairvoyant/db'
import { INDEXED_COLLECTIONS } from '@clairvoyant/lexicons'
import {
  type Attributes,
  getMeter,
  shutdownTelemetry,
  startTelemetry,
  withSpan,
} from '@clairvoyant/telemetry'
import { type Env, loadEnv } from './env.js'
import { createProjector } from './handlers.js'
import {
  closeHealthServer,
  createIndexerHealth,
  type IndexerHealthReporter,
  startHealthServer,
} from './health.js'
import {
  createJetstreamClient,
  fetchSealedTipSeq,
  type JetstreamClient,
  replayRecords,
} from './jetstream.js'
import { createLogger, type Logger } from './logger.js'
import { BASE_BACKOFF_MS, decideOnFailure } from './retry.js'
import { createKyselyProjectorStore, type ProjectorStore } from './store.js'

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

export interface IndexerRuntime {
  env: Env
  log: Logger
  store: ProjectorStore
  jetstream: JetstreamClient
  fetchTip: () => Promise<number>
  sleep: (ms: number) => Promise<void>
  exit: (code: number) => void
  signal: AbortSignal
  health?: IndexerHealthReporter
}

export const runIndexer = async (runtime: IndexerRuntime): Promise<void> => {
  const { env, log, store, jetstream, fetchTip, sleep, exit, signal, health } = runtime
  const handleEvent = createProjector({ store, log })

  const meter = getMeter()
  const eventsProcessed = meter.createCounter('clairvoyant.indexer.events')
  const eventsFailed = meter.createCounter('clairvoyant.indexer.failures')

  const cursorSeq = await store.readCursor()
  const startSeq =
    cursorSeq > 0
      ? cursorSeq
      : env.INDEXER_START_SEQ === 'latest'
        ? await fetchTip()
        : env.INDEXER_START_SEQ

  log.info('indexer starting', {
    service: env.JETSTREAM_URL,
    collections: [...INDEXED_COLLECTIONS],
    cursorSeq,
    startSeq,
  })

  let seq = startSeq
  let backoff = BASE_BACKOFF_MS

  while (!signal.aborted) {
    try {
      health?.markConnected()
      for await (const event of replayRecords(jetstream, {
        collections: INDEXED_COLLECTIONS,
        afterSeq: seq,
      })) {
        if (signal.aborted) break

        const attributes: Attributes = { 'jetstream.kind': event.kind }
        if (event.kind === 'commit') {
          attributes['atproto.collection'] = event.commit.collection
          attributes['atproto.operation'] = event.commit.operation
        }

        try {
          await withSpan('jetstream.event', () => handleEvent(event), {
            ...attributes,
            'jetstream.seq': event.seq,
          })
          eventsProcessed.add(1, attributes)
          health?.markEvent(event.seq)
        } catch (error) {
          eventsFailed.add(1, attributes)
          throw error
        }

        seq = event.seq
        backoff = BASE_BACKOFF_MS
      }

      if (signal.aborted) break
      health?.markDisconnected()
      // Reconnect from the cursor so already-processed history is not re-indexed.
      log.warn('replay stream ended; reconnecting from cursor', { seq })
      await sleep(BASE_BACKOFF_MS)
    } catch (error) {
      health?.markDisconnected()
      const decision = decideOnFailure(error, backoff)

      if (decision.action === 'fatal') {
        log.error(
          'Jetstream rejected the request as unauthorized. Check JETSTREAM_API_KEY; ' +
            'the indexer cannot continue without a valid key.',
          { status: decision.status },
        )
        exit(1)
        return
      }

      if (decision.rateLimited) {
        log.warn('rate limited by Jetstream; respecting Retry-After', { waitMs: decision.waitMs })
      } else {
        log.error('Jetstream stream error; backing off', { err: error, waitMs: decision.waitMs })
      }
      await sleep(decision.waitMs)
      backoff = decision.nextBackoffMs
    }
  }

  log.info('indexer stopped', { seq })
}

const main = async (): Promise<void> => {
  const env = loadEnv()
  const log = createLogger(env.LOG_LEVEL, { app: 'indexer' })

  await startTelemetry({ serviceName: 'clairvoyant-indexer' })

  const db = createDb({ connectionString: env.DATABASE_URL })

  const controller = new AbortController()
  let stopping = false
  const requestStop = (signal: string): void => {
    if (stopping) return
    stopping = true
    log.info('shutdown requested', { signal })
    controller.abort()
  }

  process.once('SIGINT', () => requestStop('SIGINT'))
  process.once('SIGTERM', () => requestStop('SIGTERM'))

  const jetstream = createJetstreamClient({
    service: env.JETSTREAM_URL,
    apiKey: env.JETSTREAM_API_KEY,
  })

  const health = env.HEALTH_PORT === undefined ? undefined : createIndexerHealth()
  const healthServer =
    env.HEALTH_PORT === undefined || health === undefined
      ? undefined
      : await startHealthServer({ port: env.HEALTH_PORT, health, log })

  try {
    await runIndexer({
      env,
      log,
      store: createKyselyProjectorStore(db),
      jetstream,
      fetchTip: () =>
        fetchSealedTipSeq({ service: env.JETSTREAM_URL, apiKey: env.JETSTREAM_API_KEY }),
      sleep,
      exit: (code) => process.exit(code),
      signal: controller.signal,
      health,
    })
  } finally {
    if (healthServer !== undefined) await closeHealthServer(healthServer)
    await closeDb(db)
    await shutdownTelemetry()
  }
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    const log: Logger = createLogger('error', { app: 'indexer' })
    log.error('fatal indexer error', { err: error })
    process.exit(1)
  })
}
