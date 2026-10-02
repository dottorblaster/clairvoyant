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
}

/**
 * Replay the archive for the indexed collections, then follow the live tail,
 * persisting the cursor through the projector after every event. On a stream
 * failure it classifies the error and backs off; on repeated failure the caller
 * can abort via `signal`.
 *
 * Every dependency is injected so the loop can be driven in tests with a fake
 * stream, a fake clock and a fake exit.
 */
export const runIndexer = async (runtime: IndexerRuntime): Promise<void> => {
  const { env, log, store, jetstream, fetchTip, sleep, exit, signal } = runtime
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
      for await (const event of replayRecords(jetstream, {
        collections: INDEXED_COLLECTIONS,
        afterSeq: seq,
      })) {
        if (signal.aborted) break

        // Low-cardinality attributes are reused for the metric; the span also
        // carries the sequence, which is too high-cardinality for a metric.
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
        } catch (error) {
          eventsFailed.add(1, attributes)
          throw error
        }

        seq = event.seq
        backoff = BASE_BACKOFF_MS
      }

      if (signal.aborted) break
      // A live replay should not normally end; if it does, reconnect from the
      // cursor so we do not re-index already-processed history.
      log.warn('replay stream ended; reconnecting from cursor', { seq })
      await sleep(BASE_BACKOFF_MS)
    } catch (error) {
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

  // Optional: a no-op unless OTEL_EXPORTER_OTLP_ENDPOINT is set.
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
    })
  } finally {
    await closeDb(db)
    // Flush spans and metrics before the process goes away.
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
