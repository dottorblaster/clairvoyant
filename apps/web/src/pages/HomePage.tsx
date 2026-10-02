import { Loading, Notice, Panel } from '@clairvoyant/ui'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { fetchDiscoverEvents } from '../lib/api'
import { rkeyFromUri } from '../lib/eventUri'
import { formatEventStart } from '../lib/format'
import { useMe } from '../lib/useMe'

const DISCOVER_LIMIT = 6

export const HomePage = () => {
  const me = useMe()
  const discover = useQuery({
    queryKey: ['discover-events', DISCOVER_LIMIT],
    queryFn: () => fetchDiscoverEvents(DISCOVER_LIMIT),
  })

  const events = discover.data?.events ?? []

  return (
    <Panel
      title="Discover"
      meta="Upcoming events indexed from the network. Anyone can look — RSVPs are invite-only."
    >
      {discover.isLoading ? <Loading>Loading events</Loading> : null}
      {discover.isError ? <Notice tone="error">Could not load events.</Notice> : null}

      {discover.data && events.length === 0 ? (
        <p className="muted">
          Nothing indexed yet. Events appear here once the indexer has caught up.
        </p>
      ) : null}

      {events.length > 0 ? (
        <ul className="data-list">
          {events.map((event) => (
            <li key={event.uri}>
              <Link
                className="data-list__link"
                to={`/p/${event.author_did}/e/${rkeyFromUri(event.uri)}`}
              >
                {event.name}
              </Link>
              <span className="data-list__meta">{formatEventStart(event.starts_at)}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {/* `me.isLoading` is checked first so the call to action does not flash
          for a user who is in fact logged in. */}
      {me.isLoading ? null : me.data ? (
        <p>
          <Link to="/events">See your own events</Link>
        </p>
      ) : (
        <Notice tone="info" title="Want to join in?">
          <Link to="/login">Log in with your handle</Link> to create events and RSVP to others.
        </Notice>
      )}
    </Panel>
  )
}
