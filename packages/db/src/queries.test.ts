import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  listDiscoverEvents,
  MAX_DISCOVER_LIMIT,
  sampleWithoutReplacement,
} from '../dist/queries.js'

describe('sampleWithoutReplacement', () => {
  test('returns exactly the requested number of items', () => {
    const items = [1, 2, 3, 4, 5, 6]
    for (const count of [1, 3, 6]) {
      assert.equal(sampleWithoutReplacement(items, count).length, count)
    }
  })

  test('returns a permutation, never a duplicate or an invention', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
    for (let run = 0; run < 50; run += 1) {
      const picked = sampleWithoutReplacement(items, 4)
      assert.equal(new Set(picked).size, picked.length, 'picked the same item twice')
      for (const item of picked) {
        assert.ok(items.includes(item), `picked an item that was not in the input: ${item}`)
      }
    }
  })

  test('does not mutate the input', () => {
    const items = Object.freeze([1, 2, 3, 4, 5])
    assert.doesNotThrow(() => sampleWithoutReplacement(items, 3))
    assert.deepEqual([...items], [1, 2, 3, 4, 5])
  })

  test('caps at the number of available items', () => {
    const picked = sampleWithoutReplacement([1, 2, 3], 10)
    assert.equal(picked.length, 3)
    assert.deepEqual([...picked].sort(), [1, 2, 3])
  })

  test('returns nothing for a non-positive count or an empty pool', () => {
    assert.deepEqual(sampleWithoutReplacement([1, 2, 3], 0), [])
    assert.deepEqual(sampleWithoutReplacement([1, 2, 3], -5), [])
    assert.deepEqual(sampleWithoutReplacement([], 3), [])
  })

  test('actually randomises rather than taking a fixed slice', () => {
    // Over many runs every item must be reachable. A no-op shuffle (always the
    // first N) would leave the tail items unpicked forever.
    const items = ['a', 'b', 'c', 'd', 'e', 'f']
    const seen = new Set<string>()
    for (let run = 0; run < 300; run += 1) {
      for (const item of sampleWithoutReplacement(items, 2)) seen.add(item)
    }
    assert.deepEqual([...seen].sort(), [...items].sort())
  })
})

describe('MAX_DISCOVER_LIMIT', () => {
  test('is a small positive integer, so a request cannot ask for the whole index', () => {
    assert.ok(Number.isInteger(MAX_DISCOVER_LIMIT))
    assert.ok(MAX_DISCOVER_LIMIT > 0 && MAX_DISCOVER_LIMIT <= 100)
  })
})

/* ==========================================================================
   listDiscoverEvents, against a stub query builder.

   The two-tier fallback and the limit clamp are the parts worth pinning down,
   and both are observable without Postgres: the stub records every `limit()` it
   is asked for and how many queries were issued.
   ========================================================================== */

interface FakeQueryBuilder {
  selectFrom: () => FakeQueryBuilder
  selectAll: () => FakeQueryBuilder
  where: () => FakeQueryBuilder
  orderBy: () => FakeQueryBuilder
  limit: (value: number) => FakeQueryBuilder
  $if: (
    condition: boolean,
    callback: (qb: FakeQueryBuilder) => FakeQueryBuilder,
  ) => FakeQueryBuilder
  execute: () => Promise<unknown[]>
}

const fakeDb = (rows: unknown[]): { db: FakeQueryBuilder; limits: number[] } => {
  const limits: number[] = []
  const builder: FakeQueryBuilder = {
    selectFrom: () => builder,
    selectAll: () => builder,
    where: () => builder,
    orderBy: () => builder,
    limit: (value) => {
      limits.push(value)
      return builder
    },
    $if: (condition, callback) => (condition ? callback(builder) : builder),
    execute: async () => rows,
  }
  return { db: builder, limits }
}

const asDb = (builder: FakeQueryBuilder): never => builder as never

describe('listDiscoverEvents', () => {
  test('returns nothing, and never touches the database, for a non-positive limit', async () => {
    const exploding = new Proxy(
      {},
      {
        get() {
          throw new Error('the database should not be queried')
        },
      },
    ) as unknown as never

    assert.deepEqual(await listDiscoverEvents(exploding, { limit: 0 }), [])
    assert.deepEqual(await listDiscoverEvents(exploding, { limit: -3 }), [])
  })

  test('stops after the first query when there are enough upcoming events', async () => {
    const rows = Array.from({ length: 5 }, (_, index) => ({ uri: `at://x/${index}` }))
    const { db, limits } = fakeDb(rows)

    const picked = await listDiscoverEvents(asDb(db), { limit: 3 })

    assert.equal(picked.length, 3)
    assert.equal(limits.length, 1, 'should not issue a second query when the first tier fills up')
  })

  test('tops up from a second query when upcoming events run out', async () => {
    const { db, limits } = fakeDb([{ uri: 'at://x/only-one' }])

    const picked = await listDiscoverEvents(asDb(db), { limit: 4 })

    assert.equal(limits.length, 2, 'should fall back to a second query')
    assert.equal(picked.length, 2, 'one from each tier')
  })

  test('clamps an oversized limit to MAX_DISCOVER_LIMIT', async () => {
    const { db, limits } = fakeDb([{ uri: 'at://x/1' }, { uri: 'at://x/2' }])

    await listDiscoverEvents(asDb(db), { limit: 100_000 })

    assert.equal(limits[0], 200, 'the candidate pool is bounded')
    // The top-up asks for the clamped request minus what tier one already gave.
    assert.equal(limits[1], MAX_DISCOVER_LIMIT - 2)
  })
})
