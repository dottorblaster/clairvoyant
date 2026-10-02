import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  type EventRow,
  listDiscoverEvents,
  MAX_DISCOVER_LIMIT,
  mergeMyEvents,
  type ParticipatingEventRow,
  sampleWithoutReplacement,
  sortMyEvents,
} from '../dist/queries.js'

describe('sampleWithoutReplacement', () => {
  test('returns exactly the requested number of items', () => {
    const items = [1, 2, 3, 4, 5, 6]
    for (const count of [1, 3, 6]) {
      assert.equal(sampleWithoutReplacement(items, count).length, count)
    }
  })

  test('returns a permutation, never a duplicate or an invention', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
    for (let run = 0; run < 50; run += 1) {
      const picked = sampleWithoutReplacement(items, 4)
      assert.equal(new Set(picked).size, picked.length, 'picked the same item twice')
      for (const item of picked) {
        assert.ok(items.includes(item), `picked an item that was not in the input: ${item}`)
      }
    }
  })

  test('does not mutate the input', () => {
    const items = Object.freeze([1, 2, 3, 4, 5])
    assert.doesNotThrow(() => sampleWithoutReplacement(items, 3))
    assert.deepEqual([...items], [1, 2, 3, 4, 5])
  })

  test('caps at the number of available items', () => {
    const picked = sampleWithoutReplacement([1, 2, 3], 10)
    assert.equal(picked.length, 3)
    assert.deepEqual([...picked].sort(), [1, 2, 3])
  })

  test('returns nothing for a non-positive count or an empty pool', () => {
    assert.deepEqual(sampleWithoutReplacement([1, 2, 3], 0), [])
    assert.deepEqual(sampleWithoutReplacement([1, 2, 3], -5), [])
    assert.deepEqual(sampleWithoutReplacement([], 3), [])
  })

  test('actually randomises rather than taking a fixed slice', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f']
    const seen = new Set<string>()
    for (let run = 0; run < 300; run += 1) {
      for (const item of sampleWithoutReplacement(items, 2)) seen.add(item)
    }
    assert.deepEqual([...seen].sort(), [...items].sort())
  })
})

describe('MAX_DISCOVER_LIMIT', () => {
  test('is a small positive integer, so a request cannot ask for the whole index', () => {
    assert.ok(Number.isInteger(MAX_DISCOVER_LIMIT))
    assert.ok(MAX_DISCOVER_LIMIT > 0 && MAX_DISCOVER_LIMIT <= 100)
  })
})

interface FakeQueryBuilder {
  selectFrom: () => FakeQueryBuilder
  selectAll: () => FakeQueryBuilder
  where: () => FakeQueryBuilder
  orderBy: () => FakeQueryBuilder
  limit: (value: number) => FakeQueryBuilder
  $if: (
    condition: boolean,
    callback: (qb: FakeQueryBuilder) => FakeQueryBuilder,
  ) => FakeQueryBuilder
  execute: () => Promise<unknown[]>
}

const fakeDb = (rows: unknown[]): { db: FakeQueryBuilder; limits: number[] } => {
  const limits: number[] = []
  const builder: FakeQueryBuilder = {
    selectFrom: () => builder,
    selectAll: () => builder,
    where: () => builder,
    orderBy: () => builder,
    limit: (value) => {
      limits.push(value)
      return builder
    },
    $if: (condition, callback) => (condition ? callback(builder) : builder),
    execute: async () => rows,
  }
  return { db: builder, limits }
}

const asDb = (builder: FakeQueryBuilder): never => builder as never

