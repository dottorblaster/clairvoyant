import type { Kysely, Selectable, Transaction } from 'kysely'
import {
  ATTENDING_RAW_STATUS_VALUES,
  type AttendingStatusName,
  isAttendingStatusName,
  RSVP_STATUS_RANK,
  type RsvpStatusName,
  rsvpStatusName,
} from './rsvp-status.js'
import type { DB, InviteTable, RsvpTable } from './schema.js'

export type Db = Kysely<DB>
export type DbOrTrx = Kysely<DB> | Transaction<DB>

export interface EventRow {
  uri: string
  cid: string
  author_did: string
  name: string
  starts_at: Date | null
  ends_at: Date | null
  description: string | null
  locations: unknown
  indexed_at: Date
  raw: unknown
}

export interface EventUpsert {
  uri: string
  cid: string
  authorDid: string
  name: string
  startsAt: Date | null
  endsAt: Date | null
  description: string | null
  locations: unknown
  raw: unknown
}

export interface RsvpUpsert {
  uri: string
  cid: string
  authorDid: string
  subjectUri: string
  status: string
}

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
      description: input.description,
      // pg sends a JS array as a Postgres array literal, which JSONB rejects.
      locations: JSON.stringify(input.locations),
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
        description: input.description,
        locations: JSON.stringify(input.locations),
        indexed_at: now,
        raw: input.raw,
      }),
    )
    .execute()
}

export const deleteEventByUri = async (db: DbOrTrx, uri: string): Promise<void> => {
  await db.deleteFrom('event').where('uri', '=', uri).execute()
}

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

export const MAX_DISCOVER_LIMIT = 24

export interface DiscoverEventsOptions {
  limit: number
  candidatePool?: number
}

export const sampleWithoutReplacement = <T>(items: readonly T[], count: number): T[] => {
  const shuffled = items.slice()
  const wanted = Math.max(0, Math.min(count, shuffled.length))

  for (let i = 0; i < wanted; i += 1) {
    const j = i + Math.floor(Math.random() * (shuffled.length - i))
    const atI = shuffled[i]!
    shuffled[i] = shuffled[j]!
    shuffled[j] = atI
  }

  return shuffled.slice(0, wanted)
}

export const listDiscoverEvents = async (
  db: DbOrTrx,
  { limit, candidatePool = 200 }: DiscoverEventsOptions,
): Promise<EventRow[]> => {
  const wanted = Math.max(0, Math.min(limit, MAX_DISCOVER_LIMIT))
  if (wanted === 0) return []

  const now = new Date()

  const upcoming = await db
    .selectFrom('event')
    .selectAll()
    .where('starts_at', 'is not', null)
    .where('starts_at', '>=', now)
    .orderBy('starts_at', 'asc')
    .limit(candidatePool)
    .execute()

  const picked = sampleWithoutReplacement(upcoming, wanted)
  if (picked.length === wanted) return picked

  const excludedUris = picked.map((row) => row.uri)
  const recent = await db
    .selectFrom('event')
    .selectAll()
    .where('starts_at', 'is not', null)
    .where('starts_at', '<', now)
    .$if(excludedUris.length > 0, (qb) => qb.where('uri', 'not in', excludedUris))
    .orderBy('starts_at', 'desc')
    .limit(wanted - picked.length)
    .execute()

  return [...picked, ...recent]
}

export interface ParticipatingEventRow extends EventRow {
  rsvp_status: string
  rsvp_indexed_at: Date
}

export type MyEventRole = 'hosting' | AttendingStatusName

export type MyEvent = EventRow & { role: MyEventRole }

// INNER JOIN on purpose: an RSVP whose event is not indexed has nothing to render.
export const listEventsForParticipant = async (
  db: DbOrTrx,
  did: string,
): Promise<ParticipatingEventRow[]> =>
  db
    .selectFrom('rsvp')
    .innerJoin('event', 'event.uri', 'rsvp.subject_uri')
    .selectAll('event')
    .select(['rsvp.status as rsvp_status', 'rsvp.indexed_at as rsvp_indexed_at'])
    .where('rsvp.author_did', '=', did)
    .where('rsvp.status', 'in', ATTENDING_RAW_STATUS_VALUES)
    .execute()

