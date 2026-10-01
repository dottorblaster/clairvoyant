import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import type { Env } from '../../dist/env.js'
import {
  buildClientMetadata,
  getClientId,
  getRedirectUri,
  OAUTH_SCOPE,
} from '../../dist/oauth/metadata.js'

const loopback: Env = {
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

const web: Env = {
  ...loopback,
  OAUTH_MODE: 'web',
  PUBLIC_URL: 'https://api.example.com/',
}

describe('getRedirectUri', () => {
  test('loopback redirects to 127.0.0.1 on the configured port', () => {
    assert.equal(getRedirectUri(loopback), 'http://127.0.0.1:3000/oauth/callback')
  })

  test('web uses PUBLIC_URL with trailing slashes stripped', () => {
    assert.equal(getRedirectUri(web), 'https://api.example.com/oauth/callback')
  })

  test('throws in web mode without PUBLIC_URL', () => {
    assert.throws(() => getRedirectUri({ ...web, PUBLIC_URL: undefined }), /PUBLIC_URL is required/)
  })
})

describe('getClientId', () => {
  test('loopback encodes the redirect and scope into a synthetic localhost client_id', () => {
    const clientId = getClientId(loopback)
    assert.ok(clientId.startsWith('http://localhost?'))

    const params = new URL(clientId).searchParams
    assert.equal(params.get('redirect_uri'), 'http://127.0.0.1:3000/oauth/callback')
    assert.equal(params.get('scope'), OAUTH_SCOPE)
  })

  test('web points at the served client metadata document', () => {
    assert.equal(getClientId(web), 'https://api.example.com/oauth/client-metadata.json')
  })
})

describe('buildClientMetadata', () => {
  test('describes a public DPoP client', () => {
    const metadata = buildClientMetadata(web)
    assert.equal(metadata.client_id, 'https://api.example.com/oauth/client-metadata.json')
    assert.equal(metadata.client_name, 'Clairvoyant')
    assert.equal(metadata.client_uri, 'https://api.example.com')
    assert.deepEqual(metadata.redirect_uris, ['https://api.example.com/oauth/callback'])
    assert.equal(metadata.scope, OAUTH_SCOPE)
    assert.deepEqual(metadata.grant_types, ['authorization_code', 'refresh_token'])
    assert.deepEqual(metadata.response_types, ['code'])
    assert.equal(metadata.application_type, 'web')
    assert.equal(metadata.token_endpoint_auth_method, 'none')
    assert.equal(metadata.dpop_bound_access_tokens, true)
  })

  test('loopback uses the synthetic client_id and a localhost client_uri', () => {
    const metadata = buildClientMetadata(loopback)
    assert.ok(String(metadata.client_id).startsWith('http://localhost?'))
    assert.equal(metadata.client_uri, 'http://localhost:3000')
  })
})
