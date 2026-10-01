import type { TypedEvent } from '@bsky/jetstream'
import { EVENT_COLLECTION, RSVP_COLLECTION } from '@clairvoyant/lexicons'
import type { Logger } from './logger.js'
import { parseEventRecord, parseRsvpRecord } from './records.js'
import type { ProjectorStore, ProjectorTransaction } from './store.js'
import { isValidEventRecord, isValidRsvpRecord } from './validate.js'

type CommitEvent = Extract<TypedEvent, { kind: 'commit' }>
type AccountEvent = Extract<TypedEvent, { kind: 'account' }>

export interface EventHandlerDeps {
  store: ProjectorStore
  log: Logger
}

const atUri = (did: string, collection: string, rkey: string): string =>
  `at://${did}/${collection}/${rkey}`

const handleCommit = async (
  trx: ProjectorTransaction,
  event: CommitEvent,
  deps: EventHandlerDeps,
): Promise<void> => {
  const commit = event.commit
  const { collection, operation, rkey } = commit

  if (collection !== EVENT_COLLECTION && collection !== RSVP_COLLECTION) return

  const uri = atUri(event.did, collection, rkey)

  if (operation === 'delete') {
    if (collection === EVENT_COLLECTION) await trx.deleteEventByUri(uri)
    else await trx.deleteRsvpByUri(uri)
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
    await trx.upsertEvent({
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

  await trx.upsertRsvp({
    uri,
    cid: commit.cid,
    authorDid: event.did,
    subjectUri: parsed.subjectUri,
    status: parsed.status,
  })
}

const handleAccount = async (
  trx: ProjectorTransaction,
  { account: { active, status }, did }: AccountEvent,
  { log }: EventHandlerDeps,
): Promise<void> => {
  if (active === false && status === 'deleted') {
    await trx.deleteAllByDid(did)
    log.info('removed all derived rows for deleted account', { did })
    return
  }

  log.debug('account event', { did, active, status })
}

export const createProjector =
  (deps: EventHandlerDeps) =>
  async (event: TypedEvent): Promise<void> => {
    await deps.store.transaction(async (trx) => {
      switch (event.kind) {
        case 'commit':
          await handleCommit(trx, event, deps)
          break
        case 'account':
          await handleAccount(trx, event, deps)
          break
        case 'sync':
          // A `sync` event means the account's repo was (re)synced; prior projected rows may be stale
          await trx.deleteAllByDid(event.did)
          deps.log.info('cleared derived rows for synced account', { did: event.did })
          break
        case 'identity':
          // Identity changes (handle, PDS endpoint) do not affect indexed rows.
          deps.log.debug('identity event (ignored)', { did: event.did, seq: event.seq })
          break
      }

      await trx.writeCursor(event.seq)
    })
  }
