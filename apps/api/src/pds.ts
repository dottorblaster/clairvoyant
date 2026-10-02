import { Agent } from '@atproto/api'
import { RSVP_COLLECTION } from '@clairvoyant/lexicons'
import { withSpan } from '@clairvoyant/telemetry'
import type { OAuthClient } from './oauth/client.js'

/**
 * The subset of the atproto repo API this app uses, narrowed to what the routes
 * actually need. Keeping it small makes the routes testable with a fake and
 * keeps `@atproto/api` out of the handlers.
 */
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

/**
 * Restores the signed-in user's OAuth session and hands the caller an agent
 * scoped to their repo. The session (including DPoP keys) lives server-side; the
 * browser only ever holds a DID cookie.
 */
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

/**
 * Find the rkey of the user's existing RSVP for this event, if any. The lexicon
 * declares a `tid` key, but re-using the existing rkey keeps exactly one RSVP
 * per (user, event) instead of piling up duplicates.
 */
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

/** Write an RSVP record to the user's PDS (never to our database). */
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
