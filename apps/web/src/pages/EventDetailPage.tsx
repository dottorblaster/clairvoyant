import { formatEventLocations } from '@clairvoyant/lexicons'
import { Badge, Button, Loading, Notice, Panel, TextField } from '@clairvoyant/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { InviteModal } from '../components/InviteModal'
import { Markdown } from '../components/Markdown'
import { ShareButton } from '../components/ShareButton'
import { fetchEventRsvps, fetchInvite, type RsvpStatus, respondToEvent } from '../lib/api'
import { buildEventPath, buildEventUri } from '../lib/eventUri'
import { formatEventWindow } from '../lib/format'
import { buildLoginUrl, normalizeHandle } from '../lib/handle'
import { currentReturnTo, navigateTo } from '../lib/navigate'
import { RESPONSE_LABEL, rsvpTone } from '../lib/roles'
import { useMe } from '../lib/useMe'

const BackLink = ({ toMyEvents }: { toMyEvents: boolean }) => (
  <Link to={toMyEvents ? '/events' : '/'}>
    {toMyEvents ? 'Back to my shelf' : 'Back to the rack'}
  </Link>
)

export const EventDetailPage = () => {
  const params = useParams<{ did: string; rkey: string }>()
  const [searchParams] = useSearchParams()

  const did = params.did
  const rkey = params.rkey
  const eventUri = did && rkey ? buildEventUri(did, rkey) : ''
  const eventPath = did && rkey ? buildEventPath(did, rkey) : ''
  // Built from the path, not the location, so a shared link never leaks the ?invite= token.
  const shareUrl = eventPath === '' ? '' : `${window.location.origin}${eventPath}`
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
    const handle = normalizeHandle(handleInput) || invite.data?.inviteeHandle || ''
    navigateTo(buildLoginUrl(handle, currentReturnTo()))
  }

  if (!eventUri) {
    return (
      <Panel title="Event">
        <Notice tone="error">That link is broken.</Notice>
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
        <Notice tone="error">No event here.</Notice>
        <p>
          <BackLink toMyEvents={Boolean(me.data)} />
        </p>
      </Panel>
    )
  }

  const { event, rsvps } = query.data
  const locations = formatEventLocations(event.locations)
  const info = invite.data
  const isInviteForMe = info?.valid === true && info.matchesViewer === true

  const renderResponse = () => {
    if (response) {
      return (
        <Notice tone="success">
          Your RSVP is in: <strong>{RESPONSE_LABEL[response]}</strong>.
        </Notice>
      )
    }

    if (!inviteToken) {
      return <p className="muted">RSVPs are invite-only. Someone has to send you a link.</p>
    }

    if (invite.isLoading) return <Loading>Checking invite</Loading>

    if (!info?.valid) {
      return <Notice tone="error">That invite didn't work.</Notice>
    }

    if (info.matchesViewer === false) {
      return (
        <Notice tone="error">
          This invite is for @{info.inviteeHandle}. Link up as them to reply.
        </Notice>
      )
    }

    if (info.matchesViewer === null) {
      return (
        <form onSubmit={onLogin} className="stack">
          <p>Link up to reply.</p>
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
              Link up to reply
            </Button>
          </div>
        </form>
      )
    }

    if (!isInviteForMe) return null

    return (
      <div className="stack">
        <p>
          Playing as <code>{me.data?.handle ?? me.data?.did}</code>.
        </p>
        <div className="cluster">
          <Button
            variant="primary"
            icon="check"
            pending={respond.isPending}
            onClick={() => respond.mutate('going')}
          >
            I'm in
          </Button>
          <Button
            icon="cross"
            pending={respond.isPending}
            onClick={() => respond.mutate('notgoing')}
          >
            Can't go
          </Button>
          <Button pending={respond.isPending} onClick={() => respond.mutate('interested')}>
            Maybe
          </Button>
        </div>
        {respond.isError ? <Notice tone="error">RSVP didn't stick.</Notice> : null}
      </div>
    )
  }

  return (
    <Panel
      title={event.name}
      actions={
        <>
          <ShareButton url={shareUrl} title={event.name} />
          {me.data ? (
            <Button icon="user" onClick={() => setInviteOpen(true)}>
              Invite
            </Button>
          ) : null}
        </>
      }
      meta={formatEventWindow(event.starts_at, event.ends_at)}
    >
      {info?.valid && info.inviterHandle ? (
        <p className="muted">
          {info.inviterHandle} invited you
          {info.inviteeHandle ? ` as @${info.inviteeHandle}` : ''}
        </p>
      ) : null}

      {event.description === null ? null : (
        <section className="stack stack--tight">
          <h2>About</h2>
          <Markdown>{event.description}</Markdown>
        </section>
      )}

      {locations.length === 0 ? null : (
        <section className="stack stack--tight">
          <h2>Location</h2>
          <ul className="data-list">
            {locations.map((location) => (
              <li key={location}>{location}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="stack stack--tight">
        <h2>Who's in ({rsvps.length})</h2>
        {rsvps.length === 0 ? (
          <p className="muted">No one's replied yet.</p>
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
        <h2>Your RSVP</h2>
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
