import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { sql } from 'kysely'
import { migrations, runMigrations } from '../dist/migrations.js'
import { createTestDatabase, hasTestDatabase, type TestDatabase } from '../dist/testing/test-db.js'

const EXPECTED_TABLES = ['event', 'rsvp', 'auth_state', 'auth_session', 'cursor', 'invite']
const MIGRATION_COUNT = Object.keys(migrations).length

const listTables = async (testDb: TestDatabase): Promise<string[]> => {
  const result = await sql<{ table_name: string }>`
    select table_name from information_schema.tables where table_schema = current_schema()
  `.execute(testDb.db)
  return result.rows.map((row) => row.table_name)
}

const suite = hasTestDatabase() ? describe : describe.skip

suite('migrations (Postgres integration)', () => {
  let testDb: TestDatabase

  before(async () => {
    testDb = await createTestDatabase()
  })

  after(async () => {
    await testDb.dispose()
  })

  test('running up again on a migrated schema is a no-op', async () => {
    assert.deepEqual(await runMigrations(testDb.db, 'up'), [])
  })

  test('down reverts every migration and up rebuilds every table', async () => {
    // The helper migrated up, so walk every migration all the way back down.
    for (let i = 0; i < MIGRATION_COUNT; i += 1) {
      await runMigrations(testDb.db, 'down')
    }
    const afterDown = await listTables(testDb)
    for (const table of EXPECTED_TABLES) {
      assert.ok(!afterDown.includes(table), `${table} should have been dropped`)
    }

    const results = await runMigrations(testDb.db, 'up')
    assert.equal(results.length, MIGRATION_COUNT)
    const afterUp = await listTables(testDb)
    for (const table of EXPECTED_TABLES) {
      assert.ok(afterUp.includes(table), `${table} should have been recreated`)
    }
  })
})
