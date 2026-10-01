import { closeDb, createDb } from './client.js'
import { runMigrations } from './migrations.js'

export const parseDirection = (arg: string | undefined): 'up' | 'down' =>
  arg === 'down' ? 'down' : 'up'

export interface MigrateIo {
  log(message: string): void
  error(message: string): void
}

/**
 * The `pnpm db:migrate[:down]` entry point, factored out of the top-level script
 * so the argument handling and the missing-`DATABASE_URL` path can be tested.
 * Returns the process exit code.
 */
export const runMigrateCli = async (
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
  io: MigrateIo = console,
): Promise<number> => {
  const connectionString = env.DATABASE_URL
  if (!connectionString) {
    io.error('DATABASE_URL is required to run migrations.')
    return 1
  }

  const direction = parseDirection(argv[2])
  const db = createDb({ connectionString })

  try {
    const results = await runMigrations(db, direction)
    if (results.length === 0) {
      io.log('No migrations to run.')
      return 0
    }
    for (const result of results) {
      io.log(`${result.status} ${result.direction} ${result.migrationName}`)
    }
    return 0
  } finally {
    await closeDb(db)
  }
}

if (import.meta.main) {
  process.exit(await runMigrateCli(process.argv))
}
