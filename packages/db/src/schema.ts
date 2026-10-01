/**
 * DATABASE = DERIVED INDEX, NEVER THE SOURCE OF TRUTH.
 *
 * Every row in this database is a projection of a record that lives in a user's
 * PDS (Personal Data Server) on the AT Protocol network. The canonical data is
 * the signed record in the PDS; this database only exists to make queries fast.
 *
 * Consequences for everyone touching this schema:
 *   - We must never treat a write here as authoritative. User-facing writes go
 *     to the PDS via OAuth; the indexer observes the network and folds the
 *     resulting stream into these tables.
 *   - The entire database can be dropped and rebuilt by replaying the network
 *     stream (via `apps/indexer`), starting from sequence 0.
 *   - All indexer writes must be idempotent (upsert-by-AT-URI / delete-by-AT-URI)
 *     because streams deliver at-least-once and replays overlap.
 *   - Deleting an account's data here is correct: it will be re-derived if the
 *     account becomes active again.
 *
 * NOT EVERYTHING HERE IS DERIVED. `auth_state`, `auth_session`, `cursor` and
 * `invite` are application state (OAuth sessions, the indexer's position, and
 * user-generated invites). They share this database but are not rebuildable
 * from the network: dropping them logs users out and loses invites.
 */
import type { ColumnType } from 'kysely'

/** A calendar event (`community.lexicon.calendar.event`). Keyed by AT-URI. */
export interface EventTable {
  uri: string
  cid: string
  author_did: string
  name: string
  starts_at: ColumnType<Date | null, Date | string | null, Date | string | null>
  ends_at: ColumnType<Date | null, Date | string | null, Date | string | null>
  indexed_at: ColumnType<Date, Date | string | undefined, Date | string>
  raw: ColumnType<unknown, unknown, unknown>
}

/** An RSVP (`community.lexicon.calendar.rsvp`). Keyed by AT-URI. */
export interface RsvpTable {
  uri: string
  cid: string
  author_did: string
  /** AT-URI of the event this RSVP points at. Heavily indexed. */
  subject_uri: string
  status: string
  indexed_at: ColumnType<Date, Date | string | undefined, Date | string>
}

/** Key/value store for short-lived OAuth authorization state. */
export interface AuthStateTable {
  key: string
  value: ColumnType<unknown, unknown, unknown>
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>
}

/** Key/value store for OAuth sessions, keyed by user DID. */
export interface AuthSessionTable {
  key: string
  value: ColumnType<unknown, unknown, unknown>
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>
}

/** Single-row table (`id = 1`) holding the last processed Jetstream sequence. */
export interface CursorTable {
  id: number
  /** `pg` returns `bigint` as a string; we keep it typed as such. */
  seq: ColumnType<string, string | number, string | number>
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>
}

/**
 * Application state (not network-derived): a per-person invite to an event.
 * The raw token is never stored — only its SHA-256 hash.
 */
export interface InviteTable {
  token_hash: string
  event_uri: string
  invitee_did: string
  invitee_handle: string
  inviter_did: string
  inviter_handle: string
  created_at: ColumnType<Date, Date | string | undefined, Date | string>
}

export interface DB {
  event: EventTable
  rsvp: RsvpTable
  auth_state: AuthStateTable
  auth_session: AuthSessionTable
  cursor: CursorTable
  invite: InviteTable
}
