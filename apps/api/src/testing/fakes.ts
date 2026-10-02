import type {
  DiscoverEventsOptions,
  EventRow,
  InviteInput,
  InviteRow,
  ParticipatingEventRow,
  RsvpRow,
} from '@clairvoyant/db'
import { createApp } from '../app.js'
import type { AppDeps } from '../context.js'
import type { Env } from '../env.js'
import type { Logger, LogLevel } from '../logger.js'
import type { OAuthClient } from '../oauth/client.js'
import type { PdsAgent, PdsPort } from '../pds.js'
import { createRateLimiters, type RateLimiters } from '../rate-limit.js'
import { serializeSession } from '../session-cookie.js'
import type { Store } from '../store.js'

export const testEnv = (overrides: Partial<Env> = {}): Env => ({
  NODE_ENV: 'test',
  PORT: 3000,
  DATABASE_URL: 'postgres://unused',
  OAUTH_MODE: 'loopback',
  PUBLIC_URL: undefined,
  WEB_ORIGIN: 'http://127.0.0.1:5173',
  COOKIE_SECRET: 'a'.repeat(32),
  COOKIE_NAME: 'clairvoyant_session',
  LOG_LEVEL: 'error',
  ...overrides,
})

export interface CapturedLog {
  level: LogLevel
  message: string
  meta?: Record<string, unknown>
}

export const createFakeLogger = (): { logger: Logger; entries: CapturedLog[] } => {
  const entries: CapturedLog[] = []
  const make =
    (level: LogLevel) =>
    (message: string, meta?: Record<string, unknown>): void => {
      entries.push({ level, message, meta })
    }

  return {
    logger: { debug: make('debug'), info: make('info'), warn: make('warn'), error: make('error') },
    entries,
  }
}

export interface FakeStoreSeed {
  events?: EventRow[]
  participating?: ParticipatingEventRow[]
  rsvps?: RsvpRow[]
  invites?: InviteRow[]
  discover?: EventRow[]
  failCreateInvite?: Error
  failPing?: Error
}

export const createFakeStore = (seed: FakeStoreSeed = {}) => {
  const calls = {
    getEventByUri: [] as string[],
    listEventsByAuthor: [] as string[],
    listEventsForParticipant: [] as string[],
    listRsvpsForEvent: [] as string[],
    listDiscoverEvents: [] as DiscoverEventsOptions[],
    createInvite: [] as InviteInput[],
  }

  const invites = new Map<string, InviteRow>(
    (seed.invites ?? []).map((invite) => [invite.token_hash, invite]),
  )

  const store: Store = {
    async getEventByUri(uri) {
      calls.getEventByUri.push(uri)
      return (seed.events ?? []).find((event) => event.uri === uri)
    },
    async listEventsByAuthor(did) {
      calls.listEventsByAuthor.push(did)
      return (seed.events ?? []).filter((event) => event.author_did === did)
    },
    async listEventsForParticipant(did) {
      calls.listEventsForParticipant.push(did)
      return seed.participating ?? []
    },
    async listRsvpsForEvent(uri) {
      calls.listRsvpsForEvent.push(uri)
      return (seed.rsvps ?? []).filter((rsvp) => rsvp.subject_uri === uri)
    },
    async listDiscoverEvents(options) {
      calls.listDiscoverEvents.push(options)
      return (seed.discover ?? []).slice(0, options.limit)
    },
    async createInvite(input) {
      calls.createInvite.push(input)
      if (seed.failCreateInvite) throw seed.failCreateInvite
      invites.set(input.tokenHash, {
        token_hash: input.tokenHash,
        event_uri: input.eventUri,
        invitee_did: input.inviteeDid,
        invitee_handle: input.inviteeHandle,
        inviter_did: input.inviterDid,
        inviter_handle: input.inviterHandle,
        created_at: new Date(),
      })
    },
    async getInviteByTokenHash(tokenHash) {
      return invites.get(tokenHash)
    },
    async ping() {
      if (seed.failPing) throw seed.failPing
    },
  }

  return { store, calls, invites }
}

export interface FakePdsOptions {
  agents?: Record<string, Partial<PdsAgent>>
  defaultAgent?: Partial<PdsAgent>
  failRestore?: Error
}

export const createFakePds = (options: FakePdsOptions = {}) => {
  const calls: { withAgent: string[]; agents: PdsAgent[] } = { withAgent: [], agents: [] }

  const pds: PdsPort = {
    async withAgent(did, run) {
      calls.withAgent.push(did)
      if (options.failRestore) throw options.failRestore

      const agent: PdsAgent = {
        listRecords: async () => ({ records: [] }),
        createRecord: async () => ({ uri: 'at://did:plc:viewer/col/new', cid: 'cid-new' }),
        putRecord: async (input) => ({
          uri: `at://did:plc:viewer/col/${input.rkey}`,
          cid: 'cid-put',
        }),
        getSession: async () => ({ handle: 'viewer.test' }),
        resolveHandle: async () => 'did:plc:invitee',
        ...options.defaultAgent,
        ...(options.agents?.[did] ?? {}),
      }

      calls.agents.push(agent)
      return run(agent)
    },
  }

  return { pds, calls }
}

export interface TestAppOptions {
  env?: Env
  store?: Store
  pds?: PdsPort
  log?: Logger
  oauth?: Partial<OAuthClient>
  limits?: RateLimiters
}

export const createTestApp = (options: TestAppOptions = {}) => {
  const env = options.env ?? testEnv()
  const log = options.log ?? createFakeLogger().logger

  const oauth = {
    authorize: async () => new URL('https://pds.example/oauth/authorize?client_id=x'),
    callback: async () => ({ session: { did: 'did:plc:viewer' }, state: 'state' }),
    restore: async () => ({ did: 'did:plc:viewer' }),
    revoke: async () => undefined,
    ...options.oauth,
  } as unknown as OAuthClient

  const deps: AppDeps = {
    env,
    oauth,
    store: options.store ?? createFakeStore().store,
    pds: options.pds ?? createFakePds().pds,
    log,
    limits: options.limits ?? createRateLimiters(),
  }

  return { app: createApp(deps), deps, env, oauth }
}

export const cookieFor = (env: Env, did = 'did:plc:viewer'): { Cookie: string } => ({
  Cookie: `${env.COOKIE_NAME}=${serializeSession(env.COOKIE_SECRET, did)}`,
})
