import { randomBytes } from 'node:crypto'
import { Kysely, PostgresDialect, sql } from 'kysely'
import { Pool } from 'pg'
import { runMigrations } from '../migrations.js'
import type { DB } from '../schema.js'

/**
 * A throwaway Postgres database for integration tests.
 *
 * Every call creates its own randomly-named *database* (not just a schema),
 * points a fresh pool at it and runs the migrations. Node runs test files in
 * parallel processes, so this is what keeps them from colliding. A separate
 * schema would not work: Kysely's migrator decides whether its bookkeeping tables
 * exist via `introspection.getTables()`, which ignores `search_path` and would
 * see another schema's `kysely_migration_lock`.
 *
 * `dispose()` drops the database (`WITH (FORCE)`, so open connections do not
 * block it), leaving nothing behind even when a test fails.
 *
 * Integration suites are skipped unless `TEST_DATABASE_URL` is set; see
 * `hasTestDatabase()`.
 */
export interface TestDatabase {
  db: Kysely<DB>
  /** Remove every row, keeping the tables, so tests start from a clean slate. */
  reset(): Promise<void>
  /** Drop the throwaway database and close every connection. */
  dispose(): Promise<void>
}

export const hasTestDatabase = (): boolean => Boolean(process.env.TEST_DATABASE_URL)

const replaceDatabase = (connectionString: string, database: string): string => {
  const url = new URL(connectionString)
  url.pathname = `/${database}`
  return url.toString()
}

export const createTestDatabase = async (): Promise<TestDatabase> => {
  const connectionString = process.env.TEST_DATABASE_URL
  if (!connectionString) throw new Error('TEST_DATABASE_URL is not set')

  // `admin` stays on the caller's database and only creates/drops the throwaway.
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