describe('listDiscoverEvents', () => {
  test('returns nothing, and never touches the database, for a non-positive limit', async () => {
    const exploding = new Proxy(
      {},
      {
        get() {
          throw new Error('the database should not be queried')
        },
      },
    ) as unknown as never

    assert.deepEqual(await listDiscoverEvents(exploding, { limit: 0 }), [])
    assert.deepEqual(await listDiscoverEvents(exploding, { limit: -3 }), [])
  })

  test('stops after the first query when there are enough upcoming events', async () => {
    const rows = Array.from({ length: 5 }, (_, index) => ({ uri: `at://x/${index}` }))
    const { db, limits } = fakeDb(rows)

    const picked = await listDiscoverEvents(asDb(db), { limit: 3 })

    assert.equal(picked.length, 3)
    assert.equal(limits.length, 1, 'should not issue a second query when the first tier fills up')
  })

  test('tops up from a second query when upcoming events run out', async () => {
    const { db, limits } = fakeDb([{ uri: 'at://x/only-one' }])

    const picked = await listDiscoverEvents(asDb(db), { limit: 4 })

    assert.equal(limits.length, 2, 'should fall back to a second query')
    assert.equal(picked.length, 2, 'one from each tier')
  })

  test('clamps an oversized limit to MAX_DISCOVER_LIMIT', async () => {
    const { db, limits } = fakeDb([{ uri: 'at://x/1' }, { uri: 'at://x/2' }])

    await listDiscoverEvents(asDb(db), { limit: 100_000 })

    assert.equal(limits[0], 200, 'the candidate pool is bounded')
    assert.equal(limits[1], MAX_DISCOVER_LIMIT - 2)
  })
})

const REF = 'community.lexicon.calendar.rsvp#'

const eventRow = (uri: string, name: string, startsAt: Date | null): EventRow => ({
  uri,
  cid: `${uri}#cid`,
  author_did: 'did:plc:author',
  name,
  starts_at: startsAt,
  ends_at: null,
  description: null,
  locations: [],
  indexed_at: new Date('2026-01-01T00:00:00Z'),
  raw: { marker: uri },
})

const participating = (
  uri: string,
  name: string,
  status: string,
  indexedAt = '2026-01-01T00:00:00Z',
): ParticipatingEventRow => ({
  ...eventRow(uri, name, new Date('2026-06-01T12:00:00Z')),
  rsvp_status: status,
  rsvp_indexed_at: new Date(indexedAt),
})

const rolesOf = (events: ReturnType<typeof mergeMyEvents>): Array<[string, string]> =>
  events.map((event) => [event.uri, event.role])

