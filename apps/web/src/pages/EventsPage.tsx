import { Badge, type BadgeTone, Loading, Notice, Panel } from '@clairvoyant/ui'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { fetchMyEvents, type MyEventRole, type MyEventRow } from '../lib/api'
import { formatEventWindow } from '../lib/format'
import { useMe } from '../lib/useMe'

/** Hosting is the loudest, interested the quietest. */
const ROLE_TONE: Record<MyEventRole, BadgeTone> = {
  hosting: 'ink',
  going: 'default',
  interested: 'muted',
}

const EventList = ({ events }: { events: MyEventRow[] }) => (
  <ul className="data-list">
    {events.map((event) => (
      <li key={event.uri}>
        <Link
          className="data-list__link"
          to={`/p/${event.author_did}/e/${event.uri.split('/').pop() ?? ''}`}
        >
          {event.name}
        </Link>
        <span className="cluster">
          <span className="data-list__meta">
            {formatEventWindow(event.starts_at, event.ends_at)}
          </span>
          <Badge tone={ROLE_TONE[event.role]}>{event.role}</Badge>
        </span>
      </li>
    ))}
  </ul>
)

/** Renders nothing at all when the section would be empty. */
const Section = ({ title, events }: { title: string; events: MyEventRow[] }) =>
  events.length === 0 ? null : (
    <section className="stack stack--tight">
      <h2>{title}</h2>
      <EventList events={events} />
    </section>
  )

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

  const all = events.data?.events ?? []

  // The API already ordered these (upcoming soonest-first, then past
  // most-recent-first, then undated), so a single pass in order is enough.
  const now = new Date()
  const upcoming: MyEventRow[] = []
  const past: MyEventRow[] = []
  const undated: MyEventRow[] = []
  for (const event of all) {
    const start = event.starts_at === null ? null : new Date(event.starts_at)
    if (start === null) undated.push(event)
    else if (start >= now) upcoming.push(event)
    else past.push(event)
  }

  return (
    <Panel
      title="My events"
      meta={
        <>
          Everything you host or are attending, indexed from the network for{' '}
          <code>{me.data.handle ?? me.data.did}</code>.
        </>
      }
    >
      {events.isLoading ? <Loading>Loading events</Loading> : null}
      {events.isError ? <Notice tone="error">Could not load events.</Notice> : null}

      {events.data && all.length === 0 ? (
        <p>
          Nothing yet. <Link to="/create">Create an event</Link>, or find something on{' '}
          <Link to="/">discover</Link>.
        </p>
      ) : null}

      <Section title="Upcoming" events={upcoming} />
      <Section title="Past" events={past} />
      <Section title="No date" events={undated} />
    </Panel>
  )
}
