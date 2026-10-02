import { screen, waitFor } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { installFetchStub, renderWithProviders } from '../../test/render'
import { HomePage } from './HomePage'

const event = {
  uri: 'at://did:plc:author/community.lexicon.calendar.event/abc',
  cid: 'cid',
  author_did: 'did:plc:author',
  name: 'Launch party',
  starts_at: '2026-07-01T18:00:00.000Z',
  ends_at: null,
  description: null,
  locations: [],
  indexed_at: '2026-01-01T00:00:00.000Z',
  raw: {},
}

const stubs = (
  me: { status: number; body: unknown },
  events: { status: number; body: unknown },
) => [
  { path: '/api/me', status: me.status, body: me.body },
  { path: /\/api\/events\?limit=\d+/, status: events.status, body: events.body },
]

describe('HomePage', () => {
  test('shows the discover list and a call to action for a logged-out visitor', async () => {
    installFetchStub(
      stubs(
        { status: 401, body: { error: 'unauthenticated' } },
        { status: 200, body: { events: [event] } },
      ),
    )

    renderWithProviders(<HomePage />)

    const link = await screen.findByRole('link', { name: 'Launch party' })
    expect(link.getAttribute('href')).toBe('/p/did:plc:author/e/abc')
    expect(screen.getByRole('link', { name: /log in with your handle/i })).toBeTruthy()
  })

  test('invites a logged-in visitor to their own events', async () => {
    installFetchStub(
      stubs(
        { status: 200, body: { did: 'did:plc:viewer', handle: 'viewer.test' } },
        { status: 200, body: { events: [event] } },
      ),
    )

    renderWithProviders(<HomePage />)

    expect(await screen.findByRole('link', { name: 'See your own events' })).toBeTruthy()
  })

  test('explains an empty index', async () => {
    installFetchStub(
      stubs(
        { status: 401, body: { error: 'unauthenticated' } },
        { status: 200, body: { events: [] } },
      ),
    )

    renderWithProviders(<HomePage />)

    expect(await screen.findByText(/nothing indexed yet/i)).toBeTruthy()
  })

  test('reports a failed discover request', async () => {
    installFetchStub(
      stubs(
        { status: 401, body: { error: 'unauthenticated' } },
        { status: 500, body: { error: 'boom' } },
      ),
    )

    renderWithProviders(<HomePage />)

    await waitFor(() => expect(screen.getByText('Could not load events.')).toBeTruthy())
  })
})
