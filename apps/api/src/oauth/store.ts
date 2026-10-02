import type {
  NodeSavedSession,
  NodeSavedSessionStore,
  NodeSavedState,
  NodeSavedStateStore,
} from '@atproto/oauth-client-node'
import type { DB } from '@clairvoyant/db'
import type { Kysely } from 'kysely'

export interface OAuthStores {
  stateStore: NodeSavedStateStore
  sessionStore: NodeSavedSessionStore
}

export const createOAuthStores = (db: Kysely<DB>): OAuthStores => ({
  stateStore: {
    async get(key: string): Promise<NodeSavedState | undefined> {
      const row = await db
        .selectFrom('auth_state')
        .select('value')
        .where('key', '=', key)
        .executeTakeFirst()
      return row ? (row.value as NodeSavedState) : undefined
    },
    async set(key: string, value: NodeSavedState): Promise<void> {
      const now = new Date()
      await db
        .insertInto('auth_state')
        .values({ key, value, updated_at: now })
        .onConflict((oc) => oc.column('key').doUpdateSet({ value, updated_at: now }))
        .execute()
    },
    async del(key: string): Promise<void> {
      await db.deleteFrom('auth_state').where('key', '=', key).execute()
    },
  },
  sessionStore: {
    async get(key: string): Promise<NodeSavedSession | undefined> {
      const row = await db
        .selectFrom('auth_session')
        .select('value')
        .where('key', '=', key)
        .executeTakeFirst()
      return row ? (row.value as NodeSavedSession) : undefined
    },
    async set(key: string, value: NodeSavedSession): Promise<void> {
      const now = new Date()
      await db
        .insertInto('auth_session')
        .values({ key, value, updated_at: now })
        .onConflict((oc) => oc.column('key').doUpdateSet({ value, updated_at: now }))
        .execute()
    },
    async del(key: string): Promise<void> {
      await db.deleteFrom('auth_session').where('key', '=', key).execute()
    },
  },
})
