import { EVENT_COLLECTION } from '@clairvoyant/lexicons'

const DEFAULT_BASE_URL = (import.meta.env.VITE_API_BASE ?? '').replace(/\/+$/, '')

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export interface FetchResponseLike {
  ok: boolean
  status: number
  json(): Promise<unknown>
}

export interface FetchInitLike {
  method: string
  credentials: 'include'
  headers: Record<string, string>
  body?: string
}

export type FetchLike = (url: string, init: FetchInitLike) => Promise<FetchResponseLike>

export interface ApiConfig {
  fetch: FetchLike
  baseUrl: string
}

export interface EventRow {
  uri: string
  cid: string
  author_did: string
  name: string
  starts_at: string | null
  ends_at: string | null
  description: string | null
  locations: unknown
  indexed_at: string
  raw: unknown
}

export interface RsvpRow {
  uri: string
  cid: string
  author_did: string
  subject_uri: string
  status: string
  status_name: RsvpStatus | null
  indexed_at: string
}

export type MyEventRole = 'hosting' | 'going' | 'interested'

export type MyEventRow = EventRow & { role: MyEventRole }

export interface MeResponse {
  did: string
  handle: string | null
}

export type RsvpStatus = 'going' | 'notgoing' | 'interested'

export interface CreateInviteResponse {
  token: string
  eventUri: string
  inviteeHandle: string
  inviteeDid: string
  inviterHandle: string
}

export interface InviteInfo {
  valid: boolean
  reason?: string
  eventUri?: string
  inviteeHandle?: string
  inviterHandle?: string
  matchesViewer?: boolean | null
}

export interface CreateEventInput {
  name: string
  startsAt: string
  endsAt?: string
  description?: string
}

export interface Api {
  fetchMe(): Promise<MeResponse>
  fetchMyEvents(): Promise<{ events: MyEventRow[] }>
  fetchDiscoverEvents(limit?: number): Promise<{ events: EventRow[] }>
  fetchEventRsvps(uri: string): Promise<{ event: EventRow; rsvps: RsvpRow[] }>
  respondToEvent(
    uri: string,
    status: RsvpStatus,
    inviteToken: string,
  ): Promise<{ uri: string; cid: string }>
  createInvite(uri: string, handle: string): Promise<CreateInviteResponse>
  fetchInvite(token: string): Promise<InviteInfo>
  createEvent(input: CreateEventInput): Promise<{ uri: string; cid: string }>
  logout(): Promise<{ ok: boolean }>
}

export const createApiClient = ({ fetch, baseUrl }: ApiConfig): Api => {
  const request = async <T>(
    path: string,
    init?: { method?: string; body?: string },
  ): Promise<T> => {
    const headers: Record<string, string> = {}
    if (init?.body !== undefined) headers['content-type'] = 'application/json'

    const response = await fetch(`${baseUrl}${path}`, {
      method: init?.method ?? 'GET',
      credentials: 'include',
      headers,
      ...(init?.body === undefined ? {} : { body: init.body }),
    })

    if (!response.ok) {
      let message = `Request failed with status ${response.status}`
      try {
        const body = (await response.json()) as { error?: string; message?: string }
        message = body.message ?? body.error ?? message
      } catch {}
      throw new ApiError(response.status, message)
    }

    return (await response.json()) as T
  }

  return {
    fetchMe: () => request<MeResponse>('/api/me'),
    fetchMyEvents: () => request<{ events: MyEventRow[] }>('/api/me/events'),
    fetchDiscoverEvents: (limit = 6) =>
      request<{ events: EventRow[] }>(`/api/events?limit=${limit}`),
    fetchEventRsvps: (uri) =>
      request<{ event: EventRow; rsvps: RsvpRow[] }>(
        `/api/events/${encodeURIComponent(uri)}/rsvps`,
      ),
    respondToEvent: (uri, status, inviteToken) =>
      request<{ uri: string; cid: string }>(`/api/events/${encodeURIComponent(uri)}/rsvp`, {
        method: 'POST',
        body: JSON.stringify({ status, inviteToken }),
      }),
    createInvite: (uri, handle) =>
      request<CreateInviteResponse>(`/api/events/${encodeURIComponent(uri)}/invites`, {
        method: 'POST',
        body: JSON.stringify({ handle }),
      }),
    fetchInvite: (token) => request<InviteInfo>(`/api/invites/${encodeURIComponent(token)}`),
    createEvent: (input) =>
      request<{ uri: string; cid: string }>('/api/events', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    logout: () => request<{ ok: boolean }>('/oauth/logout', { method: 'POST' }),
  }
}

const defaultApi = createApiClient({
  fetch: (url, init) => globalThis.fetch(url, init),
  baseUrl: DEFAULT_BASE_URL,
})

export const {
  fetchMe,
  fetchMyEvents,
  fetchDiscoverEvents,
  fetchEventRsvps,
  respondToEvent,
  createInvite,
  fetchInvite,
  createEvent,
  logout,
} = defaultApi

export { EVENT_COLLECTION }
