// Derived index, never the source of truth. Every row here is a projection of a
// record in a user's PDS, and the whole database can be dropped and rebuilt by
// replaying Jetstream. auth_state, auth_session, cursor and invite are the
// exception: they are app state, not derived, so dropping them logs users out
// and loses invites.
import type { ColumnType } from 'kysely'

export interface EventTable {
  uri: string
  cid: string
  author_did: string
  name: string
  starts_at: ColumnType<Date | null, Date | string | null, Date | string | null>
  ends_at: ColumnType<Date | null, Date | string | null, Date | string | null>
  description: string | null
  locations: ColumnType<unknown, unknown, unknown>
  indexed_at: ColumnType<Date, Date | string | undefined, Date | string>
  raw: ColumnType<unknown, unknown, unknown>
}

export interface RsvpTable {
  uri: string
  cid: string
  author_did: string
  subject_uri: string
  status: string
  indexed_at: ColumnType<Date, Date | string | undefined, Date | string>
}

export interface AuthStateTable {
  key: string
  value: ColumnType<unknown, unknown, unknown>
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>
}

export interface AuthSessionTable {
  key: string
  value: ColumnType<unknown, unknown, unknown>
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>
}

export interface CursorTable {
  id: number
  // pg returns bigint as a string, so keep it typed as one.
  seq: ColumnType<string, string | number, string | number>
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>
}

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
