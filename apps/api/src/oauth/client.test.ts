import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { createDb } from '@clairvoyant/db'
import type { Env } from '../../dist/env.js'
import { createOAuthClient } from '../../dist/oauth/client.js'

const base: Env = {
  NODE_ENV: 'test',
  PORT: 3000,
  DATABASE_URL: 'postgres://unused',
  OAUTH_MODE: 'loopback',
  PUBLIC_URL: undefined,
  WEB_ORIGIN: 'http://127.0.0.1:5173',
  COOKIE_SECRET: 'a'.repeat(32),
  COOKIE_NAME: 'clairvoyant_session',
  LOG_LEVEL: 'error',
}

const UNREACHABLE = 'postgres://user:pass@127.0.0.1:1/none'

describe('createOAuthClient', () => {
  test('constructs a client exposing the OAuth surface in loopback mode', async () => {
    const db = createDb({ connectionString: UNREACHABLE })
    try {
      const client = createOAuthClient(base, db)
      assert.equal(typeof client.authorize, 'function')
      assert.equal(typeof client.callback, 'function')
      assert.equal(typeof client.restore, 'function')
      assert.equal(typeof client.revoke, 'function')
    } finally {
      await db.destroy()
    }
  })

  test('constructs a client in web mode', async () => {
    const db = createDb({ connectionString: UNREACHABLE })
    try {
      const client = createOAuthClient(
        { ...base, OAUTH_MODE: 'web', PUBLIC_URL: 'https://api.example.com' },
        db,
      )
      assert.equal(typeof client.authorize, 'function')
    } finally {
      await db.destroy()
    }
  })
})
