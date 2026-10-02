import type { DbOrTrx } from './queries.js'

export const CURSOR_ID = 1

export const readCursor = async (db: DbOrTrx): Promise<number> => {
  const row = await db
    .selectFrom('cursor')
    .select('seq')
    .where('id', '=', CURSOR_ID)
    .executeTakeFirst()
  return row ? Number(row.seq) : 0
}

export const writeCursor = async (db: DbOrTrx, seq: number): Promise<void> => {
  const now = new Date()
  await db
    .insertInto('cursor')
    .values({ id: CURSOR_ID, seq: String(seq), updated_at: now })
    .onConflict((oc) => oc.column('id').doUpdateSet({ seq: String(seq), updated_at: now }))
    .execute()
}
