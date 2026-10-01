import { Kysely, PostgresDialect } from 'kysely'
import { Pool } from 'pg'
import type { DB } from './schema.js'

export interface CreateDbOptions {
  connectionString: string
  // Maximum size of the underlying `pg` connection pool
  max?: number
}

export const createDb = ({ connectionString, max = 10 }: CreateDbOptions): Kysely<DB> => {
  const pool = new Pool({ connectionString, max })
  return new Kysely<DB>({ dialect: new PostgresDialect({ pool }) })
}

export const closeDb = async (db: Kysely<DB>): Promise<void> => {
  await db.destroy()
}
