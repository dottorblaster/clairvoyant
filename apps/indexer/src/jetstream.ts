import { type CollectionFilter, Jetstream, type TypedEvent } from '@bsky/jetstream'

export interface CreateJetstreamOptions {
  service: string
  apiKey?: string
}

export const createJetstreamClient = (options: CreateJetstreamOptions): Jetstream =>
  options.apiKey === undefined
    ? new Jetstream({ service: options.service })
    : new Jetstream({ service: options.service, apiKey: options.apiKey })

// A sequence above the tip returns an empty plan plus sealedTipSeq, so this is a
// cheap metadata call. The archive endpoint requires the API key.
export const fetchSealedTipSeq = async (options: CreateJetstreamOptions): Promise<number> => {
  const url = new URL('/xrpc/network.bsky.jetstream.planSnapshot', options.service)
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(options.apiKey === undefined ? {} : { authorization: `Bearer ${options.apiKey}` }),
    },
    body: JSON.stringify({ afterSeq: Number.MAX_SAFE_INTEGER }),
  })

  if (!response.ok) {
    throw new Error(`planSnapshot tip lookup failed: ${response.status} ${response.statusText}`)
  }

  const body = (await response.json()) as { sealedTipSeq?: unknown }
  if (typeof body.sealedTipSeq !== 'number') {
    throw new Error('planSnapshot tip lookup did not return sealedTipSeq')
  }
  return body.sealedTipSeq
}

export type JetstreamClient = Jetstream

export interface ReplayOptions {
  collections: readonly string[]
  afterSeq: number
}

export const replayRecords = (
  client: Jetstream,
  options: ReplayOptions,
): AsyncIterable<TypedEvent> =>
  client.replay({
    collections: options.collections as unknown as CollectionFilter[],
    afterSeq: options.afterSeq,
  }) as unknown as AsyncIterable<TypedEvent>