describe('mergeMyEvents', () => {
  test('keeps authored events as hosting', () => {
    const merged = mergeMyEvents([eventRow('at://a', 'Mine', null)], [])
    assert.deepEqual(rolesOf(merged), [['at://a', 'hosting']])
  })

  test("adds events the viewer RSVP'd to, with the RSVP role", () => {
    const merged = mergeMyEvents(
      [eventRow('at://a', 'Mine', null)],
      [participating('at://b', 'Theirs', `${REF}going`)],
    )
    assert.deepEqual(rolesOf(merged).sort(), [
      ['at://a', 'hosting'],
      ['at://b', 'going'],
    ])
  })

  test("hosting wins when the viewer also RSVP'd to their own event", () => {
    const merged = mergeMyEvents(
      [eventRow('at://a', 'Mine', null)],
      [participating('at://a', 'Mine', `${REF}going`)],
    )
    assert.equal(merged.length, 1)
    assert.equal(merged[0]?.role, 'hosting')
  })

  test('collapses duplicate RSVPs to one row per event', () => {
    const merged = mergeMyEvents(
      [],
      [
        participating('at://b', 'Theirs', `${REF}interested`),
        participating('at://b', 'Theirs', `${REF}going`),
      ],
    )
    assert.equal(merged.length, 1)
  })

  test('prefers going over interested, whichever order they arrive in', () => {
    const goingFirst = mergeMyEvents(
      [],
      [
        participating('at://b', 'Theirs', `${REF}going`),
        participating('at://b', 'Theirs', `${REF}interested`),
      ],
    )
    const interestedFirst = mergeMyEvents(
      [],
      [
        participating('at://b', 'Theirs', `${REF}interested`),
        participating('at://b', 'Theirs', `${REF}going`),
      ],
    )
    assert.equal(goingFirst[0]?.role, 'going')
    assert.equal(interestedFirst[0]?.role, 'going')
  })

  test('breaks a tie on the most recently indexed RSVP', () => {
    const older = {
      ...participating('at://b', 'Theirs', `${REF}going`, '2026-01-01T00:00:00Z'),
      cid: 'cid-older',
    }
    const newer = {
      ...participating('at://b', 'Theirs', `${REF}going`, '2026-05-01T00:00:00Z'),
      cid: 'cid-newer',
    }

    assert.equal(mergeMyEvents([], [older, newer])[0]?.cid, 'cid-newer')
    assert.equal(mergeMyEvents([], [newer, older])[0]?.cid, 'cid-newer')
  })

  test('accepts both network spellings of the same status', () => {
    const refForm = mergeMyEvents([], [participating('at://b', 'Theirs', `${REF}interested`)])
    const bareForm = mergeMyEvents([], [participating('at://b', 'Theirs', 'interested')])
    assert.equal(refForm[0]?.role, 'interested')
    assert.equal(bareForm[0]?.role, 'interested')
  })

  test('drops an RSVP whose status it does not recognise, rather than guessing', () => {
    const merged = mergeMyEvents([], [participating('at://b', 'Theirs', 'maybe')])
    assert.deepEqual(merged, [])
  })

  test('drops notgoing, which is not something to list under "my events"', () => {
    const merged = mergeMyEvents([], [participating('at://b', 'Theirs', `${REF}notgoing`)])
    assert.deepEqual(merged, [])
  })

  test('strips the rsvp columns and keeps the event row intact', () => {
    const merged = mergeMyEvents([], [participating('at://b', 'Theirs', `${REF}going`)])
    const only = merged[0]
    assert.ok(only !== undefined)
    assert.deepEqual(only.raw, { marker: 'at://b' })
    assert.equal(only.cid, 'at://b#cid')
    assert.ok(!('rsvp_status' in only))
    assert.ok(!('rsvp_indexed_at' in only))
  })

  test('handles empty input', () => {
    assert.deepEqual(mergeMyEvents([], []), [])
  })
})

describe('sortMyEvents', () => {
  const now = new Date('2026-06-15T12:00:00Z')
  const at = (iso: string): Date => new Date(iso)

  test('orders upcoming soonest-first, then past most-recent-first, then undated', () => {
    const merged = mergeMyEvents(
      [
        eventRow('at://past-old', 'Past old', at('2020-01-01T00:00:00Z')),
        eventRow('at://soon', 'Soon', at('2026-06-16T00:00:00Z')),
        eventRow('at://later', 'Later', at('2026-12-01T00:00:00Z')),
        eventRow('at://past-recent', 'Past recent', at('2026-06-01T00:00:00Z')),
        eventRow('at://undated', 'Undated', null),
      ],
      [],
    )

    assert.deepEqual(
      sortMyEvents(merged, now).map((event) => event.uri),
      ['at://soon', 'at://later', 'at://past-recent', 'at://past-old', 'at://undated'],
    )
  })

  test('breaks ties on name so the order is deterministic', () => {
    const merged = mergeMyEvents(
      [
        eventRow('at://b', 'Beta', at('2026-07-01T00:00:00Z')),
        eventRow('at://a', 'Alpha', at('2026-07-01T00:00:00Z')),
      ],
      [],
    )
    assert.deepEqual(
      sortMyEvents(merged, now).map((event) => event.name),
      ['Alpha', 'Beta'],
    )
  })

  test('an event starting exactly now counts as upcoming', () => {
    const merged = mergeMyEvents([eventRow('at://now', 'Now', now)], [])
    const sorted = sortMyEvents(merged, now)
    assert.equal(sorted[0]?.uri, 'at://now')
  })

  test('does not mutate its input', () => {
    const merged = mergeMyEvents([eventRow('at://a', 'A', at('2026-07-01T00:00:00Z'))], [])
    const before = merged.map((event) => event.uri)
    sortMyEvents(merged, now)
    assert.deepEqual(
      merged.map((event) => event.uri),
      before,
    )
  })

  test('handles an empty list', () => {
    assert.deepEqual(sortMyEvents([], now), [])
  })
})
