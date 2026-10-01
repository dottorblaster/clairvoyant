import { type CollectionFilter, Jetstream, type TypedEvent } from '@bsky/jetstream'

export interface CreateJetstreamOptions {
  service: string
  apiKey?: string
}

export const createJetstreamClient = (options: CreateJetstreamOptions): Jetstream =>
  options.apiKey === undefined
    ? new Jetstream({ service: options.service })
    : new Jetstream({ service: options.service, apiKey: options.apiKey })

/**
 * Resolve the current sealed archive tip (the latest sequence number).
 *
 * `planSnapshot` with a sequence above any real tip returns an empty plan plus
 * the current `sealedTipSeq`, so this is a cheap metadata call. The public
 * Jetstream instance requires an API key on archive endpoints.
 */
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

/**
 * `replay` yields historical events after `afterSeq` and then transparently
 * cuts over to the live tail, so one async iterator covers backfill + follow.
 *
 * We deliberately request the *unvalidated* typed stream (plain NSID string
 * filters) and validate records ourselves in `validate.ts`: the wire is not
 * cryptographically verified, so we do not want to rely solely on transport
 * decoding.
 */
export const replayRecords = (
  client: Jetstream,
  options: ReplayOptions,
): AsyncIterable<TypedEvent> =>
  client.replay({
    collections: options.collections as unknown as CollectionFilter[],
    afterSeq: options.afterSeq,
  }) as unknown as AsyncIterable<TypedEvent>
