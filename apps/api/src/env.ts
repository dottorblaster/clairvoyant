import { z } from 'zod'

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '[::1]', '::1'])

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    OAUTH_MODE: z.enum(['loopback', 'web']).default('loopback'),
    PUBLIC_URL: z.url().optional(),
    WEB_ORIGIN: z.url().default('http://127.0.0.1:5173'),
    COOKIE_SECRET: z.string().min(32, 'COOKIE_SECRET must be at least 32 characters'),
    COOKIE_NAME: z.string().min(1).default('clairvoyant_session'),
    COOKIE_SECURE: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  })
  .superRefine((value, ctx) => {
    if (value.OAUTH_MODE === 'web' && !value.PUBLIC_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['PUBLIC_URL'],
        message: 'PUBLIC_URL is required when OAUTH_MODE=web',
      })
    }

    if (value.OAUTH_MODE === 'loopback') {
      let host: string | null = null
      try {
        host = new URL(value.WEB_ORIGIN).hostname
      } catch {
        host = null
      }
      if (host !== null && !LOOPBACK_HOSTS.has(host)) {
        ctx.addIssue({
          code: 'custom',
          path: ['WEB_ORIGIN'],
          message:
            'In loopback mode WEB_ORIGIN must use a loopback host (127.0.0.1 or [::1]). ' +
            'The atproto loopback redirect and its cookie live on 127.0.0.1, and cookies do not ' +
            'cross localhost <-> 127.0.0.1, so open the SPA on the same host.',
        })
      }
    }
  })

export type Env = z.infer<typeof EnvSchema>

export const loadEnv = (source: NodeJS.ProcessEnv = process.env): Env => {
  const parsed = EnvSchema.safeParse(source)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n')
    throw new Error(`Invalid api environment:\n${issues}`)
  }
  return parsed.data
}
