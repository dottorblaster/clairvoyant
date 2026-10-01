import { closeDb, createDb } from './client.js'
import { runMigrations } from './migrations.js'

const main = async (): Promise<void> => {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    console.error('DATABASE_URL is required to run migrations.')
    process.exit(1)
  }

  const direction = process.argv[2] === 'down' ? 'down' : 'up'
  const db = createDb({ connectionString })

  try {
    const results = await runMigrations(db, direction)
    if (results.length === 0) {
      console.log('No migrations to run.')
      return
    }
    for (const result of results) {
      console.log(`${result.status} ${result.direction} ${result.migrationName}`)
    }
  } finally {
    await closeDb(db)
  }
}

await main()
