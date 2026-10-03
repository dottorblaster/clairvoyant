import { fireEvent, screen, waitFor } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, test, vi } from 'vitest'
import { installFetchStub, renderRoutes } from '../../test/render'
import { navigateTo } from '../lib/navigate'
import { LoginPage } from './LoginPage'

vi.mock('../lib/navigate', () => ({
  navigateTo: vi.fn(),
  currentReturnTo: () => '/',
}))

const loginRoutes = (
  <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/events" element={<div>my events page</div>} />
  </Routes>
)

describe('LoginPage', () => {
  test('shows the handle form when logged out', async () => {
    installFetchStub([{ path: '/api/me', status: 401, body: { error: 'unauthenticated' } }])

    renderRoutes(loginRoutes, { route: '/login' })

    expect(await screen.findByLabelText('Handle')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Link up' })).toBeTruthy()
  })

  test('redirects an already-logged-in visitor to their events', async () => {
    installFetchStub([
      { path: '/api/me', status: 200, body: { did: 'did:plc:viewer', handle: 'viewer.test' } },
    ])

    renderRoutes(loginRoutes, { route: '/login' })

    expect(await screen.findByText('my events page')).toBeTruthy()
  })

  test('sends the normalized handle to the OAuth entry point', async () => {
    installFetchStub([{ path: '/api/me', status: 401, body: { error: 'unauthenticated' } }])
    const assign = vi.mocked(navigateTo)
    assign.mockClear()

    renderRoutes(loginRoutes, { route: '/login' })
    fireEvent.change(await screen.findByLabelText('Handle'), { target: { value: ' @alice.test ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Link up' }))

    await waitFor(() => expect(assign).toHaveBeenCalledWith('/oauth/login?handle=alice.test'))
  })

  test('does nothing when the handle is empty', async () => {
    installFetchStub([{ path: '/api/me', status: 401, body: { error: 'unauthenticated' } }])
    const assign = vi.mocked(navigateTo)
    assign.mockClear()

    renderRoutes(loginRoutes, { route: '/login' })
    fireEvent.click(await screen.findByRole('button', { name: 'Link up' }))

    expect(assign).not.toHaveBeenCalled()
  })
})
