import { z } from 'zod'

// Where a fresh (empty-cursor) index begins.
//   number -> raw Jetstream sequence to resume after (0 = replay the full archive)
//   latest -> the current sealed tip, skipping historical backfill
// Jetstream v2 cursors are sequence numbers, not timestamps, so a date or
// duration ("last year") cannot be expressed here. See README.
const StartSeqSchema = z
  .union([z.literal('latest'), z.coerce.number().int().nonnegative()])
  .default(0)

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JETSTREAM_URL: z.url().default('https://jetstream.us-west.bsky.network'),
  JETSTREAM_API_KEY: z.string().min(1).optional(),
  INDEXER_START_SEQ: StartSeqSchema,
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
})

export type Env = z.infer<typeof EnvSchema>

export const loadEnv = (source: NodeJS.ProcessEnv = process.env): Env => {
  const parsed = EnvSchema.safeParse(source)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n')
    throw new Error(`Invalid indexer environment:\n${issues}`)
  }
  return parsed.data
}
