import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { CURSOR_ID, readCursor, writeCursor } from '../dist/cursor.js'

interface FakeChain {
  selectFrom: (table: string) => FakeChain
  select: (column: string) => FakeChain
  insertInto: (table: string) => FakeChain
  values: (values: unknown) => FakeChain
  where: (column: string, op: string, value: unknown) => FakeChain
  onConflict: (callback: (oc: FakeChain) => FakeChain) => FakeChain
  column: (name: string) => FakeChain
  doUpdateSet: (values: unknown) => FakeChain
  executeTakeFirst: () => Promise<unknown>
  execute: () => Promise<void>
}

const fakeDb = (firstRow: unknown) => {
  const calls = {
    selectFrom: [] as string[],
    insertInto: [] as string[],
    values: [] as unknown[],
    doUpdateSet: [] as unknown[],
    where: [] as Array<[string, string, unknown]>,
  }

  const builder: FakeChain = {
    selectFrom: (table) => {
      calls.selectFrom.push(table)
      return builder
    },
    select: () => builder,
    insertInto: (table) => {
      calls.insertInto.push(table)
      return builder
    },
    values: (values) => {
      calls.values.push(values)
      return builder
    },
    where: (column, op, value) => {
      calls.where.push([column, op, value])
      return builder
    },
    onConflict: (callback) => {
      callback(builder)
      return builder
    },
    column: () => builder,
    doUpdateSet: (values) => {
      calls.doUpdateSet.push(values)
      return builder
    },
    executeTakeFirst: async () => firstRow,
    execute: async () => undefined,
  }

  return { db: builder as unknown as never, calls }
}

describe('CURSOR_ID', () => {
  test('is the single row id the Highlander comment promises', () => {
    assert.equal(CURSOR_ID, 1)
  })
})

describe('readCursor', () => {
  test('returns 0 when no row has been written yet', async () => {
    const { db } = fakeDb(undefined)
    assert.equal(await readCursor(db), 0)
  })

  test('converts the bigint-as-string seq to a number', async () => {
    const { db } = fakeDb({ seq: '42' })
    assert.equal(await readCursor(db), 42)
  })

  test('reads from the cursor table filtered by the single row id', async () => {
    const { db, calls } = fakeDb({ seq: '7' })
    await readCursor(db)
    assert.deepEqual(calls.selectFrom, ['cursor'])
    assert.deepEqual(calls.where, [['id', '=', CURSOR_ID]])
  })
})

describe('writeCursor', () => {
  test('inserts the stringified sequence under the single row id', async () => {
    const { db, calls } = fakeDb(undefined)
    await writeCursor(db, 12345)

    assert.deepEqual(calls.insertInto, ['cursor'])
    const values = calls.values[0] as { id: number; seq: string; updated_at: Date }
    assert.equal(values.id, CURSOR_ID)
    assert.equal(values.seq, '12345')
    assert.ok(values.updated_at instanceof Date)
  })

  test('upserts on conflict so the cursor is idempotent', async () => {
    const { db, calls } = fakeDb(undefined)
    await writeCursor(db, 1)

    assert.equal(calls.doUpdateSet.length, 1)
    const update = calls.doUpdateSet[0] as { seq: string }
    assert.equal(update.seq, '1')
  })
})
