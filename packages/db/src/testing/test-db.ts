import { randomBytes } from 'node:crypto'
import { Kysely, PostgresDialect, sql } from 'kysely'
import { Pool } from 'pg'
import { runMigrations } from '../migrations.js'
import type { DB } from '../schema.js'

export interface TestDatabase {
  db: Kysely<DB>
  reset(): Promise<void>
  dispose(): Promise<void>
}

export const hasTestDatabase = (): boolean => Boolean(process.env.TEST_DATABASE_URL)

const replaceDatabase = (connectionString: string, database: string): string => {
  const url = new URL(connectionString)
  url.pathname = `/${database}`
  return url.toString()
}

// Each call creates its own randomly named database, not a schema: Kysely's
// migrator looks for its tables via introspection.getTables(), which ignores
// search_path and would otherwise see another test's lock.
export const createTestDatabase = async (): Promise<TestDatabase> => {
  const connectionString = process.env.TEST_DATABASE_URL
  if (!connectionString) throw new Error('TEST_DATABASE_URL is not set')

  const admin = new Pool({ connectionString })
  const database = `clairvoyant_test_${randomBytes(6).toString('hex')}`
  await admin.query(`CREATE DATABASE "${database}"`)

  const pool = new Pool({ connectionString: replaceDatabase(connectionString, database) })
  const db = new Kysely<DB>({ dialect: new PostgresDialect({ pool }) })

  await runMigrations(db, 'up')

  return {
    db,
    async reset() {
      await sql`truncate table event, rsvp, auth_state, auth_session, cursor, invite restart identity cascade`.execute(
        db,
      )
    },
    async dispose() {
      await db.destroy()
      await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`)
      await admin.end()
    },
  }
}
