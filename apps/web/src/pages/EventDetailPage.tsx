import { Badge, type BadgeTone, Button, Loading, Notice, Panel, TextField } from '@clairvoyant/ui'
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
import { formatEventWindow } from '../lib/format'
import { useMe } from '../lib/useMe'

const RESPONSE_LABEL: Record<RsvpStatus, string> = {
  going: 'accepted',
  notgoing: 'declined',
  interested: 'interested',
}

/** Where "back" goes depends on how the visitor got here: discover or their own list. */
const BackLink = ({ toMyEvents }: { toMyEvents: boolean }) => (
  <Link to={toMyEvents ? '/events' : '/'}>
    {toMyEvents ? 'Back to my events' : 'Back to discover'}
  </Link>
)

/**
 * The index stores RSVP status verbatim from the network, so it is either the
 * bare name or the full ref (`community.lexicon.calendar.rsvp#going`). The API
 * normalises it into `status_name`; this maps that to a tone.
 */
const rsvpTone = (name: RsvpStatus | null): BadgeTone => {
  if (name === 'going') return 'ink'
  if (name === 'notgoing') return 'muted'
  return 'default'
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
      <Panel title="Event">
        <Notice tone="error">This event link is malformed.</Notice>
        <p>
          <BackLink toMyEvents={Boolean(me.data)} />
        </p>
      </Panel>
    )
  }

  if (query.isLoading) {
    return (
      <Panel title="Event">
        <Loading>Loading event</Loading>
      </Panel>
    )
  }

  if (query.isError || !query.data) {
    return (
      <Panel title="Event">
        <Notice tone="error">This event could not be found.</Notice>
        <p>
          <BackLink toMyEvents={Boolean(me.data)} />
        </p>
      </Panel>
    )
  }

  const { event, rsvps } = query.data
  const info = invite.data
  const isInviteForMe = info?.valid === true && info.matchesViewer === true

  const renderResponse = () => {
    if (response) {
      return (
        <Notice tone="success">
          Thanks — your RSVP was recorded as <strong>{RESPONSE_LABEL[response]}</strong>. It will
          appear in the list once the indexer picks it up.
        </Notice>
      )
    }

    if (!inviteToken) {
      return <p className="muted">RSVP is invite-only. Ask someone to send you an invite link.</p>
    }

    if (invite.isLoading) return <Loading>Checking invite</Loading>

    if (!info?.valid) {
      return <Notice tone="error">This invite link is not valid.</Notice>
    }

    if (info.matchesViewer === false) {
      return (
        <Notice tone="error">
          This invite is for @{info.inviteeHandle}. Log in as them to respond.
        </Notice>
      )
    }

    if (info.matchesViewer === null) {
      return (
        <form onSubmit={onLogin} className="stack">
          <p>Log in with your handle to respond.</p>
          <TextField
            label="Your handle"
            value={handleInput || info.inviteeHandle || ''}
            onChange={(event) => setHandleInput(event.target.value)}
            placeholder="alice.bsky.social"
            autoComplete="username"
            required
          />
          <div className="cluster">
            <Button type="submit" variant="primary">
              Log in to respond
            </Button>
          </div>
        </form>
      )
    }

    if (!isInviteForMe) return null

    return (
      <div className="stack">
        <p>
          Responding as <code>{me.data?.handle ?? me.data?.did}</code>.
        </p>
        <div className="cluster">
          <Button
            variant="primary"
            icon="check"
            pending={respond.isPending}
            onClick={() => respond.mutate('going')}
          >
            Accept
          </Button>
          <Button
            icon="cross"
            pending={respond.isPending}
            onClick={() => respond.mutate('notgoing')}
          >
            Decline
          </Button>
          <Button pending={respond.isPending} onClick={() => respond.mutate('interested')}>
            Interested
          </Button>
        </div>
        {respond.isError ? (
          <Notice tone="error">Could not save your RSVP. Please retry.</Notice>
        ) : null}
      </div>
    )
  }

  return (
    <Panel
      title={event.name}
      actions={
        me.data ? (
          <Button icon="user" onClick={() => setInviteOpen(true)}>
            Invite
          </Button>
        ) : undefined
      }
      meta={formatEventWindow(event.starts_at, event.ends_at)}
    >
      {info?.valid && info.inviterHandle ? (
        <p className="muted">
          {info.inviterHandle} invited you
          {info.inviteeHandle ? ` as @${info.inviteeHandle}` : ''}
        </p>
      ) : null}

      <section className="stack stack--tight">
        <h2>RSVPs ({rsvps.length})</h2>
        {rsvps.length === 0 ? (
          <p className="muted">No RSVPs yet.</p>
        ) : (
          <ul className="data-list">
            {rsvps.map((rsvp) => (
              <li key={rsvp.uri}>
                <code className="mono">{rsvp.author_did}</code>
                {/* Falls back to the raw value so an unrecognised status is
                    shown as-is rather than silently dropped. */}
                <Badge tone={rsvpTone(rsvp.status_name)}>{rsvp.status_name ?? rsvp.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="stack stack--tight">
        <h2>Your response</h2>
        {renderResponse()}
      </section>

      <p>
        <BackLink toMyEvents={Boolean(me.data)} />
      </p>

      {inviteOpen ? (
        <InviteModal
          eventUri={eventUri}
          eventPath={eventPath}
          onClose={() => setInviteOpen(false)}
        />
      ) : null}
    </Panel>
  )
}
