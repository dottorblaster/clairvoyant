import { screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { installFetchStub, renderWithProviders } from '../../test/render'
import { EventsPage } from './EventsPage'

const row = (uri: string, name: string, startsAt: string | null, role: string) => ({
  uri,
  cid: 'cid',
  author_did: 'did:plc:author',
  name,
  starts_at: startsAt,
  ends_at: null,
  description: null,
  locations: [],
  indexed_at: '2026-01-01T00:00:00.000Z',
  raw: {},
  role,
})

const me = { path: '/api/me', status: 200, body: { did: 'did:plc:viewer', handle: 'viewer.test' } }

describe('EventsPage', () => {
  test('prompts a logged-out visitor to log in', async () => {
    installFetchStub([{ path: '/api/me', status: 401, body: { error: 'unauthenticated' } }])

    renderWithProviders(<EventsPage />)

    expect(await screen.findByText(/you are not logged in/i)).toBeTruthy()
  })

  test('groups events into upcoming, past and undated sections', async () => {
    installFetchStub([
      me,
      {
        path: '/api/me/events',
        status: 200,
        body: {
          events: [
            row('at://a/1', 'Soon', '2030-01-01T00:00:00.000Z', 'hosting'),
            row('at://a/2', 'Old', '2020-01-01T00:00:00.000Z', 'going'),
            row('at://a/3', 'Undated', null, 'interested'),
          ],
        },
      },
    ])

    renderWithProviders(<EventsPage />)

    expect(await screen.findByRole('heading', { name: 'Upcoming' })).toBeTruthy()
    expect(screen.getByText('Soon')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Past' })).toBeTruthy()
    expect(screen.getByText('Old')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'No date' })).toBeTruthy()
    expect(screen.getByText('Undated')).toBeTruthy()
    expect(screen.getByText('hosting')).toBeTruthy()
    expect(screen.getByText('interested')).toBeTruthy()
  })

  test('invites the viewer to create their first event when the list is empty', async () => {
    installFetchStub([me, { path: '/api/me/events', status: 200, body: { events: [] } }])

    renderWithProviders(<EventsPage />)

    expect(await screen.findByText(/nothing yet/i)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Create an event' })).toBeTruthy()
  })
})
