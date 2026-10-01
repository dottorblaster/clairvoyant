import { EVENT_COLLECTION } from '@clairvoyant/lexicons'

const API_BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/+$/, '')

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

interface RequestInitLite {
  method?: string
  body?: string
}

const request = async <T>(path: string, init?: RequestInitLite): Promise<T> => {
  const headers: Record<string, string> = {}
  if (init?.body !== undefined) headers['content-type'] = 'application/json'

  const response = await fetch(`${API_BASE}${path}`, {
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
    } catch {
      // Non-JSON error body; keep the default message.
    }
    throw new ApiError(response.status, message)
  }

  return (await response.json()) as T
}

// These mirror the shapes returned by apps/api (which in turn mirror the
// `@clairvoyant/db` row types). Lexicon collection identifiers come from the
// generated `@clairvoyant/lexicons` package.
export interface EventRow {
  uri: string
  cid: string
  author_did: string
  name: string
  /** Optional in the lexicon, so the index really can hold an undated event. */
  starts_at: string | null
  ends_at: string | null
  indexed_at: string
  raw: unknown
}

export interface RsvpRow {
  uri: string
  cid: string
  author_did: string
  subject_uri: string
  status: string
  indexed_at: string
}

export interface MeResponse {
  did: string
  handle: string | null
}

export const fetchMe = (): Promise<MeResponse> => request<MeResponse>('/api/me')

export const fetchMyEvents = (): Promise<{ events: EventRow[] }> =>
  request<{ events: EventRow[] }>('/api/me/events')

/**
 * The public discover feed: upcoming events, randomly sampled, topped up with
 * recent ones. Needs no session, so the homepage works for a cold visitor.
 */
export const fetchDiscoverEvents = (limit = 6): Promise<{ events: EventRow[] }> =>
  request<{ events: EventRow[] }>(`/api/events?limit=${limit}`)

export const fetchEventRsvps = (uri: string): Promise<{ event: EventRow; rsvps: RsvpRow[] }> =>
  request<{ event: EventRow; rsvps: RsvpRow[] }>(`/api/events/${encodeURIComponent(uri)}/rsvps`)

export type RsvpStatus = 'going' | 'notgoing' | 'interested'

/** Writes an RSVP record to the signed-in user's PDS; the indexer projects it. */
export const respondToEvent = (
  uri: string,
  status: RsvpStatus,
  inviteToken: string,
): Promise<{ uri: string; cid: string }> =>
  request<{ uri: string; cid: string }>(`/api/events/${encodeURIComponent(uri)}/rsvp`, {
    method: 'POST',
    body: JSON.stringify({ status, inviteToken }),
  })

export interface CreateInviteResponse {
  token: string
  eventUri: string
  inviteeHandle: string
  inviteeDid: string
  inviterHandle: string
}

/** Mint a per-person invite bound to the DID behind `handle`. */
export const createInvite = (uri: string, handle: string): Promise<CreateInviteResponse> =>
  request<CreateInviteResponse>(`/api/events/${encodeURIComponent(uri)}/invites`, {
    method: 'POST',
    body: JSON.stringify({ handle }),
  })

export interface InviteInfo {
  valid: boolean
  reason?: string
  eventUri?: string
  inviteeHandle?: string
  inviterHandle?: string
  /** null when nobody is logged in. */
  matchesViewer?: boolean | null
}

export const fetchInvite = (token: string): Promise<InviteInfo> =>
  request<InviteInfo>(`/api/invites/${encodeURIComponent(token)}`)

export interface CreateEventInput {
  name: string
  startsAt: string
  endsAt?: string
  description?: string
}

export const createEvent = (input: CreateEventInput): Promise<{ uri: string; cid: string }> =>
  request<{ uri: string; cid: string }>('/api/events', {
    method: 'POST',
    body: JSON.stringify(input),
  })

export const logout = (): Promise<{ ok: boolean }> =>
  request<{ ok: boolean }>('/oauth/logout', { method: 'POST' })

export { EVENT_COLLECTION }
