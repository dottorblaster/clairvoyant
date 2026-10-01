import { Loading, Notice, Panel } from '@clairvoyant/ui'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { fetchMyEvents } from '../lib/api'
import { useMe } from '../lib/useMe'

const formatRange = (startsAt: string, endsAt: string | null): string => {
  const start = new Date(startsAt).toLocaleString()
  if (!endsAt) return start
  return `${start} – ${new Date(endsAt).toLocaleString()}`
}

export const EventsPage = () => {
  const me = useMe()
  const events = useQuery({
    queryKey: ['my-events'],
    queryFn: fetchMyEvents,
    enabled: me.data != null,
  })

  if (me.isLoading) {
    return (
      <Panel title="My events">
        <Loading>Checking session</Loading>
      </Panel>
    )
  }

  if (!me.data) {
    return (
      <Panel title="My events">
        <p>
          You are not logged in. <Link to="/login">Log in with your handle</Link> to see your
          events.
        </p>
      </Panel>
    )
  }

  return (
    <Panel
      title="My events"
      meta={
        <>
          Indexed from the network for <code>{me.data.handle ?? me.data.did}</code>.
        </>
      }
    >
      {events.isLoading ? <Loading>Loading events</Loading> : null}
      {events.isError ? <Notice tone="error">Could not load events.</Notice> : null}

      {events.data?.events.length === 0 ? (
        <p>
          No events yet. <Link to="/create">Create one</Link>.
        </p>
      ) : null}

      {events.data && events.data.events.length > 0 ? (
        <ul className="data-list">
          {events.data.events.map((event) => (
            <li key={event.uri}>
              <Link
                className="data-list__link"
                to={`/p/${event.author_did}/e/${event.uri.split('/').pop() ?? ''}`}
              >
                {event.name}
              </Link>
              <span className="data-list__meta">{formatRange(event.starts_at, event.ends_at)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </Panel>
  )
}
