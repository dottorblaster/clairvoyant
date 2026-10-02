import { createServer, type Server } from 'node:http'
import type { Logger } from './logger.js'

export const DEFAULT_HEALTH_STALE_MS = 10 * 60_000

export interface IndexerHealthState {
  connected: boolean
  lastSeq: number | null
  lastEventAt: number | null
}

export interface IndexerHealthReporter {
  state(): IndexerHealthState
  markConnected(): void
  markDisconnected(): void
  markEvent(seq: number): void
}

export interface IndexerHealthOptions {
  now?: () => number
}

export const createIndexerHealth = (options: IndexerHealthOptions = {}): IndexerHealthReporter => {
  const now = options.now ?? Date.now
  const state: IndexerHealthState = { connected: false, lastSeq: null, lastEventAt: null }

  return {
    state: () => ({ ...state }),
    markConnected() {
      state.connected = true
    },
    markDisconnected() {
      state.connected = false
    },
    markEvent(seq) {
      state.connected = true
      state.lastSeq = seq
      state.lastEventAt = now()
    },
  }
}

export interface HealthResponse {
  status: number
  body: Record<string, unknown>
}

export const evaluateHealth = (
  path: string,
  state: IndexerHealthState,
  now: number,
  staleMs: number = DEFAULT_HEALTH_STALE_MS,
): HealthResponse => {
  if (path === '/health') {
    return { status: 200, body: { ok: true, connected: state.connected } }
  }

  if (path === '/ready') {
    const idleMs = state.lastEventAt === null ? null : now - state.lastEventAt
    const ready = state.connected && idleMs !== null && idleMs <= staleMs
    return {
      status: ready ? 200 : 503,
      body: { ok: ready, connected: state.connected, seq: state.lastSeq, idleMs },
    }
  }

  return { status: 404, body: { error: 'not_found' } }
}

export interface StartHealthServerOptions {
  port: number
  health: IndexerHealthReporter
  log: Logger
  now?: () => number
  staleMs?: number
}

export const startHealthServer = (options: StartHealthServerOptions): Promise<Server> =>
  new Promise((resolve) => {
    const now = options.now ?? Date.now
    const server = createServer((request, response) => {
      const result = evaluateHealth(
        request.url ?? '/',
        options.health.state(),
        now(),
        options.staleMs,
      )
      response.writeHead(result.status, { 'content-type': 'application/json' })
      response.end(JSON.stringify(result.body))
    })

    server.listen(options.port, () => {
      options.log.info('indexer health server listening', { port: options.port })
      resolve(server)
    })
  })

export const closeHealthServer = (server: Server): Promise<void> =>
  new Promise((resolve) => {
    server.close(() => resolve())
  })
