import { fireEvent, screen, waitFor } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, test } from 'vitest'
import { installFetchStub, renderRoutes } from '../../test/render'
import { CreateEventPage } from './CreateEventPage'

const routes = (
  <Routes>
    <Route path="/create" element={<CreateEventPage />} />
    <Route path="/p/:did/e/:rkey" element={<div>event detail</div>} />
    <Route path="/events" element={<div>my events</div>} />
  </Routes>
)

const me = { path: '/api/me', status: 200, body: { did: 'did:plc:viewer', handle: 'viewer.test' } }

describe('CreateEventPage', () => {
  test('asks a logged-out visitor to log in', async () => {
    installFetchStub([{ path: '/api/me', status: 401, body: { error: 'unauthenticated' } }])

    renderRoutes(routes, { route: '/create' })

    expect(await screen.findByText(/need to log in before creating/i)).toBeTruthy()
  })

  test('posts the ISO fields and navigates to the new event', async () => {
    const { calls } = installFetchStub([
      me,
      {
        path: '/api/events',
        method: 'POST',
        status: 201,
        body: { uri: 'at://did:plc:viewer/community.lexicon.calendar.event/new', cid: 'cid' },
      },
    ])

    renderRoutes(routes, { route: '/create' })

    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Launch party' } })
    fireEvent.change(screen.getByLabelText('Starts at'), { target: { value: '2030-07-01T18:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create event' }))

    expect(await screen.findByText('event detail')).toBeTruthy()

    const post = calls.find((call) => call.url === '/api/events' && call.init.method === 'POST')
    expect(JSON.parse(post?.init.body ?? '{}')).toEqual({
      name: 'Launch party',
      startsAt: new Date('2030-07-01T18:00').toISOString(),
    })
  })

  test('reports a failed create', async () => {
    installFetchStub([me, { path: '/api/events', method: 'POST', status: 502, body: {} }])

    renderRoutes(routes, { route: '/create' })

    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Party' } })
    fireEvent.change(screen.getByLabelText('Starts at'), { target: { value: '2030-07-01T18:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create event' }))

    await waitFor(() => expect(screen.getByText(/could not create the event/i)).toBeTruthy())
  })
})
