import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type RenderResult, render } from '@testing-library/react'
import { createElement, type ReactElement, type ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { FetchInitLike } from '../src/lib/api'

export interface StubRoute {
  path: string | RegExp
  method?: string
  status?: number
  body?: unknown
}

export interface StubCall {
  url: string
  init: FetchInitLike
}

export const installFetchStub = (routes: StubRoute[]): { calls: StubCall[] } => {
  const calls: StubCall[] = []

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    const call: StubCall = {
      url,
      init: {
        method: init?.method ?? 'GET',
        credentials: 'include',
        headers: (init?.headers as Record<string, string>) ?? {},
        body: typeof init?.body === 'string' ? init.body : undefined,
      },
    }
    calls.push(call)

    const route = routes.find((candidate) => {
      const matchesPath =
        typeof candidate.path === 'string' ? candidate.path === url : candidate.path.test(url)
      const matchesMethod = candidate.method === undefined || candidate.method === call.init.method
      return matchesPath && matchesMethod
    })

    if (!route) throw new Error(`No fetch stub for ${call.init.method} ${url}`)

    const status = route.status ?? 200
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => route.body ?? {},
    } as Response
  }) as typeof fetch

  return { calls }
}

interface RenderOptions {
  route?: string
  path?: string
}

export const renderWithProviders = (
  ui: ReactElement,
  { route = '/', path = '*' }: RenderOptions = {},
): RenderResult => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  })

  return render(
    createElement(
      QueryClientProvider,
      { client },
      createElement(
        MemoryRouter,
        { initialEntries: [route] },
        createElement(Routes, null, createElement(Route, { path, element: ui })),
      ),
    ),
  )
}

export const renderRoutes = (
  children: ReactNode,
  { route = '/' }: { route?: string } = {},
): RenderResult => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  })

  return render(
    createElement(
      QueryClientProvider,
      { client },
      createElement(MemoryRouter, { initialEntries: [route] }, children),
    ),
  )
}
