import type { Kysely, Transaction } from 'kysely'
import type { DB } from './schema.js'

export type Db = Kysely<DB>
export type DbOrTrx = Kysely<DB> | Transaction<DB>

export interface EventUpsert {
  uri: string
  cid: string
  authorDid: string
  name: string
  startsAt: Date | null
  endsAt: Date | null
  raw: unknown
}

export interface RsvpUpsert {
  uri: string
  cid: string
  authorDid: string
  subjectUri: string
  status: string
}

/** Idempotent create/update of an event, keyed by AT-URI. */
export const upsertEvent = async (db: DbOrTrx, input: EventUpsert): Promise<void> => {
  const now = new Date()
  await db
    .insertInto('event')
    .values({
      uri: input.uri,
      cid: input.cid,
      author_did: input.authorDid,
      name: input.name,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      indexed_at: now,
      raw: input.raw,
    })
    .onConflict((oc) =>
      oc.column('uri').doUpdateSet({
        cid: input.cid,
        author_did: input.authorDid,
        name: input.name,
        starts_at: input.startsAt,
        ends_at: input.endsAt,
        indexed_at: now,
        raw: input.raw,
      }),
    )
    .execute()
}

export const deleteEventByUri = async (db: DbOrTrx, uri: string): Promise<void> => {
  await db.deleteFrom('event').where('uri', '=', uri).execute()
}

// Idempotent create/update of an RSVP, keyed by AT-URI
export const upsertRsvp = async (db: DbOrTrx, input: RsvpUpsert): Promise<void> => {
  const now = new Date()
  await db
    .insertInto('rsvp')
    .values({
      uri: input.uri,
      cid: input.cid,
      author_did: input.authorDid,
      subject_uri: input.subjectUri,
      status: input.status,
      indexed_at: now,
    })
    .onConflict((oc) =>
      oc.column('uri').doUpdateSet({
        cid: input.cid,
        author_did: input.authorDid,
        subject_uri: input.subjectUri,
        status: input.status,
        indexed_at: now,
      }),
    )
    .execute()
}

export const deleteRsvpByUri = async (db: DbOrTrx, uri: string): Promise<void> => {
  await db.deleteFrom('rsvp').where('uri', '=', uri).execute()
}

/**
 * Remove every derived row authored by a DID. Used for account deletions and
 * `sync` events. RSVPs the author made against other people's events are also
 * removed because they are authored by this DID.
 */
export const deleteAllByDid = async (db: DbOrTrx, did: string): Promise<void> => {
  await db.deleteFrom('rsvp').where('author_did', '=', did).execute()
  await db.deleteFrom('event').where('author_did', '=', did).execute()
}

export const getEventByUri = async (db: DbOrTrx, uri: string) =>
  db.selectFrom('event').selectAll().where('uri', '=', uri).executeTakeFirst()

export const listEventsByAuthor = async (db: DbOrTrx, did: string) =>
  db
    .selectFrom('event')
    .selectAll()
    .where('author_did', '=', did)
    .orderBy('starts_at', 'asc')
    .execute()

/** The primary read: "who is going to event X" (uses `rsvp_subject_uri_idx`). */
export const listRsvpsForEvent = async (db: DbOrTrx, subjectUri: string) =>
  db
    .selectFrom('rsvp')
    .selectAll()
    .where('subject_uri', '=', subjectUri)
    .orderBy('indexed_at', 'asc')
    .execute()

export interface InviteInput {
  /** SHA-256 hash of the invite token; the raw token is never persisted. */
  tokenHash: string
  eventUri: string
  inviteeDid: string
  inviteeHandle: string
  inviterDid: string
  inviterHandle: string
}

/** App state (not network-derived): create a per-person invite. */
export const createInvite = async (db: DbOrTrx, input: InviteInput): Promise<void> => {
  await db
    .insertInto('invite')
    .values({
      token_hash: input.tokenHash,
      event_uri: input.eventUri,
      invitee_did: input.inviteeDid,
      invitee_handle: input.inviteeHandle,
      inviter_did: input.inviterDid,
      inviter_handle: input.inviterHandle,
    })
    .execute()
}

export const getInviteByTokenHash = async (db: DbOrTrx, tokenHash: string) =>
  db.selectFrom('invite').selectAll().where('token_hash', '=', tokenHash).executeTakeFirst()
