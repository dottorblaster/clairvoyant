import { closeDb, createDb, readCursor } from '@clairvoyant/db'
import { INDEXED_COLLECTIONS } from '@clairvoyant/lexicons'
import { loadEnv } from './env.js'
import { createProjector } from './handlers.js'
import { createJetstreamClient, fetchSealedTipSeq, replayRecords } from './jetstream.js'
import { createLogger, type Logger } from './logger.js'

const BASE_BACKOFF_MS = 1_000
const MAX_BACKOFF_MS = 60_000

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

interface HttpErrorInfo {
  status?: number
  retryAfterMs?: number
}

interface CandidateError {
  status?: unknown
  headers?: unknown
  response?: {
    status?: unknown
    headers?: { get?: (name: string) => string | null }
  }
}

const getHeader = (name: string, candidate: CandidateError): string | null => {
  const headers = candidate.response?.headers

  if (headers && typeof headers.get === 'function') {
    return headers.get(name)
  }

  return null
}

const getRetryAfter = (retryAfter: string | null): number | undefined => {
  if (retryAfter) {
    const seconds = Number(retryAfter)

    if (Number.isFinite(seconds)) {
      return Math.max(0, seconds * 1_000)
    } else {
      const date = Date.parse(retryAfter)

      if (!Number.isNaN(date)) {
        return Math.max(0, date - Date.now())
      }
    }
  }
}

/** Best-effort extraction of HTTP status / Retry-After from an unknown throw. */
const classifyError = (error: unknown): HttpErrorInfo => {
  if (typeof error !== 'object' || error === null) {
    return {}
  }

  const candidate = error as CandidateError

  const status =
    typeof candidate.status === 'number'
      ? candidate.status
      : typeof candidate.response?.status === 'number'
        ? candidate.response.status
        : undefined

  const retryAfterHeader = getHeader('retry-after', candidate)

  const retryAfterMs = getRetryAfter(retryAfterHeader)

  return retryAfterMs === undefined ? { status } : { status, retryAfterMs }
}

const run = async (): Promise<void> => {
  const env = loadEnv()
  const log = createLogger(env.LOG_LEVEL, { app: 'indexer' })
  const db = createDb({ connectionString: env.DATABASE_URL })
  const handleEvent = createProjector({ db, log })

  let stopping = false
  const requestStop = (signal: string): void => {
    if (stopping) {
      return
    }
    stopping = true
    log.info('shutdown requested', { signal })
  }

  process.once('SIGINT', () => requestStop('SIGINT'))
  process.once('SIGTERM', () => requestStop('SIGTERM'))

  const cursorSeq = await readCursor(db)
  const startSeq =
    cursorSeq > 0
      ? cursorSeq
      : env.INDEXER_START_SEQ === 'latest'
        ? await fetchSealedTipSeq({
            service: env.JETSTREAM_URL,
            apiKey: env.JETSTREAM_API_KEY,
          })
        : env.INDEXER_START_SEQ

  log.info('indexer starting', {
    service: env.JETSTREAM_URL,
    collections: [...INDEXED_COLLECTIONS],
    cursorSeq,
    startSeq,
  })

  const jetstream = createJetstreamClient({
    service: env.JETSTREAM_URL,
    apiKey: env.JETSTREAM_API_KEY,
  })

  let seq = startSeq
  let backoff = BASE_BACKOFF_MS

  while (!stopping) {
    try {
      for await (const event of replayRecords(jetstream, {
        collections: INDEXED_COLLECTIONS,
        afterSeq: seq,
      })) {
        if (stopping) break
        await handleEvent(event)
        seq = event.seq
        backoff = BASE_BACKOFF_MS
      }

      if (stopping) break
      // A live replay should not normally end; if it does, reconnect from the
      // cursor so we do not re-index already-processed history.
      log.warn('replay stream ended; reconnecting from cursor', { seq })
      await sleep(BASE_BACKOFF_MS)
    } catch (error) {
      const info = classifyError(error)

      if (info.status === 401) {
        log.error(
          'Jetstream rejected the request as unauthorized. Check JETSTREAM_API_KEY; ' +
            'the indexer cannot continue without a valid key.',
          { status: info.status },
        )
        await closeDb(db)
        process.exit(1)
      }

      if (info.status === 429) {
        const waitMs = info.retryAfterMs ?? backoff
        log.warn('rate limited by Jetstream; respecting Retry-After', { waitMs })
        await sleep(waitMs)
        backoff = Math.min(backoff * 2, MAX_BACKOFF_MS)
        continue
      }

      log.error('Jetstream stream error; backing off', { err: error, waitMs: backoff })
      await sleep(backoff)
      backoff = Math.min(backoff * 2, MAX_BACKOFF_MS)
    }
  }

  await closeDb(db)
  log.info('indexer stopped', { seq })
}

run().catch((error: unknown) => {
  const log: Logger = createLogger('error', { app: 'indexer' })

  log.error('fatal indexer error', { err: error })

  process.exit(1)
})
