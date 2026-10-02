import { Agent } from '@atproto/api'
import { RSVP_COLLECTION } from '@clairvoyant/lexicons'
import { withSpan } from '@clairvoyant/telemetry'
import type { OAuthClient } from './oauth/client.js'

export interface PdsAgent {
  listRecords(input: {
    collection: string
    limit: number
    cursor?: string
  }): Promise<{ records: Array<{ uri: string; value: unknown }>; cursor?: string }>
  createRecord(input: {
    collection: string
    record: Record<string, unknown>
  }): Promise<{ uri: string; cid: string }>
  putRecord(input: {
    collection: string
    rkey: string
    record: Record<string, unknown>
  }): Promise<{ uri: string; cid: string }>
  getSession(): Promise<{ handle: string }>
  resolveHandle(handle: string): Promise<string>
}

export interface PdsPort {
  withAgent<T>(did: string, run: (agent: PdsAgent) => Promise<T>): Promise<T>
}

export const createPdsPort = (oauth: OAuthClient): PdsPort => ({
  withAgent(did, run) {
    return withSpan(
      'atproto.pds',
      async () => {
        const session = await oauth.restore(did)
        const agent = new Agent(session)

        return run({
          async listRecords({ collection, limit, cursor }) {
            const result = await agent.com.atproto.repo.listRecords({
              repo: did,
              collection,
              limit,
              ...(cursor === undefined ? {} : { cursor }),
            })
            return {
              records: result.data.records.map((record) => ({
                uri: record.uri,
                value: record.value,
              })),
              cursor: result.data.cursor,
            }
          },
          async createRecord({ collection, record }) {
            const result = await agent.com.atproto.repo.createRecord({
              repo: did,
              collection,
              record,
            })
            return { uri: result.data.uri, cid: result.data.cid }
          },
          async putRecord({ collection, rkey, record }) {
            const result = await agent.com.atproto.repo.putRecord({
              repo: did,
              collection,
              rkey,
              record,
            })
            return { uri: result.data.uri, cid: result.data.cid }
          },
          async getSession() {
            const result = await agent.com.atproto.server.getSession()
            return { handle: result.data.handle }
          },
          async resolveHandle(handle) {
            const result = await agent.com.atproto.identity.resolveHandle({ handle })
            return result.data.did
          },
        })
      },
      { 'atproto.did': did },
    )
  },
})

export type RsvpStatus = 'going' | 'notgoing' | 'interested'

// Reuse the existing rkey so a user has one RSVP per event instead of duplicates.
export const findExistingRsvpRkey = async (
  agent: PdsAgent,
  eventUri: string,
): Promise<string | null> => {
  let cursor: string | undefined

  for (let page = 0; page < 10; page += 1) {
    const listing = await agent.listRecords({
      collection: RSVP_COLLECTION,
      limit: 100,
      ...(cursor === undefined ? {} : { cursor }),
    })

    for (const record of listing.records) {
      const value = record.value as { subject?: { uri?: unknown } }
      if (value.subject?.uri === eventUri) {
        return record.uri.split('/').pop() ?? null
      }
    }

    cursor = listing.cursor
    if (cursor === undefined) break
  }

  return null
}

// The RSVP is written to the user's own PDS, never to our database.
export const writeRsvpRecord = async (
  agent: PdsAgent,
  eventUri: string,
  eventCid: string,
  status: RsvpStatus,
): Promise<{ uri: string; cid: string }> => {
  const record: Record<string, unknown> = {
    $type: RSVP_COLLECTION,
    status: `${RSVP_COLLECTION}#${status}`,
    subject: { uri: eventUri, cid: eventCid },
  }

  const existingRkey = await findExistingRsvpRkey(agent, eventUri)
  return existingRkey
    ? agent.putRecord({ collection: RSVP_COLLECTION, rkey: existingRkey, record })
    : agent.createRecord({ collection: RSVP_COLLECTION, record })
}
