import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createOAuthStores } from '../../dist/oauth/store.js'

interface Calls {
  selectFrom: string[]
  insertInto: string[]
  deleteFrom: string[]
  values: unknown[]
  where: Array<[string, string, unknown]>
  doUpdateSet: unknown[]
}

interface FakeBuilder {
  selectFrom(table: string): FakeBuilder
  select(column: string): FakeBuilder
  insertInto(table: string): FakeBuilder
  deleteFrom(table: string): FakeBuilder
  values(values: unknown): FakeBuilder
  where(column: string, op: string, value: unknown): FakeBuilder
  onConflict(callback: (oc: FakeBuilder) => FakeBuilder): FakeBuilder
  column(name: string): FakeBuilder
  doUpdateSet(values: unknown): FakeBuilder
  executeTakeFirst(): Promise<unknown>
  execute(): Promise<void>
}

/** Minimal Kysely stand-in covering the SimpleStore get/set/del shape. */
const fakeDb = (row?: { value: unknown }) => {
  const calls: Calls = {
    selectFrom: [],
    insertInto: [],
    deleteFrom: [],
    values: [],
    where: [],
    doUpdateSet: [],
  }

  const builder: FakeBuilder = {
    selectFrom: (table: string) => {
      calls.selectFrom.push(table)
      return builder
    },
    select: () => builder,
    insertInto: (table: string) => {
      calls.insertInto.push(table)
      return builder
    },
    deleteFrom: (table: string) => {
      calls.deleteFrom.push(table)
      return builder
    },
    values: (values: unknown) => {
      calls.values.push(values)
      return builder
    },
    where: (column: string, op: string, value: unknown) => {
      calls.where.push([column, op, value])
      return builder
    },
    onConflict: (callback: (oc: typeof builder) => typeof builder) => {
      callback(builder)
      return builder
    },
    column: () => builder,
    doUpdateSet: (values: unknown) => {
      calls.doUpdateSet.push(values)
      return builder
    },
    executeTakeFirst: async () => row,
    execute: async () => undefined,
  }

  return { db: builder as unknown as never, calls }
}

describe('state store', () => {
  test('get returns undefined when the key is absent', async () => {
    const { db, calls } = fakeDb(undefined)
    const { stateStore } = createOAuthStores(db)
    assert.equal(await stateStore.get('k'), undefined)
    assert.deepEqual(calls.selectFrom, ['auth_state'])
    assert.deepEqual(calls.where, [['key', '=', 'k']])
  })

  test('get returns the stored JSON value', async () => {
    const { db } = fakeDb({ value: { nonce: 'abc' } })
    const { stateStore } = createOAuthStores(db)
    assert.deepEqual(await stateStore.get('k'), { nonce: 'abc' })
  })

  test('set upserts into auth_state with a timestamp', async () => {
    const { db, calls } = fakeDb(undefined)
    const { stateStore } = createOAuthStores(db)
    await stateStore.set('k', { nonce: 'abc' } as never)

    assert.deepEqual(calls.insertInto, ['auth_state'])
    const values = calls.values[0] as { key: string; value: unknown; updated_at: Date }
    assert.equal(values.key, 'k')
    assert.deepEqual(values.value, { nonce: 'abc' })
    assert.ok(values.updated_at instanceof Date)
    assert.equal(calls.doUpdateSet.length, 1)
  })

  test('del removes the key from auth_state', async () => {
    const { db, calls } = fakeDb(undefined)
    const { stateStore } = createOAuthStores(db)
    await stateStore.del('k')
    assert.deepEqual(calls.deleteFrom, ['auth_state'])
    assert.deepEqual(calls.where, [['key', '=', 'k']])
  })
})

describe('session store', () => {
  test('reads and writes auth_session', async () => {
    const { db, calls } = fakeDb({ value: { did: 'did:plc:x' } })
    const { sessionStore } = createOAuthStores(db)

    assert.deepEqual(await sessionStore.get('did:plc:x'), { did: 'did:plc:x' })
    assert.deepEqual(calls.selectFrom, ['auth_session'])

    await sessionStore.set('did:plc:x', { did: 'did:plc:x' } as never)
    assert.deepEqual(calls.insertInto, ['auth_session'])

    await sessionStore.del('did:plc:x')
    assert.deepEqual(calls.deleteFrom, ['auth_session'])
  })
})
