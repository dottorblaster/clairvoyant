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

/** A row of the `event` table, as the API hands it to the browser. */
export interface EventRow {
  uri: string
  cid: string
  author_did: string
  name: string
  /** Optional in the lexicon, so this is genuinely nullable. */
  starts_at: Date | null
  ends_at: Date | null
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

/** Upper bound on `listDiscoverEvents`, shared with the API's query validation. */
export const MAX_DISCOVER_LIMIT = 24

export interface DiscoverEventsOptions {
  limit: number
  /**
   * How many of the soonest upcoming events are candidates for the random pick.
   * Bounds the work so a random sample never has to consider the whole index.
   */
  candidatePool?: number
}

/**
 * Partial Fisher-Yates: shuffles in place and returns the first `count` items.
 * Exported because it is the only non-trivial logic in the discover query and it
 * can be tested without a database.
 */
export const sampleWithoutReplacement = <T>(items: readonly T[], count: number): T[] => {
  const shuffled = items.slice()
  const wanted = Math.max(0, Math.min(count, shuffled.length))

  for (let i = 0; i < wanted; i += 1) {
    const j = i + Math.floor(Math.random() * (shuffled.length - i))
    // Both indices are in range by construction.
    const atI = shuffled[i]!
    shuffled[i] = shuffled[j]!
    shuffled[j] = atI
  }

  return shuffled.slice(0, wanted)
}

/**
 * The public "discover" feed: a handful of events for a visitor to open.
 *
 * Two tiers, deliberately:
 *
 *   1. Upcoming events, randomly sampled, so repeat visits surface different
 *      ones. The sample is drawn from a bounded soonest-first window rather than
 *      the whole table, so the cost does not grow with the index.
 *   2. Most recent past events, to top up. Without this a young or quiet index
 *      would leave the homepage empty.
 *
 * Events with no `startsAt` are excluded: the lexicon makes `startsAt` optional,
 * but an undated event is not something to put on a calendar discovery list.
 */
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

/** An event the viewer RSVP'd to, carrying the raw status of that RSVP. */
export interface ParticipatingEventRow extends EventRow {
  /** Verbatim network value, e.g. `community.lexicon.calendar.rsvp#going`. */
  rsvp_status: string
  rsvp_indexed_at: Date
}

/** How the viewer is connected to an event in their own list. */
export type MyEventRole = 'hosting' | AttendingStatusName

export type MyEvent = EventRow & { role: MyEventRole }

/**
 * Events the viewer RSVP'd "going" or "interested" to.
 *
 * `INNER JOIN` on purpose: 1005 of the live index's 5898 RSVPs point at events
 * that are not in `event` (the record was deleted, or predates the indexer's
 * start sequence), and there is nothing to render for those.
 *
 * The status filter uses both network spellings, derived from one constant — see
 * `rsvp-status.ts` for why that matters. It reads `rsvp_author_did_idx` and then
 * the `event` primary key, so it does not need an index of its own.
 */
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
  indexed_at: row.indexed_at,
  raw: row.raw,
})

/** Stronger commitment first, then the most recently indexed record. */
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

/**
 * Merges the viewer's authored events with the ones they RSVP'd to.
 *
 * Rules, in order:
 *   1. An authored event is always `hosting`, even if the viewer also RSVP'd to
 *      it. Hosting beats attending.
 *   2. One row per event URI. Duplicates are real: 80 `(author, event)` pairs in
 *      the live index hold more than one RSVP record, and some disagree
 *      (`going` + `interested` for the same event), so the strongest status wins
 *      and ties break on the most recently indexed record.
 *   3. An RSVP whose status is unrecognised is dropped rather than guessed at.
 */
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
    // Hosting already claimed this URI, and hosting beats attending.
    if (merged.has(uri)) continue
    merged.set(uri, { ...toEventRow(entry.row), role: entry.role })
  }

  return [...merged.values()]
}

/**
 * Display order: upcoming soonest-first, then past most-recent-first, then the
 * undated ones. The browser splits the same list back into those three sections,
 * so the order here is what the reader sees.
 */
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
  // A stable tie-break, so the order never depends on the database's whim.
  const byName = (a: MyEvent, b: MyEvent): number => a.name.localeCompare(b.name)

  return [
    ...upcoming.sort((a, b) => byStartAsc(a, b) || byName(a, b)),
    ...past.sort((a, b) => byStartAsc(b, a) || byName(a, b)),
    ...undated.sort(byName),
  ]
}

/** A row of the `rsvp` table plus the normalised status the UI renders. */
export type RsvpRow = Selectable<RsvpTable> & { status_name: RsvpStatusName | null }

/** The primary read: "who is going to event X" (uses `rsvp_subject_uri_idx`). */
export const listRsvpsForEvent = async (db: DbOrTrx, subjectUri: string): Promise<RsvpRow[]> => {
  const rows = await db
    .selectFrom('rsvp')
    .selectAll()
    .where('subject_uri', '=', subjectUri)
    .orderBy('indexed_at', 'asc')
    .execute()

  // `status` stays verbatim for fidelity; `status_name` is what the UI renders,
  // because the raw value is either `going` or `…#going` depending on which
  // client wrote the record.
  return rows.map((row) => ({ ...row, status_name: rsvpStatusName(row.status) }))
}

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

export const getInviteByTokenHash = async (
  db: DbOrTrx,
  tokenHash: string,
): Promise<InviteRow | undefined> =>
  db.selectFrom('invite').selectAll().where('token_hash', '=', tokenHash).executeTakeFirst()

/** A row of the `invite` table as selected (not the insert shape). */
export type InviteRow = Selectable<InviteTable>
