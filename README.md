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

## Observability (OpenTelemetry)

Both services emit traces and metrics to any OTLP endpoint, and start nothing at all when none is
configured: the OpenTelemetry SDK is only imported once `OTEL_EXPORTER_OTLP_ENDPOINT` is set, so a
self-hoster who does not want telemetry pays no startup cost.

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318   # HTTP/protobuf, the default
export OTEL_SERVICE_NAME=clairvoyant-api                    # optional override
# gRPC collectors instead:
# export OTEL_EXPORTER_OTLP_PROTOCOL=grpc
```

Standard `OTEL_*` variables are honoured (`OTEL_EXPORTER_OTLP_PROTOCOL`, `OTEL_SERVICE_NAME`,
`OTEL_SDK_DISABLED`, per-signal endpoints such as `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`). The
telemetry bootstrap lives in `packages/telemetry`.

| Signal | Where | Notes |
| --- | --- | --- |
| Server spans + `http.server.request.duration` | `apps/api` | one per request, with the Hono route pattern as `http.route` |
| `atproto.pds` spans | `apps/api` | one per PDS operation, tagged with the DID |
| `jetstream.event` spans | `apps/indexer` | one per streamed event, tagged with collection, operation and sequence |
| `clairvoyant.indexer.events` / `clairvoyant.indexer.failures` | `apps/indexer` | counters with low-cardinality attributes only |

To try it locally, run a collector (or Jaeger) and point `OTEL_EXPORTER_OTLP_ENDPOINT` at its OTLP
HTTP port.

## Prerequisites

- Node.js >= 22.18 (the entry points gate on `import.meta.main`)
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
| `pnpm test:integration` | The Postgres-backed suites (needs `TEST_DATABASE_URL`) |
| `pnpm test:coverage` | Coverage for every package |
| `pnpm update` | Bump every workspace dependency to its latest version and reinstall |
| `pnpm check` / `pnpm check:fix` | Biome lint + format + import sorting |

### Testing

Non-DOM packages (`db`, `lexicons`, `api`, `indexer`) use Node's built-in test runner;
the two React packages (`web`, `ui`) use Vitest + jsdom + Testing Library. API routes are
exercised through Hono's `app.request()` against fake `Store`/`PdsPort` ports, and the
indexer run loop takes an injected stream, clock and exit.

```bash
pnpm test                 # everything; Postgres suites skip without a database
pnpm test:integration     # only the Postgres suites
```

Integration tests need a throwaway database and are skipped when `TEST_DATABASE_URL` is
unset:

```bash
docker compose up -d
createdb clairvoyant_test
export TEST_DATABASE_URL=postgres://app:app@localhost:5432/clairvoyant_test
pnpm test:integration
```

See [`docs/TESTING.md`](docs/TESTING.md) for the full inventory, the testability seams
and how the isolated test databases work.

### API endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/oauth/client-metadata.json` | OAuth client metadata |
| GET | `/oauth/jwks.json` | Empty JWKS (public client) |
| GET | `/oauth/login?handle=` | Start OAuth (redirects) |
| GET | `/oauth/callback` | OAuth redirect target; sets the session cookie |
| POST | `/oauth/logout` | Revoke session + clear cookie |
| GET | `/api/me` | Current DID/handle |
| GET | `/api/me/events` | Events the current user hosts **or is attending** (authored + RSVP'd), each with a `role` |
| GET | `/api/events?limit=` | Public discover feed: upcoming events, randomly sampled. No session required |
| GET | `/api/events/:encodedUri/rsvps` | RSVPs for an event (from the index) |
| POST | `/api/events` | Create an event record **on the user's PDS** — rate limited |
| POST | `/api/events/:encodedUri/invites` | Mint a per-person invite bound to a handle's DID — rate limited |
| POST | `/api/events/:encodedUri/rsvp` | Write the invited user's RSVP **to their own PDS** — rate limited |
| GET | `/api/invites/:token` | Validate an invite for the current viewer |

### Abuse controls

Every endpoint that makes the API write to a PDS on a user's behalf is charged to
that account's own fixed window (`apps/api/src/rate-limit.ts`): 10 event creations
and 30 invites/RSVPs per 10 minutes. A limited response is a `429` with
`Retry-After`, `RateLimit-Limit`, `RateLimit-Remaining` and `RateLimit-Reset`
headers. Requests with no session are left to the route's own `401`, because there
is no account to charge yet.

All request bodies are capped at 32 KiB (`apps/api/src/app.ts`), enforced against
`Content-Length` when present and by streaming when it is not; oversized bodies get
a `413`. The limiter is in-process, so a multi-instance deployment would move the
counters to a shared store; the `RateLimiter` port is the seam for that.

## Layout

```
.
├─ lexicons/                     # raw Lexicon JSON (installed community.* lexicons)
├─ packages/
│  ├─ lexicons/                  # generated Lexicon types from `lex build`
│  ├─ ui/                        # design system: tokens, CSS layers, React primitives
│  ├─ telemetry/                 # optional OpenTelemetry (OTLP) bootstrap
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

## RSVP status has two spellings

The lexicon declares `status` with `knownValues` (advisory, **not** an `enum`), and the indexer stores
whatever the network sent verbatim. So the live index contains both:

```
community.lexicon.calendar.rsvp#going       4021
community.lexicon.calendar.rsvp#interested  1699
community.lexicon.calendar.rsvp#notgoing     146
going                                         32
```

Filtering on the bare name alone therefore matches 32 of 5898 rows and silently drops the rest.
`packages/db/src/rsvp-status.ts` is the single source of truth for both spellings: the `WHERE status IN
(...)` list is derived from the same constant as the TypeScript normaliser, so they cannot drift. The
API keeps the raw `status` for fidelity and adds a normalised `status_name` for the UI.

Two more things the index does that the queries account for: 1005 of those 5898 RSVPs point at events
that are not in `event` (deleted, or predating the indexer's start sequence), so the join is `INNER`;
and 80 `(author, event)` pairs hold more than one RSVP record — some disagreeing (`going` +
`interested`) — so `mergeMyEvents` collapses them, preferring `going` and then the most recently
indexed record.

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
