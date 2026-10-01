import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import type { TypedEvent } from '@bsky/jetstream'
import type { Env } from '../dist/env.js'
import { type IndexerRuntime, runIndexer } from '../dist/index.js'
import type { JetstreamClient } from '../dist/jetstream.js'
import type { Logger } from '../dist/logger.js'
import { BASE_BACKOFF_MS } from '../dist/retry.js'
import type { ProjectorStore } from '../dist/store.js'

const TIME = '2026-01-01T00:00:00.000Z'
const DID = 'did:plc:author'

const identityEvent = (seq: number): TypedEvent =>
  ({ kind: 'identity', did: DID, seq, time: TIME, identity: { did: DID } }) as unknown as TypedEvent

const testEnv = (overrides: Partial<Env> = {}): Env => ({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://unused',
  JETSTREAM_URL: 'https://js.example',
  JETSTREAM_API_KEY: undefined,
  INDEXER_START_SEQ: 0,
  LOG_LEVEL: 'error',
  ...overrides,
})

interface ScriptStep {
  events?: TypedEvent[]
  error?: unknown
}

interface HarnessOptions {
  cursor?: number
  env?: Partial<Env>
  script?: ScriptStep[]
  /** Abort the run after this many sleeps have happened. */
  abortAfterSleeps?: number
  /** Abort after this many cursor writes. */
  abortAfterWrites?: number
  fetchTip?: () => Promise<number>
}

const harness = (options: HarnessOptions = {}) => {
  const controller = new AbortController()
  const cursorWrites: number[] = []
  const sleeps: number[] = []
  const replayInputs: Array<{ collections: readonly string[]; afterSeq: number }> = []
  const exitCodes: number[] = []
  const logs: Array<{ level: string; message: string }> = []

  const store: ProjectorStore = {
    async readCursor() {
      return options.cursor ?? 0
    },
    async transaction(run) {
      return run({
        upsertEvent: async () => {},
        deleteEventByUri: async () => {},
        upsertRsvp: async () => {},
        deleteRsvpByUri: async () => {},
        deleteAllByDid: async () => {},
        writeCursor: async (seq) => {
          cursorWrites.push(seq)
          if (
            options.abortAfterWrites !== undefined &&
            cursorWrites.length >= options.abortAfterWrites
          ) {
            controller.abort()
          }
        },
      })
    },
  }

  let call = 0
  const jetstream = {
    replay: (input: { collections: readonly string[]; afterSeq: number }) => {
      replayInputs.push(input)
      const step = options.script?.[call] ?? { events: [] }
      call += 1
      return (async function* () {
        if (step.error !== undefined) throw step.error
        yield* step.events ?? []
      })()
    },
  } as unknown as JetstreamClient

  const make =
    (level: string) =>
    (message: string): void => {
      logs.push({ level, message })
    }
  const log: Logger = {
    debug: make('debug'),
    info: make('info'),
    warn: make('warn'),
    error: make('error'),
  }

  const runtime: IndexerRuntime = {
    env: testEnv(options.env),
    log,
    store,
    jetstream,
    fetchTip: options.fetchTip ?? (async () => 999),
    sleep: async (ms) => {
      sleeps.push(ms)
      if (options.abortAfterSleeps !== undefined && sleeps.length >= options.abortAfterSleeps) {
        controller.abort()
      }
    },
    exit: (code) => {
      exitCodes.push(code)
    },
    signal: controller.signal,
  }

  return { runtime, controller, cursorWrites, sleeps, replayInputs, exitCodes, logs }
}

describe('runIndexer start sequence', () => {
  test('resumes from a non-zero stored cursor and ignores INDEXER_START_SEQ', async () => {
    const h = harness({ cursor: 42, env: { INDEXER_START_SEQ: 7 }, abortAfterSleeps: 1 })
    await runIndexer(h.runtime)

    assert.equal(h.replayInputs[0]?.afterSeq, 42)
  })

  test('uses the numeric INDEXER_START_SEQ when the cursor is empty', async () => {
    const h = harness({ env: { INDEXER_START_SEQ: 7 }, abortAfterSleeps: 1 })
    await runIndexer(h.runtime)

    assert.equal(h.replayInputs[0]?.afterSeq, 7)
  })

  test('resolves the sealed tip for INDEXER_START_SEQ=latest', async () => {
    const h = harness({
      env: { INDEXER_START_SEQ: 'latest' },
      fetchTip: async () => 555,
      abortAfterSleeps: 1,
    })
    await runIndexer(h.runtime)

    assert.equal(h.replayInputs[0]?.afterSeq, 555)
  })

  test('logs the resolved start sequence', async () => {
    const h = harness({ cursor: 42, abortAfterSleeps: 1 })
    await runIndexer(h.runtime)

    assert.ok(h.logs.some((entry) => entry.message === 'indexer starting'))
  })
})

describe('runIndexer event processing', () => {
  test('persists the cursor as events are processed, then stops on abort', async () => {
    const h = harness({
      script: [{ events: [identityEvent(1), identityEvent(2), identityEvent(3)] }],
      abortAfterWrites: 2,
    })
    await runIndexer(h.runtime)

    assert.deepEqual(h.cursorWrites, [1, 2])
    assert.ok(h.logs.some((entry) => entry.message === 'indexer stopped'))
  })

  test('reconnects and sleeps when the stream ends without an error', async () => {
    const h = harness({ script: [{ events: [identityEvent(1)] }], abortAfterSleeps: 1 })
    await runIndexer(h.runtime)

    assert.deepEqual(h.sleeps, [BASE_BACKOFF_MS])
    assert.ok(h.logs.some((entry) => entry.message.includes('replay stream ended')))
  })
})

describe('runIndexer failure handling', () => {
  test('stops with a non-zero exit on a 401', async () => {
    const unauthorized = Object.assign(new Error('unauthorized'), { status: 401 })
    const h = harness({ script: [{ error: unauthorized }] })
    await runIndexer(h.runtime)

    assert.deepEqual(h.exitCodes, [1])
    assert.equal(h.sleeps.length, 0)
    assert.ok(
      h.logs.some(
        (entry) => entry.level === 'error' && entry.message.includes('JETSTREAM_API_KEY'),
      ),
    )
  })

  test('honours Retry-After on a 429', async () => {
    const rateLimited = { status: 429, response: { headers: { get: () => '5' } } }
    const h = harness({ script: [{ error: rateLimited }], abortAfterSleeps: 1 })
    await runIndexer(h.runtime)

    assert.deepEqual(h.sleeps, [5_000])
    assert.ok(h.logs.some((entry) => entry.message.includes('rate limited')))
  })

  test('backs off exponentially across generic failures', async () => {
    const h = harness({
      script: [{ error: new Error('socket reset') }, { error: new Error('socket reset') }],
      abortAfterSleeps: 2,
    })
    await runIndexer(h.runtime)

    assert.deepEqual(h.sleeps, [BASE_BACKOFF_MS, BASE_BACKOFF_MS * 2])
  })
})
