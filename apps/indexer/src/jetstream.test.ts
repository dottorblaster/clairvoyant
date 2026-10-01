import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { Jetstream, type TypedEvent } from '@bsky/jetstream'
import {
  createJetstreamClient,
  fetchSealedTipSeq,
  type JetstreamClient,
  replayRecords,
} from '../dist/jetstream.js'

interface FetchCall {
  url: string
  method: string | undefined
  authorization: string | null
  contentType: string | null
  body: unknown
}

const withFetch = async (
  impl: (call: FetchCall) => {
    ok: boolean
    status: number
    statusText: string
    json: () => Promise<unknown>
  },
  run: (calls: FetchCall[]) => Promise<void>,
): Promise<void> => {
  const original = globalThis.fetch
  const calls: FetchCall[] = []

  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers)
    const call: FetchCall = {
      url: input.toString(),
      method: init?.method,
      authorization: headers.get('authorization'),
      contentType: headers.get('content-type'),
      body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
    }
    calls.push(call)
    return impl(call) as unknown as Response
  }) as typeof fetch

  try {
    await run(calls)
  } finally {
    globalThis.fetch = original
  }
}

describe('fetchSealedTipSeq', () => {
  test('POSTs the planSnapshot query and returns the sealed tip', async () => {
    await withFetch(
      () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ sealedTipSeq: 123 }),
      }),
      async (calls) => {
        const seq = await fetchSealedTipSeq({ service: 'https://js.example' })

        assert.equal(seq, 123)
        assert.equal(calls[0]?.url, 'https://js.example/xrpc/network.bsky.jetstream.planSnapshot')
        assert.equal(calls[0]?.method, 'POST')
        assert.equal(calls[0]?.contentType, 'application/json')
        assert.deepEqual(calls[0]?.body, { afterSeq: Number.MAX_SAFE_INTEGER })
      },
    )
  })

  test('sends a bearer token only when an API key is configured', async () => {
    await withFetch(
      () => ({ ok: true, status: 200, statusText: 'OK', json: async () => ({ sealedTipSeq: 1 }) }),
      async (calls) => {
        await fetchSealedTipSeq({ service: 'https://js.example', apiKey: 'secret' })
        assert.equal(calls[0]?.authorization, 'Bearer secret')
      },
    )

    await withFetch(
      () => ({ ok: true, status: 200, statusText: 'OK', json: async () => ({ sealedTipSeq: 1 }) }),
      async (calls) => {
        await fetchSealedTipSeq({ service: 'https://js.example' })
        assert.equal(calls[0]?.authorization, null)
      },
    )
  })

  test('throws on a non-OK response', async () => {
    await withFetch(
      () => ({ ok: false, status: 500, statusText: 'Server Error', json: async () => ({}) }),
      async () => {
        await assert.rejects(
          fetchSealedTipSeq({ service: 'https://js.example' }),
          /planSnapshot tip lookup failed: 500 Server Error/,
        )
      },
    )
  })

  test('throws when the body lacks a numeric sealedTipSeq', async () => {
    await withFetch(
      () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ sealedTipSeq: '123' }),
      }),
      async () => {
        await assert.rejects(
          fetchSealedTipSeq({ service: 'https://js.example' }),
          /did not return sealedTipSeq/,
        )
      },
    )
  })
})

describe('replayRecords', () => {
  test('passes the collections and afterSeq through, and yields the stream', async () => {
    const events = [{ seq: 1 }, { seq: 2 }] as unknown as TypedEvent[]
    const captured: { collections?: readonly string[]; afterSeq?: number } = {}
    const client = {
      replay: (options: { collections: readonly string[]; afterSeq: number }) => {
        captured.collections = options.collections
        captured.afterSeq = options.afterSeq
        return (async function* () {
          yield* events
        })()
      },
    } as unknown as JetstreamClient

    const seen: TypedEvent[] = []
    for await (const event of replayRecords(client, { collections: ['a', 'b'], afterSeq: 7 })) {
      seen.push(event)
    }

    assert.deepEqual(captured, { collections: ['a', 'b'], afterSeq: 7 })
    assert.deepEqual(seen, events)
  })
})

describe('createJetstreamClient', () => {
  test('constructs a Jetstream client with and without an API key', () => {
    assert.ok(createJetstreamClient({ service: 'https://js.example' }) instanceof Jetstream)
    assert.ok(
      createJetstreamClient({ service: 'https://js.example', apiKey: 'k' }) instanceof Jetstream,
    )
  })
})
