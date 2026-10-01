import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import type { TypedEvent } from '@bsky/jetstream'
import type { JetstreamClient } from '../../dist/jetstream.js'
import {
  DEFAULT_AGE_MS,
  findSeqAt,
  MAX_SAMPLE_ATTEMPTS,
  parseAgeMs,
  parseTargetMs,
  sampleAt,
  WINDOW_SEQ,
} from '../../dist/scripts/find-start-seq.js'

const DAY = 86_400_000
const NOW = 1_800_000_000_000

describe('parseAgeMs', () => {
  test('converts every supported unit', () => {
    assert.equal(parseAgeMs('1s'), 1_000)
    assert.equal(parseAgeMs('1m'), 60_000)
    assert.equal(parseAgeMs('1h'), 3_600_000)
    assert.equal(parseAgeMs('1d'), DAY)
    assert.equal(parseAgeMs('1w'), 7 * DAY)
    assert.equal(parseAgeMs('1mo'), 30 * DAY)
    assert.equal(parseAgeMs('1y'), 365 * DAY)
  })

  test('trims surrounding whitespace', () => {
    assert.equal(parseAgeMs('  2d  '), 2 * DAY)
  })

  test('rejects an unsupported age', () => {
    for (const raw of ['1', 'd', 'abc', '1x', '1.5d', '']) {
      assert.throws(() => parseAgeMs(raw), /Unsupported age/, JSON.stringify(raw))
    }
  })
})

describe('parseTargetMs', () => {
  test('reads --since as an ISO timestamp', () => {
    assert.equal(
      parseTargetMs(['--since', '2025-01-01T00:00:00Z'], NOW),
      Date.parse('2025-01-01T00:00:00Z'),
    )
  })

  test('reads --age relative to now', () => {
    assert.equal(parseTargetMs(['--age', '2d'], NOW), NOW - 2 * DAY)
  })

  test('reads a positional date', () => {
    assert.equal(parseTargetMs(['2025-06-01T00:00:00Z'], NOW), Date.parse('2025-06-01T00:00:00Z'))
  })

  test('defaults to one year ago', () => {
    assert.equal(parseTargetMs([], NOW), NOW - DEFAULT_AGE_MS)
  })

  test('prefers --since over --age', () => {
    const target = parseTargetMs(['--since', '2025-01-01T00:00:00Z', '--age', '2d'], NOW)
    assert.equal(target, Date.parse('2025-01-01T00:00:00Z'))
  })

  test('rejects missing or unparseable values', () => {
    assert.throws(() => parseTargetMs(['--since'], NOW), /--since requires/)
    assert.throws(() => parseTargetMs(['--since', 'nope'], NOW), /Could not parse --since/)
    assert.throws(() => parseTargetMs(['--age'], NOW), /--age requires/)
    assert.throws(() => parseTargetMs(['--age', '1x'], NOW), /Unsupported age/)
    assert.throws(() => parseTargetMs(['nope'], NOW), /Could not parse date/)
  })
})

const eventAt = (seq: number, timeMs: number): TypedEvent =>
  ({ seq, time: new Date(timeMs).toISOString() }) as unknown as TypedEvent

const clientFrom = (
  handler: (input: { afterSeq: number; beforeSeq: number }) => TypedEvent[],
): { client: JetstreamClient; calls: Array<{ afterSeq: number; beforeSeq: number }> } => {
  const calls: Array<{ afterSeq: number; beforeSeq: number }> = []
  const client = {
    snapshot: (input: { afterSeq: number; beforeSeq: number }) => {
      calls.push(input)
      return (async function* () {
        yield* handler(input)
      })()
    },
  } as unknown as JetstreamClient
  return { client, calls }
}

describe('sampleAt', () => {
  test('returns the first event with a parseable time', async () => {
    const { client } = clientFrom(() => [eventAt(10, 1_000), eventAt(11, 2_000)])
    assert.deepEqual(await sampleAt(client, 5), { seq: 10, timeMs: 1_000 })
  })

  test('skips events whose time does not parse', async () => {
    const bad = { seq: 10, time: 'not-a-date' } as unknown as TypedEvent
    const { client } = clientFrom(() => [bad, eventAt(11, 2_000)])
    assert.deepEqual(await sampleAt(client, 0), { seq: 11, timeMs: 2_000 })
  })

  test('widens the window and retries before giving up', async () => {
    let attempt = 0
    const { client, calls } = clientFrom(() => (attempt++ === 0 ? [] : [eventAt(7, 5_000)]))

    assert.deepEqual(await sampleAt(client, 100), { seq: 7, timeMs: 5_000 })
    assert.equal(calls[0]?.beforeSeq, 100 + WINDOW_SEQ)
    assert.equal(calls[1]?.beforeSeq, 100 + WINDOW_SEQ * 4)
  })

  test('throws after the maximum number of empty attempts', async () => {
    const { client, calls } = clientFrom(() => [])
    await assert.rejects(sampleAt(client, 0), /No events found after seq/)
    assert.equal(calls.length, MAX_SAMPLE_ATTEMPTS)
  })
})

describe('findSeqAt', () => {
  const base = 1_700_000_000_000
  const timeFor = (seq: number): number => base + seq * 1_000
  const { client } = clientFrom((input) => [eventAt(input.afterSeq, timeFor(input.afterSeq))])

  test('returns the earliest event when the target predates the archive', async () => {
    const result = await findSeqAt(client, 3_000_000, base - 1_000)
    assert.equal(result.seq, 0)
  })

  test('returns the tip sample when the target is after it', async () => {
    const tip = 3_000_000
    const tipSeq = Math.max(0, tip - WINDOW_SEQ)
    const result = await findSeqAt(client, tip, timeFor(tipSeq) + 1)
    assert.equal(result.seq, tipSeq)
  })

  test('binary-searches to the first event at or after the target', async () => {
    const target = 500_000
    const result = await findSeqAt(client, 3_000_000, timeFor(target))

    assert.equal(result.seq, target)
    assert.equal(result.sample.timeMs, timeFor(target))
  })
})
