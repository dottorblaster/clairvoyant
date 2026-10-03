import { Badge, Loading, Notice, Panel } from '@clairvoyant/ui'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { fetchMyEvents, type MyEventRow } from '../lib/api'
import { partitionEventsByStart } from '../lib/eventSections'
import { rkeyFromUri } from '../lib/eventUri'
import { formatEventWindow } from '../lib/format'
import { ROLE_TONE } from '../lib/roles'
import { useMe } from '../lib/useMe'

const EventList = ({ events }: { events: MyEventRow[] }) => (
  <ul className="data-list">
    {events.map((event) => (
      <li key={event.uri}>
        <Link className="data-list__link" to={`/p/${event.author_did}/e/${rkeyFromUri(event.uri)}`}>
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
      <Panel title="My shelf">
        <Loading>Checking your save</Loading>
      </Panel>
    )
  }

  if (!me.data) {
    return (
      <Panel title="My shelf">
        <p>
          You're browsing as a guest. <Link to="/login">Link up</Link> to see your shelf.
        </p>
      </Panel>
    )
  }

  const all = events.data?.events ?? []

  const { upcoming, past, undated } = partitionEventsByStart(all, new Date())

  return (
    <Panel
      title="My shelf"
      meta={
        <>
          Hosting or attending, for <code>{me.data.handle ?? me.data.did}</code>.
        </>
      }
    >
      {events.isLoading ? <Loading>Reading your shelf</Loading> : null}
      {events.isError ? <Notice tone="error">Your shelf didn't load.</Notice> : null}

      {events.data && all.length === 0 ? (
        <p>
          Your shelf is empty. <Link to="/create">Make an event</Link>, or hit{' '}
          <Link to="/">the rack</Link>.
        </p>
      ) : null}

      <Section title="Up next" events={upcoming} />
      <Section title="Cleared" events={past} />
      <Section title="No date" events={undated} />
    </Panel>
  )
}
