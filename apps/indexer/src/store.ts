import {
  type DB,
  deleteAllByDid,
  deleteEventByUri,
  deleteRsvpByUri,
  type EventUpsert,
  type RsvpUpsert,
  readCursor,
  upsertEvent,
  upsertRsvp,
  writeCursor,
} from '@clairvoyant/db'
import type { Kysely } from 'kysely'

export interface ProjectorTransaction {
  upsertEvent(input: EventUpsert): Promise<void>
  deleteEventByUri(uri: string): Promise<void>
  upsertRsvp(input: RsvpUpsert): Promise<void>
  deleteRsvpByUri(uri: string): Promise<void>
  deleteAllByDid(did: string): Promise<void>
  writeCursor(seq: number): Promise<void>
}

export interface ProjectorStore {
  readCursor(): Promise<number>
  transaction<T>(run: (trx: ProjectorTransaction) => Promise<T>): Promise<T>
}

export const createKyselyProjectorStore = (db: Kysely<DB>): ProjectorStore => ({
  readCursor: () => readCursor(db),
  transaction: (run) =>
    db.transaction().execute((trx) =>
      run({
        upsertEvent: (input) => upsertEvent(trx, input),
        deleteEventByUri: (uri) => deleteEventByUri(trx, uri),
        upsertRsvp: (input) => upsertRsvp(trx, input),
        deleteRsvpByUri: (uri) => deleteRsvpByUri(trx, uri),
        deleteAllByDid: (did) => deleteAllByDid(trx, did),
        writeCursor: (seq) => writeCursor(trx, seq),
      }),
    ),
})
