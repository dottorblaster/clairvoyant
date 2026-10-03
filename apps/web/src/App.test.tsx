import { screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { installFetchStub, renderRoutes } from '../test/render'
import { App } from './App'

const stubs = [
  { path: '/api/me', status: 401, body: { error: 'unauthenticated' } },
  { path: /\/api\/events\?limit=\d+/, status: 200, body: { events: [] } },
]

describe('App routing', () => {
  test('renders the discover page at the root', async () => {
    installFetchStub(stubs)
    renderRoutes(<App />, { route: '/' })

    expect(await screen.findByRole('heading', { name: 'Game rack' })).toBeTruthy()
  })

  test('renders a not-found page for an unknown route', async () => {
    installFetchStub(stubs)
    renderRoutes(<App />, { route: '/does-not-exist' })

    expect(await screen.findByText(/nothing here/i)).toBeTruthy()
  })
})
