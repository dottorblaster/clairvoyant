import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { migrationProvider, migrations } from '../dist/migrations.js'

describe('migration registry', () => {
  test('contains every migration in order', () => {
    assert.deepEqual(Object.keys(migrations), [
      '001_event',
      '002_rsvp',
      '003_auth',
      '004_cursor',
      '005_invite',
      '006_event_details',
    ])
  })

  test('every migration exposes both up and down', () => {
    for (const [name, migration] of Object.entries(migrations)) {
      assert.equal(typeof migration.up, 'function', `${name}.up must be a function`)
      assert.equal(typeof migration.down, 'function', `${name}.down must be a function`)
    }
  })

  test('the provider returns the same registry', async () => {
    assert.equal(await migrationProvider.getMigrations(), migrations)
  })
})
