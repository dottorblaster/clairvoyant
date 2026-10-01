import type { TypedEvent } from '@bsky/jetstream'
import {
  type DB,
  deleteAllByDid,
  deleteEventByUri,
  deleteRsvpByUri,
  upsertEvent,
  upsertRsvp,
  writeCursor,
} from '@clairvoyant/db'
import { EVENT_COLLECTION, RSVP_COLLECTION } from '@clairvoyant/lexicons'
import type { Kysely, Transaction } from 'kysely'
import type { Logger } from './logger.js'
import { parseEventRecord, parseRsvpRecord } from './records.js'
import { isValidEventRecord, isValidRsvpRecord } from './validate.js'

type CommitEvent = Extract<TypedEvent, { kind: 'commit' }>
type AccountEvent = Extract<TypedEvent, { kind: 'account' }>

export interface EventHandlerDeps {
  db: Kysely<DB>
  log: Logger
}

const atUri = (did: string, collection: string, rkey: string): string =>
  `at://${did}/${collection}/${rkey}`

const handleCommit = async (
  trx: Transaction<DB>,
  event: CommitEvent,
  deps: EventHandlerDeps,
): Promise<void> => {
  const commit = event.commit
  const { collection, operation, rkey } = commit

  if (collection !== EVENT_COLLECTION && collection !== RSVP_COLLECTION) return

  const uri = atUri(event.did, collection, rkey)

  if (operation === 'delete') {
    if (collection === EVENT_COLLECTION) await deleteEventByUri(trx, uri)
    else await deleteRsvpByUri(trx, uri)
    return
  }

  const record = commit.record

  if (collection === EVENT_COLLECTION) {
    if (!isValidEventRecord(record)) {
      deps.log.warn('skipping event record that failed Lexicon validation', { uri })
      return
    }

    const parsed = parseEventRecord(record)
    if (!parsed) {
      deps.log.warn('skipping event record with unparseable fields', { uri })
      return
    }
    await upsertEvent(trx, {
      uri,
      cid: commit.cid,
      authorDid: event.did,
      name: parsed.name,
      startsAt: parsed.startsAt,
      endsAt: parsed.endsAt,
      raw: record,
    })
    return
  }

  if (!isValidRsvpRecord(record)) {
    deps.log.warn('skipping rsvp record that failed Lexicon validation', { uri })
    return
  }

  const parsed = parseRsvpRecord(record)

  if (!parsed) {
    deps.log.warn('skipping rsvp record with unparseable fields', { uri })
    return
  }

  await upsertRsvp(trx, {
    uri,
    cid: commit.cid,
    authorDid: event.did,
    subjectUri: parsed.subjectUri,
    status: parsed.status,
  })
}

const handleAccount = async (
  trx: Transaction<DB>,
  { account: { active, status }, did }: AccountEvent,
  { log }: EventHandlerDeps,
): Promise<void> => {
  if (active === false && status === 'deleted') {
    await deleteAllByDid(trx, did)
    log.info('removed all derived rows for deleted account', { did })
    return
  }

  log.debug('account event', { did, active, status })
}

export const createProjector =
  (deps: EventHandlerDeps) =>
  async (event: TypedEvent): Promise<void> => {
    await deps.db.transaction().execute(async (trx) => {
      switch (event.kind) {
        case 'commit':
          await handleCommit(trx, event, deps)
          break
        case 'account':
          await handleAccount(trx, event, deps)
          break
        case 'sync':
          // A `sync` event means the account's repo was (re)synced; prior projected rows may be stale
          await deleteAllByDid(trx, event.did)
          deps.log.info('cleared derived rows for synced account', { did: event.did })
          break
        case 'identity':
          // Identity changes (handle, PDS endpoint) do not affect indexed rows.
          deps.log.debug('identity event (ignored)', { did: event.did, seq: event.seq })
          break
      }

      await writeCursor(trx, event.seq)
    })
  }
