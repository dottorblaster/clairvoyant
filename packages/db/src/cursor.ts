import type { DbOrTrx } from './queries.js'

/** There is exactly one cursor row
 * THERE CAN BE ONLY ONE! We'll call this the Highlander constant */
export const CURSOR_ID = 1

/** Read the last processed Jetstream sequence, or 0 when nothing is indexed. */
export const readCursor = async (db: DbOrTrx): Promise<number> => {
  const row = await db
    .selectFrom('cursor')
    .select('seq')
    .where('id', '=', CURSOR_ID)
    .executeTakeFirst()
  return row ? Number(row.seq) : 0
}

/** Persist the last processed sequence */
export const writeCursor = async (db: DbOrTrx, seq: number): Promise<void> => {
  const now = new Date()
  await db
    .insertInto('cursor')
    .values({ id: CURSOR_ID, seq: String(seq), updated_at: now })
    .onConflict((oc) => oc.column('id').doUpdateSet({ seq: String(seq), updated_at: now }))
    .execute()
}
