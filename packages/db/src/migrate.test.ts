import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { parseDirection, runMigrateCli } from '../dist/migrate.js'

describe('parseDirection', () => {
  test('defaults to up', () => {
    assert.equal(parseDirection(undefined), 'up')
    assert.equal(parseDirection('up'), 'up')
  })

  test('reads down', () => {
    assert.equal(parseDirection('down'), 'down')
  })

  test('treats anything else as up rather than failing', () => {
    assert.equal(parseDirection('sideways'), 'up')
    assert.equal(parseDirection(''), 'up')
  })
})

describe('runMigrateCli', () => {
  test('refuses to run without DATABASE_URL and reports it', async () => {
    const errors: string[] = []
    const code = await runMigrateCli([], {}, { log: () => {}, error: (m) => errors.push(m) })

    assert.equal(code, 1)
    assert.deepEqual(errors, ['DATABASE_URL is required to run migrations.'])
  })

  test('checks for DATABASE_URL before looking at the direction', async () => {
    const errors: string[] = []
    const code = await runMigrateCli(
      ['node', 'migrate.ts', 'down'],
      {},
      { log: () => {}, error: (m) => errors.push(m) },
    )

    assert.equal(code, 1)
    assert.equal(errors.length, 1)
  })
})
