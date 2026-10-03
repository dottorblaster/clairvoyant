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
  description: null,
  locations: [],
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

    expect(await screen.findByText(/that link is broken/i)).toBeTruthy()
  })

  test('reports an event that is not in the index', async () => {
    installFetchStub([unauthenticated, { path: /\/api\/events\/.*\/rsvps/, status: 404, body: {} }])
    renderWithProviders(<EventDetailPage />, { route: ROUTE, path: PATH })

    expect(await screen.findByText(/no event here/i)).toBeTruthy()
  })

  test('renders the event, its RSVPs and the invite-only notice', async () => {
    installFetchStub([unauthenticated, rsvpsOk])
    renderWithProviders(<EventDetailPage />, { route: ROUTE, path: PATH })

    expect(await screen.findByRole('heading', { name: 'Launch party' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: "Who's in (2)" })).toBeTruthy()
    expect(screen.getByText('going')).toBeTruthy()
    expect(screen.getByText('community.lexicon.calendar.rsvp#maybe')).toBeTruthy()
    expect(screen.getByText(/rsvps are invite-only/i)).toBeTruthy()
  })

  test('renders the description and locations, and offers sharing without a session', async () => {
    const detailed = {
      ...event,
      description: 'Come **celebrate** — [details](https://example.com/details)',
      locations: [
        {
          $type: 'community.lexicon.location.address',
          street: '12 Main St',
          locality: 'Springfield',
          country: 'US',
        },
        { $type: 'community.lexicon.calendar.event#uri', uri: 'https://meet.example.com/abc' },
      ],
    }
    installFetchStub([
      unauthenticated,
      { path: /\/api\/events\/.*\/rsvps/, status: 200, body: { event: detailed, rsvps } },
    ])

    renderWithProviders(<EventDetailPage />, { route: ROUTE, path: PATH })

    expect(await screen.findByText('celebrate')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'About' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'details' }).getAttribute('rel')).toContain('noopener')
    expect(screen.getByRole('heading', { name: 'Location' })).toBeTruthy()
    expect(screen.getByText('12 Main St, Springfield, US')).toBeTruthy()
    expect(screen.getByText('https://meet.example.com/abc')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Share' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Invite' })).toBeNull()
  })

  test('omits the About and Location sections when the record has neither', async () => {
    installFetchStub([unauthenticated, rsvpsOk])
    renderWithProviders(<EventDetailPage />, { route: ROUTE, path: PATH })

    await screen.findByRole('heading', { name: 'Launch party' })
    expect(screen.queryByRole('heading', { name: 'About' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Location' })).toBeNull()
  })

  test('reports an invalid invite', async () => {
    installFetchStub([unauthenticated, rsvpsOk, invite('bad', { valid: false })])
    renderWithProviders(<EventDetailPage />, { route: `${ROUTE}?invite=bad`, path: PATH })

    expect(await screen.findByText(/invite didn't work/i)).toBeTruthy()
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

    fireEvent.click(await screen.findByRole('button', { name: 'Link up to reply' }))
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

    fireEvent.click(await screen.findByRole('button', { name: "I'm in" }))

    expect(await screen.findByText(/your rsvp is in/i)).toBeTruthy()
    expect(screen.getByText('Going')).toBeTruthy()
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
