import {
  createInvite,
  type DB,
  type DiscoverEventsOptions,
  type EventRow,
  getEventByUri,
  getInviteByTokenHash,
  type InviteInput,
  type InviteRow,
  listDiscoverEvents,
  listEventsByAuthor,
  listEventsForParticipant,
  listRsvpsForEvent,
  type ParticipatingEventRow,
  type RsvpRow,
} from '@clairvoyant/db'
import { type Kysely, sql } from 'kysely'

/**
 * The read/write surface `apps/api` needs from storage.
 *
 * This is a port, not a re-export of `@clairvoyant/db`: route handlers depend on
 * the interface, so integration tests can inject an in-memory fake and exercise
 * every route (auth, validation, invite enforcement, status codes) without a
 * Postgres instance. `createDbStore` is the production adapter.
 */
export interface Store {
  getEventByUri(uri: string): Promise<EventRow | undefined>
  listEventsByAuthor(did: string): Promise<EventRow[]>
  listEventsForParticipant(did: string): Promise<ParticipatingEventRow[]>
  listRsvpsForEvent(uri: string): Promise<RsvpRow[]>
  listDiscoverEvents(options: DiscoverEventsOptions): Promise<EventRow[]>
  createInvite(input: InviteInput): Promise<void>
  getInviteByTokenHash(tokenHash: string): Promise<InviteRow | undefined>
  ping(): Promise<void>
}

export const createDbStore = (db: Kysely<DB>): Store => ({
  getEventByUri: (uri) => getEventByUri(db, uri),
  listEventsByAuthor: (did) => listEventsByAuthor(db, did),
  listEventsForParticipant: (did) => listEventsForParticipant(db, did),
  listRsvpsForEvent: (uri) => listRsvpsForEvent(db, uri),
  listDiscoverEvents: (options) => listDiscoverEvents(db, options),
  createInvite: (input) => createInvite(db, input),
  getInviteByTokenHash: (tokenHash) => getInviteByTokenHash(db, tokenHash),
  ping: async () => {
    await sql`select 1`.execute(db)
  },
})
