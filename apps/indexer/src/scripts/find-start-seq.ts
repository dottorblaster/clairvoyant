import type { TypedEvent } from '@bsky/jetstream'
import { loadEnv } from '../env.js'
import { createJetstreamClient, fetchSealedTipSeq, type JetstreamClient } from '../jetstream.js'

const DAY_MS = 86_400_000
export const DEFAULT_AGE_MS = 365 * DAY_MS
export const WINDOW_SEQ = 2_000_000
export const MAX_SAMPLE_ATTEMPTS = 6
export const MAX_ITERATIONS = 64

export interface Sample {
  seq: number
  timeMs: number
}

export const parseAgeMs = (raw: string): number => {
  const match = /^(\d+)(mo|y|w|d|h|m|s)$/.exec(raw.trim())
  const amountRaw = match?.[1]
  const unit = match?.[2]
  if (amountRaw === undefined || unit === undefined) {
    throw new Error(`Unsupported age "${raw}". Try e.g. 365d, 12mo, 1y.`)
  }

  const amount = Number(amountRaw)
  const multipliers: Record<string, number> = {
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: DAY_MS,
    w: 7 * DAY_MS,
    mo: 30 * DAY_MS,
    y: 365 * DAY_MS,
  }
  return amount * (multipliers[unit] ?? DAY_MS)
}

export const parseTargetMs = (argv: readonly string[], now: number = Date.now()): number => {
  const sinceIdx = argv.indexOf('--since')
  const ageIdx = argv.indexOf('--age')

  if (sinceIdx !== -1) {
    const value = argv[sinceIdx + 1]
    if (!value) throw new Error('--since requires an ISO timestamp')
    const parsed = Date.parse(value)
    if (Number.isNaN(parsed)) throw new Error(`Could not parse --since "${value}"`)
    return parsed
  }

  if (ageIdx !== -1) {
    const value = argv[ageIdx + 1]
    if (!value) throw new Error('--age requires a duration, e.g. 1y')
    return now - parseAgeMs(value)
  }

  const positional = argv.find((arg) => !arg.startsWith('--'))
  if (positional) {
    const parsed = Date.parse(positional)
    if (Number.isNaN(parsed)) throw new Error(`Could not parse date "${positional}"`)
    return parsed
  }

  return now - DEFAULT_AGE_MS
}

export const sampleAt = async (client: JetstreamClient, seq: number): Promise<Sample> => {
  let window = WINDOW_SEQ

  for (let attempt = 0; attempt < MAX_SAMPLE_ATTEMPTS; attempt++) {
    const stream = client.snapshot({
      afterSeq: seq,
      beforeSeq: seq + window,
    }) as unknown as AsyncIterable<TypedEvent>

    for await (const event of stream) {
      const timeMs = Date.parse(event.time)
      if (!Number.isNaN(timeMs)) return { seq: event.seq, timeMs }
    }

    window *= 4
  }

  throw new Error(`No events found after seq ${seq} within ${window} sequences`)
}

export const findSeqAt = async (
  client: JetstreamClient,
  tipSeq: number,
  targetMs: number,
): Promise<{ seq: number; sample: Sample }> => {
  const earliest = await sampleAt(client, 0)
  if (targetMs <= earliest.timeMs) return { seq: earliest.seq, sample: earliest }

  const tipSample = await sampleAt(client, Math.max(0, tipSeq - WINDOW_SEQ))
  if (targetMs >= tipSample.timeMs) return { seq: tipSample.seq, sample: tipSample }

  let lo = earliest.seq
  let hi = tipSample.seq
  let best: Sample = tipSample

  for (let i = 0; i < MAX_ITERATIONS && hi - lo > 1; i++) {
    const mid = Math.floor((lo + hi) / 2)
    const sample = await sampleAt(client, mid)

    if (sample.timeMs < targetMs) {
      lo = mid
    } else {
      hi = mid
      best = sample
    }
  }

  return { seq: hi, sample: best }
}

const main = async (): Promise<void> => {
  const targetMs = parseTargetMs(process.argv.slice(2))
  const env = loadEnv()
  const client = createJetstreamClient({
    service: env.JETSTREAM_URL,
    apiKey: env.JETSTREAM_API_KEY,
  })

  const tipSeq = await fetchSealedTipSeq({
    service: env.JETSTREAM_URL,
    apiKey: env.JETSTREAM_API_KEY,
  })

  const { seq, sample } = await findSeqAt(client, tipSeq, targetMs)

  console.log(`target time     : ${new Date(targetMs).toISOString()}`)
  console.log(`archive tip seq : ${tipSeq}`)
  console.log(`event at seq    : ${sample.seq} @ ${new Date(sample.timeMs).toISOString()}`)
  console.log('')
  console.log(`INDEXER_START_SEQ=${seq}`)
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
