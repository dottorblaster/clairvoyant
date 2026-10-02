import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { closeDb, createDb } from '../dist/client.js'

const UNREACHABLE = 'postgres://user:pass@127.0.0.1:1/none'

describe('createDb', () => {
  test('returns a Kysely instance exposing the query builder', async () => {
    const db = createDb({ connectionString: UNREACHABLE })
    try {
      assert.equal(typeof db.selectFrom, 'function')
      assert.equal(typeof db.destroy, 'function')
    } finally {
      await closeDb(db)
    }
  })

  test('honours the pool max option without connecting', async () => {
    const db = createDb({ connectionString: UNREACHABLE, max: 3 })
    await closeDb(db)
  })
})

describe('closeDb', () => {
  test('destroys the connection pool and resolves', async () => {
    const db = createDb({ connectionString: UNREACHABLE })
    await assert.doesNotReject(closeDb(db))
  })
})
