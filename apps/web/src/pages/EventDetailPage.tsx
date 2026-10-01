import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { InviteModal } from '../components/InviteModal'
import {
  EVENT_COLLECTION,
  fetchEventRsvps,
  fetchInvite,
  type RsvpStatus,
  respondToEvent,
} from '../lib/api'
import { useMe } from '../lib/useMe'

const RESPONSE_LABEL: Record<RsvpStatus, string> = {
  going: 'accepted',
  notgoing: 'declined',
  interested: 'interested',
}

export const EventDetailPage = () => {
  const params = useParams<{ did: string; rkey: string }>()
  const [searchParams] = useSearchParams()

  // Human-readable URL: /p/<author-did>/e/<event-rkey> reconstructed back into
  // the AT-URI the API and indexer work with.
  const canBuildEvent = Boolean(params.did && params.rkey)
  const eventUri = canBuildEvent ? `at://${params.did}/${EVENT_COLLECTION}/${params.rkey}` : ''
  const eventPath = canBuildEvent ? `/p/${params.did}/e/${params.rkey}` : ''
  const inviteToken = searchParams.get('invite')

  const me = useMe()
  const queryClient = useQueryClient()
  const [handleInput, setHandleInput] = useState('')
  const [response, setResponse] = useState<RsvpStatus | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)

  const query = useQuery({
    queryKey: ['event-rsvps', eventUri],
    queryFn: () => fetchEventRsvps(eventUri),
    enabled: eventUri.length > 0,
  })

  const invite = useQuery({
    queryKey: ['invite', inviteToken],
    queryFn: () => fetchInvite(inviteToken ?? ''),
    enabled: inviteToken !== null,
  })

  const respond = useMutation({
    mutationFn: (status: RsvpStatus) => respondToEvent(eventUri, status, inviteToken ?? ''),
    onSuccess: async (_result, status) => {
      setResponse(status)
      await queryClient.invalidateQueries({ queryKey: ['event-rsvps', eventUri] })
    },
  })

  const onLogin = (submitEvent: FormEvent<HTMLFormElement>) => {
    submitEvent.preventDefault()
    const returnTo = window.location.pathname + window.location.search
    const handle = handleInput.trim() || invite.data?.inviteeHandle || ''
    window.location.assign(
      `/oauth/login?handle=${encodeURIComponent(handle)}&return_to=${encodeURIComponent(returnTo)}`,
    )
  }

  if (!eventUri) {
    return (
      <section className="card">
        <p className="error">This event link is malformed.</p>
        <Link to="/events">Back to my events</Link>
      </section>
    )
  }

  if (query.isLoading) return <p>Loading event…</p>
  if (query.isError || !query.data) {
    return (
      <section className="card">
        <p className="error">This event could not be found.</p>
        <Link to="/events">Back to my events</Link>
      </section>
    )
  }

  const { event, rsvps } = query.data
  const info = invite.data
  const isInviteForMe = info?.valid === true && info.matchesViewer === true

  return (
    <section className="card">
      {info?.valid && info.inviterHandle && (
        <p className="muted">
          {info.inviterHandle} invited you
          {info.inviteeHandle ? ` as @${info.inviteeHandle}` : ''}
        </p>
      )}

      <div className="event-heading">
        <h1>{event.name}</h1>
        {me.data && (
          <button type="button" onClick={() => setInviteOpen(true)}>
            Invite
          </button>
        )}
      </div>
      <p className="muted">
        Starts {new Date(event.starts_at).toLocaleString()}
        {event.ends_at ? ` · Ends ${new Date(event.ends_at).toLocaleString()}` : ''}
      </p>

      <h2>RSVPs ({rsvps.length})</h2>
      {rsvps.length === 0 ? (
        <p>No RSVPs yet.</p>
      ) : (
        <ul className="rsvp-list">
          {rsvps.map((rsvp) => (
            <li key={rsvp.uri}>
              <code>{rsvp.author_did}</code> — <strong>{rsvp.status}</strong>
            </li>
          ))}
        </ul>
      )}

      <h2>Your response</h2>
      {response ? (
        <p>
          Thanks — your RSVP was recorded as <strong>{RESPONSE_LABEL[response]}</strong>. It will
          appear in the list once the indexer picks it up.
        </p>
      ) : !inviteToken ? (
        <p className="muted">RSVP is invite-only. Ask someone to send you an invite link.</p>
      ) : invite.isLoading ? (
        <p>Checking invite…</p>
      ) : !info?.valid ? (
        <p className="error">This invite link is not valid.</p>
      ) : info.matchesViewer === false ? (
        <p className="error">
          This invite is for @{info.inviteeHandle}. Log in as them to respond.
        </p>
      ) : info.matchesViewer === null ? (
        <form onSubmit={onLogin} className="stack">
          <p>Log in with your handle to respond.</p>
          <label htmlFor="handle">Your handle</label>
          <input
            id="handle"
            value={handleInput || info.inviteeHandle || ''}
            onChange={(event) => setHandleInput(event.target.value)}
            placeholder="alice.bsky.social"
            autoComplete="username"
            required
          />
          <button type="submit">Log in to respond</button>
        </form>
      ) : isInviteForMe ? (
        <div className="stack">
          <p>
            Responding as <code>{me.data?.handle ?? me.data?.did}</code>.
          </p>
          <div className="invite-actions">
            <button
              type="button"
              onClick={() => respond.mutate('going')}
              disabled={respond.isPending}
            >
              Accept
            </button>
            <button
              type="button"
              onClick={() => respond.mutate('notgoing')}
              disabled={respond.isPending}
            >
              Decline
            </button>
            <button
              type="button"
              onClick={() => respond.mutate('interested')}
              disabled={respond.isPending}
            >
              Interested
            </button>
          </div>
          {respond.isError && <p className="error">Could not save your RSVP. Please retry.</p>}
        </div>
      ) : null}

      <p>
        <Link to="/events">Back to my events</Link>
      </p>

      {inviteOpen && (
        <InviteModal
          eventUri={eventUri}
          eventPath={eventPath}
          onClose={() => setInviteOpen(false)}
        />
      )}
    </section>
  )
}
