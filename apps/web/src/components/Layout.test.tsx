import { fireEvent, screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, test } from 'vitest'
import { installFetchStub, renderRoutes } from '../../test/render'
import { Layout } from './Layout'

const routes = (
  <Routes>
    <Route element={<Layout />}>
      <Route path="/" element={<div>home content</div>} />
      <Route path="/login" element={<div>login content</div>} />
    </Route>
  </Routes>
)

describe('Layout', () => {
  test('renders the primary navigation and a log-in link when logged out', async () => {
    installFetchStub([{ path: '/api/me', status: 401, body: { error: 'unauthenticated' } }])

    renderRoutes(routes, { route: '/' })

    expect(screen.getByRole('navigation', { name: 'Main' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Discover' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'My events' })).toBeTruthy()
    expect(await screen.findByRole('link', { name: 'Log in' })).toBeTruthy()
  })

  test('shows the account and logs out', async () => {
    const { calls } = installFetchStub([
      {
        path: '/api/me',
        status: 200,
        body: { did: 'did:plc:viewer', handle: 'viewer.test' },
      },
      { path: '/oauth/logout', method: 'POST', status: 200, body: { ok: true } },
    ])

    renderRoutes(routes, { route: '/' })

    expect(await screen.findByText('viewer.test')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }))

    expect(await screen.findByText('login content')).toBeTruthy()
    expect(calls.some((call) => call.url === '/oauth/logout' && call.init.method === 'POST')).toBe(
      true,
    )
  })
})
