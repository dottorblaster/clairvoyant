# Clairvoyant

An AT Protocol application for sharing calendar events and RSVPs.
pnpm workspaces · TypeScript (strict, ESM) · Biome · Turborepo.

## Architecture

**User data lives in PDSes. The database is a rebuildable index.**

Records (`community.lexicon.calendar.event`, `community.lexicon.calendar.rsvp`) are owned by users
and stored in their Personal Data Servers on the AT Protocol network. When the app writes something
it writes to the user's PDS over OAuth — it never writes user records to our database directly.

`apps/indexer` consumes the **Jetstream v2** firehose/replay stream, validates every record against
the generated Lexicon schemas (`$safeValidate`), and folds events into Postgres (`packages/db`).
Reads in `apps/api` are served from that derived index. Because the index is fully derived, it can be
dropped and rebuilt by replaying the stream from sequence `0`, and all writes are idempotent
(upsert/delete keyed by AT-URI).

```
        PDSes (source of truth)
             │  records
             ▼
   Jetstream v2 ──► apps/indexer ──► Postgres (derived index) ◄── apps/api ──► apps/web
```

- `apps/api` is a backend-for-frontend: the browser never receives OAuth tokens. The browser holds
  an httpOnly/secure/sameSite=lax cookie whose signed payload is only the user's DID.
- `apps/web` never talks to a PDS or Jetstream; it only calls `apps/api`.
- `JETSTREAM_API_KEY` is a secret read **only** by `apps/indexer`; it is never referenced by
  `apps/api` or `apps/web`.

## Indexer backfill (`INDEXER_START_SEQ`)

On a fresh index the cursor is empty, so the indexer calls `replay({ collections, afterSeq })`
with the configured start sequence. Jetstream's `replay` backfills history and then cuts over to
the live tail.

- `INDEXER_START_SEQ=0` (default) replays the **entire retained archive** for the two collections —
  a one-time, potentially large backfill.
- `INDEXER_START_SEQ=<number>` resumes after an explicit sequence number.
- `INDEXER_START_SEQ=latest` resolves the current sealed tip and skips history.

Once any event is processed the cursor is persisted in the `cursor` table and later starts ignore
the seed value.

**Jetstream v2 cursors are sequence numbers, not timestamps.** The archive exposes no time→seq
mapping (`planSnapshot` returns only `minSeq`/`maxSeq` per segment), so "start one year ago" cannot
be expressed as a start sequence. To keep only recent data you must either start at `latest`
(nothing before now) or replay from `0` and filter by each event's `time` before writing. The public
Jetstream instance also requires `JETSTREAM_API_KEY` for the archive/`planSnapshot` endpoints.

## Prerequisites

- Node.js current LTS (>= 22)
- pnpm 10 (`corepack enable`)
- Docker (for Postgres 17)

## First run

```bash
pnpm i                 # install workspace dependencies
pnpm lex:install       # fetch community.lexicon.calendar.{event,rsvp} into ./lexicons
                       #   (writes the committed manifest packages/lexicons/lexicons.json)
pnpm lex:build         # generate TypeScript bindings into packages/lexicons/src/generated
pnpm --filter @clairvoyant/ui build
                       # compile the design system's React primitives into packages/ui/dist
                       #   (its stylesheet is imported from source, so this is only
                       #   needed before `pnpm dev`; `pnpm build`/`typecheck` do it for you)
docker compose up -d   # start Postgres 17
cp packages/db/.env.example packages/db/.env
cp apps/api/.env.example apps/api/.env
cp apps/indexer/.env.example apps/indexer/.env
cp apps/web/.env.example apps/web/.env
pnpm db:migrate        # create tables
pnpm dev               # turbo: api + indexer + web
```

Then open <http://127.0.0.1:5173> — **use `127.0.0.1`, not `localhost`**. The atproto loopback
OAuth redirect is pinned to `127.0.0.1`, and cookies are host-scoped, so the SPA must be opened on
the same host or the session cookie will not be sent. Generate a real `COOKIE_SECRET` for anything
beyond local use: `openssl rand -base64 48`.

> `packages/lexicons/lexicons.json` (the installed-lexicon manifest with CIDs) is committed so
> `lex:install` is reproducible; the generated `src/generated/` tree is git-ignored and rebuilt.

### Useful scripts

