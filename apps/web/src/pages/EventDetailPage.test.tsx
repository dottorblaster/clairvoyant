import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { installFetchStub, renderWithProviders } from '../../test/render'
import { navigateTo } from '../lib/navigate'
import { EventDetailPage } from './EventDetailPage'

vi.mock('../lib/navigate', () => ({
  navigateTo: vi.fn(),
  currentReturnTo: () => '/',
}))

const EVENT_URI = 'at://did:plc:author/community.lexicon.calendar.event/abc'
const ROUTE = '/p/did:plc:author/e/abc'
const PATH = '/p/:did/e/:rkey'

const event = {
  uri: EVENT_URI,
  cid: 'cid',
  author_did: 'did:plc:author',
  name: 'Launch party',
  starts_at: '2030-07-01T18:00:00.000Z',
  ends_at: null,
  indexed_at: '2026-01-01T00:00:00.000Z',
  raw: {},
}

const rsvps = [
  {
    uri: 'at://r/1',
    cid: 'cid',
    author_did: 'did:plc:a',
    subject_uri: EVENT_URI,
    status: 'community.lexicon.calendar.rsvp#going',
    status_name: 'going',
    indexed_at: '2026-01-01T00:00:00.000Z',
  },
  {
    uri: 'at://r/2',
    cid: 'cid',
    author_did: 'did:plc:b',
    subject_uri: EVENT_URI,
    status: 'community.lexicon.calendar.rsvp#maybe',
    status_name: null,
    indexed_at: '2026-01-01T00:00:00.000Z',
  },
]

const unauthenticated = { path: '/api/me', status: 401, body: { error: 'unauthenticated' } }
const loggedIn = {
  path: '/api/me',
  status: 200,
  body: { did: 'did:plc:viewer', handle: 'viewer.test' },
}
const rsvpsOk = { path: /\/api\/events\/.*\/rsvps/, status: 200, body: { event, rsvps } }
const invite = (token: string, body: unknown) => ({
  path: `/api/invites/${encodeURIComponent(token)}`,
  status: 200,
  body,
})

describe('EventDetailPage', () => {
  test('reports a malformed event link', async () => {
    installFetchStub([unauthenticated])
    renderWithProviders(<EventDetailPage />, { route: '/p/did:plc:author', path: '/p/:did' })

    expect(await screen.findByText(/malformed/i)).toBeTruthy()
  })

  test('reports an event that is not in the index', async () => {
    installFetchStub([unauthenticated, { path: /\/api\/events\/.*\/rsvps/, status: 404, body: {} }])
    renderWithProviders(<EventDetailPage />, { route: ROUTE, path: PATH })

    expect(await screen.findByText(/could not be found/i)).toBeTruthy()
  })

  test('renders the event, its RSVPs and the invite-only notice', async () => {
    installFetchStub([unauthenticated, rsvpsOk])
    renderWithProviders(<EventDetailPage />, { route: ROUTE, path: PATH })

    expect(await screen.findByRole('heading', { name: 'Launch party' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'RSVPs (2)' })).toBeTruthy()
    expect(screen.getByText('going')).toBeTruthy()
    // An unrecognised status falls back to the raw value rather than vanishing.
    expect(screen.getByText('community.lexicon.calendar.rsvp#maybe')).toBeTruthy()
    expect(screen.getByText(/rsvp is invite-only/i)).toBeTruthy()
  })

  test('reports an invalid invite', async () => {
    installFetchStub([unauthenticated, rsvpsOk, invite('bad', { valid: false })])
    renderWithProviders(<EventDetailPage />, { route: `${ROUTE}?invite=bad`, path: PATH })

    expect(await screen.findByText(/invite link is not valid/i)).toBeTruthy()
  })

  test('tells the viewer when the invite is for someone else', async () => {
    installFetchStub([
      unauthenticated,
      rsvpsOk,
      invite('tok', { valid: true, matchesViewer: false, inviteeHandle: 'invitee.test' }),
    ])
    renderWithProviders(<EventDetailPage />, { route: `${ROUTE}?invite=tok`, path: PATH })

    expect(await screen.findByText(/this invite is for @invitee.test/i)).toBeTruthy()
  })

  test('prompts a logged-out invitee to log in, with a return path', async () => {
    installFetchStub([
      unauthenticated,
      rsvpsOk,
      invite('tok', { valid: true, matchesViewer: null, inviteeHandle: 'invitee.test' }),
    ])
    const assign = vi.mocked(navigateTo)
    assign.mockClear()

    renderWithProviders(<EventDetailPage />, { route: `${ROUTE}?invite=tok`, path: PATH })

    fireEvent.click(await screen.findByRole('button', { name: 'Log in to respond' }))
    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith(
        expect.stringContaining('/oauth/login?handle=invitee.test&return_to='),
      ),
    )
  })

  test('lets the invited viewer accept', async () => {
    const { calls } = installFetchStub([
      loggedIn,
      rsvpsOk,
      invite('tok', { valid: true, matchesViewer: true, inviteeHandle: 'viewer.test' }),
      {
        path: /\/api\/events\/.*\/rsvp/,
        method: 'POST',
        status: 201,
        body: { uri: 'at://r/new', cid: 'cid' },
      },
    ])

    renderWithProviders(<EventDetailPage />, { route: `${ROUTE}?invite=tok`, path: PATH })

    fireEvent.click(await screen.findByRole('button', { name: 'Accept' }))

    expect(await screen.findByText(/recorded as/i)).toBeTruthy()
    expect(screen.getByText('accepted')).toBeTruthy()
    const post = calls.find((call) => call.init.method === 'POST')
    expect(JSON.parse(post?.init.body ?? '{}')).toEqual({ status: 'going', inviteToken: 'tok' })
  })

  test('shows the invite control to a logged-in viewer', async () => {
    installFetchStub([loggedIn, rsvpsOk])
    renderWithProviders(<EventDetailPage />, { route: ROUTE, path: PATH })

    fireEvent.click(await screen.findByRole('button', { name: 'Invite' }))
    expect(await screen.findByText('Invite someone')).toBeTruthy()
  })
})
