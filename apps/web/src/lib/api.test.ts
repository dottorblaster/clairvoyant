import { describe, expect, test } from 'vitest'
import { ApiError, createApi, type FetchInitLike, type FetchResponseLike } from './api'

interface Call {
  url: string
  init: FetchInitLike
}

const response = (
  body: unknown,
  init: { ok?: boolean; status?: number } = {},
): FetchResponseLike => ({
  ok: init.ok ?? true,
  status: init.status ?? 200,
  json: async () => body,
})

const setup = (impl: (call: Call) => FetchResponseLike = () => response({}), baseUrl = '') => {
  const calls: Call[] = []
  const api = createApi({
    baseUrl,
    fetch: async (url, init) => {
      const call = { url, init }
      calls.push(call)
      return impl(call)
    },
  })
  return { api, calls }
}

describe('request behaviour', () => {
  test('prefixes the base URL and sends credentials', async () => {
    const { api, calls } = setup(() => response({ did: 'did:plc:x', handle: null }), '/api-base')

    await api.fetchMe()

    expect(calls[0]?.url).toBe('/api-base/api/me')
    expect(calls[0]?.init.method).toBe('GET')
    expect(calls[0]?.init.credentials).toBe('include')
    expect(calls[0]?.init.headers).toEqual({})
    expect(calls[0]?.init.body).toBeUndefined()
  })

  test('sets a JSON content type only when there is a body', async () => {
    const { api, calls } = setup(() => response({ ok: true }))

    await api.fetchMe()
    expect(calls[0]?.init.headers['content-type']).toBeUndefined()

    await api.logout()
    expect(calls[1]?.init.method).toBe('POST')
    expect(calls[1]?.init.headers['content-type']).toBeUndefined()

    await api.createEvent({ name: 'Party', startsAt: '2026-01-01T00:00:00Z' })
    expect(calls[2]?.init.headers['content-type']).toBe('application/json')
  })
})

describe('error handling', () => {
  test('throws an ApiError carrying the status and message', async () => {
    const { api } = setup(() => response({ message: 'nope' }, { ok: false, status: 400 }))

    await expect(api.fetchMe()).rejects.toMatchObject({
      name: 'ApiError',
      status: 400,
      message: 'nope',
    })
  })

  test('falls back to the error field', async () => {
    const { api } = setup(() => response({ error: 'unauthenticated' }, { ok: false, status: 401 }))

    await expect(api.fetchMe()).rejects.toThrow('unauthenticated')
  })

  test('keeps the default message for a non-JSON body', async () => {
    const { api } = setup(() => ({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error('not json')
      },
    }))

    const error = await api.fetchMe().catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).message).toBe('Request failed with status 502')
  })
})

describe('endpoints', () => {
  test('fetchDiscoverEvents defaults to six and honours a limit', async () => {
    const { api, calls } = setup(() => response({ events: [] }))

    await api.fetchDiscoverEvents()
    await api.fetchDiscoverEvents(3)

    expect(calls[0]?.url).toBe('/api/events?limit=6')
    expect(calls[1]?.url).toBe('/api/events?limit=3')
  })

  test('encodes the event URI and token in the path', async () => {
    const uri = 'at://did:plc:x/community.lexicon.calendar.event/abc'
    const { api, calls } = setup(() => response({}))

    await api.fetchEventRsvps(uri)
    await api.fetchInvite('tok en')
    await api.createInvite(uri, 'a.test')

    expect(calls[0]?.url).toBe(`/api/events/${encodeURIComponent(uri)}/rsvps`)
    expect(calls[1]?.url).toBe(`/api/invites/${encodeURIComponent('tok en')}`)
    expect(calls[2]?.url).toBe(`/api/events/${encodeURIComponent(uri)}/invites`)
  })

  test('posts the RSVP status and invite token as JSON', async () => {
    const { api, calls } = setup(() => response({ uri: 'at://r', cid: 'c' }))

    await api.respondToEvent('at://e', 'going', 'tok')

    expect(calls[0]?.init.body).toBe(JSON.stringify({ status: 'going', inviteToken: 'tok' }))
  })

  test('posts createEvent fields as JSON', async () => {
    const { api, calls } = setup(() => response({ uri: 'at://e', cid: 'c' }))

    await api.createEvent({ name: 'Party', startsAt: '2026-01-01T00:00:00Z' })

    expect(calls[0]?.url).toBe('/api/events')
    expect(calls[0]?.init.body).toBe(
      JSON.stringify({ name: 'Party', startsAt: '2026-01-01T00:00:00Z' }),
    )
  })
})