| Command | Description |
| --- | --- |
| `pnpm dev` / `pnpm build` / `pnpm lint` / `pnpm typecheck` / `pnpm test` | Turborepo tasks |
| `pnpm lex:install` | `lex install` the community lexicons (writes the manifest) |
| `pnpm lex:build` | `lex build` generated TypeScript types |
| `pnpm db:migrate` / `pnpm db:migrate:down` | Kysely migrations |
| `pnpm update` | Bump every workspace dependency to its latest version and reinstall |
| `pnpm check` / `pnpm check:fix` | Biome lint + format + import sorting |

### API endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/oauth/client-metadata.json` | OAuth client metadata |
| GET | `/oauth/jwks.json` | Empty JWKS (public client) |
| GET | `/oauth/login?handle=` | Start OAuth (redirects) |
| GET | `/oauth/callback` | OAuth redirect target; sets the session cookie |
| POST | `/oauth/logout` | Revoke session + clear cookie |
| GET | `/api/me` | Current DID/handle |
| GET | `/api/me/events` | Events authored by the current user (from the index) |
| GET | `/api/events?limit=` | Public discover feed: upcoming events, randomly sampled. No session required |
| GET | `/api/events/:encodedUri/rsvps` | RSVPs for an event (from the index) |
| POST | `/api/events` | Create an event record **on the user's PDS** |

## Layout

```
.
├─ lexicons/                     # raw Lexicon JSON (installed community.* lexicons)
├─ packages/
│  ├─ lexicons/                  # generated Lexicon types from `lex build`
│  ├─ ui/                        # design system: tokens, CSS layers, React primitives
│  └─ db/                        # Kysely schema, migrations, typed queries
├─ apps/
│  ├─ api/                       # Hono + BFF OAuth + XRPC
│  ├─ indexer/                   # Jetstream v2 consumer
│  └─ web/                       # Vite + React + TanStack Query
├─ docker-compose.yml            # Postgres 17 only
├─ pnpm-workspace.yaml
├─ turbo.json
└─ tsconfig.base.json
```

## Dependency versions

Every dependency was resolved against the npm registry and pinned to its current latest. The
current versions are visible in each `package.json`, and `pnpm-lock.yaml` is committed.

To bump the whole repo later:

```bash
pnpm up --latest -r     # update every workspace manifest to the latest version
pnpm install            # refresh the lockfile
pnpm typecheck          # turbo: build dependencies, then typecheck all packages
pnpm lint && pnpm build
```

Alternatives that do the same thing: `pnpm update --latest --recursive` (alias), or
`pnpm dlx npm-check-updates -u -ws && pnpm install`. For continuous updates, add Renovate or
Dependabot rather than doing this by hand.

### Notes on the current majors

- **TypeScript 7** (the native compiler) is installed. `@atproto/lex`'s generated code was verified
  to typecheck under it once `exactOptionalPropertyTypes` is disabled (see below).
- **`exactOptionalPropertyTypes` is off** in `tsconfig.base.json`. It is *not* part of `strict`,
  and the `@atproto/lex` generated schemas are not compatible with it. Everything else in the base
  config remains at strict defaults.
- **`@atproto/lex` is a runtime dependency** of `packages/lexicons` (not a devDependency): the
  generated `dist/**` files `import { l } from '@atproto/lex'` at runtime.
- **zod 4** is used; the env/route schemas use the v4 top-level formats (`z.url()`, `z.iso.datetime()`).

## UI

The interface is styled by `@clairvoyant/ui` — an 8-bit design system built on the
Game Boy DMG palette with NES geometry (hard 2px outlines, zero corner radius,
notched filled shapes, hard offset shadows). It ships one stylesheet and a small
set of React primitives, has no styling dependencies, and defines both a light
theme (the DMG screen) and a dark theme (the same screen at night).

In development, <http://127.0.0.1:5173/styleguide> renders every token, component
and state. That route is compiled out of production builds.

See [`packages/ui/README.md`](packages/ui/README.md) for the rationale, the
component API, the contrast budget and the authoring rules the test suite
enforces.

## Remaining things to confirm

The library APIs used here were verified against the installed `.d.ts` files. The items below are
behavioural/spec-level and are not enforced by the type checker:

- The exact atproto **loopback `client_id`** composition (`http://localhost?redirect_uri=…&scope=…`).
  The client accepts it, but confirm against the current atproto OAuth spec before shipping.
- `new Agent(oAuthSession)` + `com.atproto.server.getSession()` at runtime on a real PDS (this
  type-checks against `@atproto/api@0.22`).
- The deployed (non-loopback) client metadata URL served at
  `${PUBLIC_URL}/oauth/client-metadata.json` must be reachable over HTTPS.

Package version ranges should still be re-checked against the registry before the first install;
`pnpm update` above does that automatically.
