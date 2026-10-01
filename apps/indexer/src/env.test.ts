import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { loadEnv } from '../dist/env.js'

const required = { DATABASE_URL: 'postgres://user:pass@127.0.0.1:5432/app' }

describe('loadEnv defaults', () => {
  test('fills in every optional value', () => {
    const env = loadEnv(required)
    assert.equal(env.NODE_ENV, 'development')
    assert.equal(env.JETSTREAM_URL, 'https://jetstream.us-west.bsky.network')
    assert.equal(env.JETSTREAM_API_KEY, undefined)
    assert.equal(env.INDEXER_START_SEQ, 0)
    assert.equal(env.LOG_LEVEL, 'info')
  })

  test('requires DATABASE_URL', () => {
    assert.throws(() => loadEnv({}), /DATABASE_URL/)
  })

  test('rejects an invalid JETSTREAM_URL', () => {
    assert.throws(() => loadEnv({ ...required, JETSTREAM_URL: 'not a url' }), /JETSTREAM_URL/)
  })

  test('formats issues with their path', () => {
    assert.throws(() => loadEnv({}), /Invalid indexer environment/)
  })
})

describe('INDEXER_START_SEQ', () => {
  test('accepts latest', () => {
    assert.equal(loadEnv({ ...required, INDEXER_START_SEQ: 'latest' }).INDEXER_START_SEQ, 'latest')
  })

  test('coerces numeric strings', () => {
    assert.equal(loadEnv({ ...required, INDEXER_START_SEQ: '500' }).INDEXER_START_SEQ, 500)
  })

  test('accepts numbers', () => {
    const withNumber = { ...required, INDEXER_START_SEQ: 42 } as unknown as NodeJS.ProcessEnv
    assert.equal(loadEnv(withNumber).INDEXER_START_SEQ, 42)

    const withZero = { ...required, INDEXER_START_SEQ: 0 } as unknown as NodeJS.ProcessEnv
    assert.equal(loadEnv(withZero).INDEXER_START_SEQ, 0)
  })

  test('rejects negative, fractional and non-numeric values', () => {
    for (const value of ['-1', '1.5', 'abc']) {
      assert.throws(() => loadEnv({ ...required, INDEXER_START_SEQ: value }), /INDEXER_START_SEQ/)
    }
  })
})