const toEventRow = (row: ParticipatingEventRow): EventRow => ({
  uri: row.uri,
  cid: row.cid,
  author_did: row.author_did,
  name: row.name,
  starts_at: row.starts_at,
  ends_at: row.ends_at,
  description: row.description,
  locations: row.locations,
  indexed_at: row.indexed_at,
  raw: row.raw,
})

const isStrongerRsvp = (
  candidate: ParticipatingEventRow,
  incumbent: ParticipatingEventRow,
): boolean => {
  const next = rsvpStatusName(candidate.rsvp_status)
  const current = rsvpStatusName(incumbent.rsvp_status)
  if (next === null) return false
  if (current === null) return true
  if (RSVP_STATUS_RANK[next] !== RSVP_STATUS_RANK[current]) {
    return RSVP_STATUS_RANK[next] < RSVP_STATUS_RANK[current]
  }
  return candidate.rsvp_indexed_at.getTime() > incumbent.rsvp_indexed_at.getTime()
}

// Hosting beats attending, and duplicate RSVPs collapse to the strongest status.
export const mergeMyEvents = (
  authored: readonly EventRow[],
  participating: readonly ParticipatingEventRow[],
): MyEvent[] => {
  const merged = new Map<string, MyEvent>()

  for (const event of authored) {
    merged.set(event.uri, { ...event, role: 'hosting' })
  }

  const strongest = new Map<string, { row: ParticipatingEventRow; role: AttendingStatusName }>()
  for (const row of participating) {
    const name = rsvpStatusName(row.rsvp_status)
    if (name === null || !isAttendingStatusName(name)) continue

    const incumbent = strongest.get(row.uri)
    if (incumbent === undefined || isStrongerRsvp(row, incumbent.row)) {
      strongest.set(row.uri, { row, role: name })
    }
  }

  for (const [uri, entry] of strongest) {
    if (merged.has(uri)) continue
    merged.set(uri, { ...toEventRow(entry.row), role: entry.role })
  }

  return [...merged.values()]
}

export const sortMyEvents = (events: readonly MyEvent[], now: Date): MyEvent[] => {
  const cutoff = now.getTime()
  const upcoming = events.filter(
    (event) => event.starts_at !== null && event.starts_at.getTime() >= cutoff,
  )
  const past = events.filter(
    (event) => event.starts_at !== null && event.starts_at.getTime() < cutoff,
  )
  const undated = events.filter((event) => event.starts_at === null)

  const byStartAsc = (a: MyEvent, b: MyEvent): number =>
    (a.starts_at?.getTime() ?? 0) - (b.starts_at?.getTime() ?? 0)
  const byName = (a: MyEvent, b: MyEvent): number => a.name.localeCompare(b.name)

  return [
    ...upcoming.sort((a, b) => byStartAsc(a, b) || byName(a, b)),
    ...past.sort((a, b) => byStartAsc(b, a) || byName(a, b)),
    ...undated.sort(byName),
  ]
}

export type RsvpRow = Selectable<RsvpTable> & { status_name: RsvpStatusName | null }

export const listRsvpsForEvent = async (db: DbOrTrx, subjectUri: string): Promise<RsvpRow[]> => {
  const rows = await db
    .selectFrom('rsvp')
    .selectAll()
    .where('subject_uri', '=', subjectUri)
    .orderBy('indexed_at', 'asc')
    .execute()

  return rows.map((row) => ({ ...row, status_name: rsvpStatusName(row.status) }))
}

export interface InviteInput {
  tokenHash: string
  eventUri: string
  inviteeDid: string
  inviteeHandle: string
  inviterDid: string
  inviterHandle: string
}

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

export const getInviteByTokenHash = async (
  db: DbOrTrx,
  tokenHash: string,
): Promise<InviteRow | undefined> =>
  db.selectFrom('invite').selectAll().where('token_hash', '=', tokenHash).executeTakeFirst()

export type InviteRow = Selectable<InviteTable>
