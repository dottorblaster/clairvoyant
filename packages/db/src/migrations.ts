import { type Kysely, sql } from 'kysely'
import { type Migration, type MigrationProvider, Migrator } from 'kysely/migration'
import type { DB } from './schema.js'

const event: Migration = {
  async up(db) {
    await db.schema
      .createTable('event')
      .addColumn('uri', 'text', (c) => c.primaryKey())
      .addColumn('cid', 'text', (c) => c.notNull())
      .addColumn('author_did', 'text', (c) => c.notNull())
      .addColumn('name', 'text', (c) => c.notNull())
      .addColumn('starts_at', 'timestamptz')
      .addColumn('ends_at', 'timestamptz')
      .addColumn('indexed_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
      .addColumn('raw', 'jsonb', (c) => c.notNull())
      .execute()

    await db.schema.createIndex('event_author_did_idx').on('event').column('author_did').execute()
    await db.schema.createIndex('event_starts_at_idx').on('event').column('starts_at').execute()
  },
  async down(db) {
    await db.schema.dropTable('event').ifExists().execute()
  },
}

const rsvp: Migration = {
  async up(db) {
    await db.schema
      .createTable('rsvp')
      .addColumn('uri', 'text', (c) => c.primaryKey())
      .addColumn('cid', 'text', (c) => c.notNull())
      .addColumn('author_did', 'text', (c) => c.notNull())
      .addColumn('subject_uri', 'text', (c) => c.notNull())
      .addColumn('status', 'text', (c) => c.notNull())
      .addColumn('indexed_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
      .execute()

    // The main query is "who is going to event X": rsvp by subject URI.
    await db.schema.createIndex('rsvp_subject_uri_idx').on('rsvp').column('subject_uri').execute()
    await db.schema.createIndex('rsvp_author_did_idx').on('rsvp').column('author_did').execute()
  },
  async down(db) {
    await db.schema.dropTable('rsvp').ifExists().execute()
  },
}

const auth: Migration = {
  async up(db) {
    await db.schema
      .createTable('auth_state')
      .addColumn('key', 'text', (c) => c.primaryKey())
      .addColumn('value', 'jsonb', (c) => c.notNull())
      .addColumn('updated_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
      .execute()

    await db.schema
      .createTable('auth_session')
      .addColumn('key', 'text', (c) => c.primaryKey())
      .addColumn('value', 'jsonb', (c) => c.notNull())
      .addColumn('updated_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
      .execute()
  },
  async down(db) {
    await db.schema.dropTable('auth_session').ifExists().execute()
    await db.schema.dropTable('auth_state').ifExists().execute()
  },
}

const cursor: Migration = {
  async up(db) {
    await db.schema
      .createTable('cursor')
      .addColumn('id', 'integer', (c) => c.primaryKey())
      .addColumn('seq', 'bigint', (c) => c.notNull().defaultTo(0))
      .addColumn('updated_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
      .execute()
  },
  async down(db) {
    await db.schema.dropTable('cursor').ifExists().execute()
  },
}

const invite: Migration = {
  async up(db) {
    await db.schema
      .createTable('invite')
      .addColumn('token_hash', 'text', (c) => c.primaryKey())
      .addColumn('event_uri', 'text', (c) => c.notNull())
      .addColumn('invitee_did', 'text', (c) => c.notNull())
      .addColumn('invitee_handle', 'text', (c) => c.notNull())
      .addColumn('inviter_did', 'text', (c) => c.notNull())
      .addColumn('inviter_handle', 'text', (c) => c.notNull())
      .addColumn('created_at', 'timestamptz', (c) => c.notNull().defaultTo(sql`now()`))
      .execute()

    await db.schema.createIndex('invite_event_uri_idx').on('invite').column('event_uri').execute()
    await db.schema
      .createIndex('invite_invitee_did_idx')
      .on('invite')
      .column('invitee_did')
      .execute()
  },
  async down(db) {
    await db.schema.dropTable('invite').ifExists().execute()
  },
}

export type MigrationDirection = 'up' | 'down'

export const migrations: Record<string, Migration> = {
  '001_event': event,
  '002_rsvp': rsvp,
  '003_auth': auth,
  '004_cursor': cursor,
  '005_invite': invite,
}

export const migrationProvider: MigrationProvider = {
  async getMigrations() {
    return migrations
  },
}

export interface RunMigrationsResult {
  migrationName: string
  direction: 'Up' | 'Down'
  status: 'Success' | 'Error' | 'NotExecuted'
}

export const runMigrations = async (
  db: Kysely<DB>,
  direction: MigrationDirection = 'up',
): Promise<RunMigrationsResult[]> => {
  const migrator = new Migrator({ db, provider: migrationProvider })
  const result =
    direction === 'up' ? await migrator.migrateToLatest() : await migrator.migrateDown()

  if (result.error) {
    throw result.error instanceof Error ? result.error : new Error(String(result.error))
  }
  return result.results ?? []
}
