# Clairvoyant

An AT Protocol app for sharing calendar events and RSVPs.

pnpm workspaces, TypeScript (strict, ESM), Biome, Turborepo.

## Architecture

User data lives in PDSes. Our database is just an index, and it can be rebuilt from scratch.

The two record types, `community.lexicon.calendar.event` and `community.lexicon.calendar.rsvp`,
belong to users and live in their Personal Data Servers. When the app saves something it writes to
the user's PDS over OAuth. It never writes user records into our database.

`apps/indexer` reads the Jetstream v2 firehose and replay archive, checks every record against the
generated Lexicon schemas (`$safeValidate`), and folds events into Postgres (`packages/db`).
`apps/api` serves reads from that index. Because the index is derived entirely from the stream, it
can be dropped and rebuilt by replaying from sequence `0`. Every write is an idempotent upsert or
delete keyed by AT-URI.

```
        PDSes (source of truth)
             │  records
             ▼
   Jetstream v2 ──► apps/indexer ──► Postgres (derived index) ◄── apps/api ──► apps/web
```

- `apps/api` is a backend for the frontend. The browser never receives OAuth tokens. It holds an
  httpOnly, secure, SameSite=Lax cookie whose signed payload is only the user's DID.
- `apps/web` never talks to a PDS or to Jetstream. It only calls `apps/api`.
- `JETSTREAM_API_KEY` is read only by `apps/indexer`. Neither `apps/api` nor `apps/web` reference it.

## Indexer backfill (`INDEXER_START_SEQ`)

On a fresh index the cursor is empty, so the indexer calls `replay({ collections, afterSeq })` with
the configured start sequence. Replay backfills history and then switches over to the live tail.

- `INDEXER_START_SEQ=0` (the default): replay the whole retained archive for the two collections.
  This is a one-time backfill and can be large.
- `INDEXER_START_SEQ=<number>`: resume after an explicit sequence number.
- `INDEXER_START_SEQ=latest`: resolve the current sealed tip and skip history.

Once any event has been processed the cursor is stored in the `cursor` table, and the seed value is
ignored on later starts.

Jetstream v2 cursors are sequence numbers, not timestamps. The archive exposes no time-to-sequence
mapping (`planSnapshot` only returns `minSeq`/`maxSeq` per segment), so "start one year ago" cannot
be expressed as a start sequence. To keep only recent data, either start at `latest` (nothing before
now) or replay from `0` and filter on each event's `time` before writing. The public Jetstream
instance also requires `JETSTREAM_API_KEY` for the archive and `planSnapshot` endpoints.

## Observability (OpenTelemetry)

Both services can emit traces and metrics to any OTLP endpoint. With no endpoint configured,
telemetry is off and the SDK is not even imported, so self-hosters who don't want it pay nothing at
startup.

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318   # HTTP/protobuf, the default
export OTEL_SERVICE_NAME=clairvoyant-api                    # optional override
# for a gRPC collector instead:
# export OTEL_EXPORTER_OTLP_PROTOCOL=grpc
```

Standard `OTEL_*` variables work: `OTEL_EXPORTER_OTLP_PROTOCOL`, `OTEL_SERVICE_NAME`,
`OTEL_SDK_DISABLED`, and per-signal endpoints such as `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`. The
bootstrap lives in `packages/telemetry`.

| Signal | Where | Notes |
| --- | --- | --- |
| Server spans and `http.server.request.duration` | `apps/api` | one per request, with the Hono route pattern as `http.route` |
| `atproto.pds` spans | `apps/api` | one per PDS operation, tagged with the DID |
| `jetstream.event` spans | `apps/indexer` | one per streamed event, tagged with collection, operation, and sequence |
| `clairvoyant.indexer.events` and `clairvoyant.indexer.failures` | `apps/indexer` | counters, low-cardinality attributes only |

To try it locally, run a collector (or Jaeger) and point `OTEL_EXPORTER_OTLP_ENDPOINT` at its OTLP
HTTP port.

## Prerequisites

- Node.js 22.18 or newer (the entry points use `import.meta.main`)
- pnpm 10 (`corepack enable`)
- Docker, for Postgres 17

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

Open <http://127.0.0.1:5173>, and use `127.0.0.1` rather than `localhost`. The atproto loopback
OAuth redirect is pinned to `127.0.0.1` and cookies are host-scoped, so the SPA has to be opened on
the same host or the session cookie won't be sent. For anything beyond local use, generate a real
`COOKIE_SECRET` with `openssl rand -base64 48`.

`packages/lexicons/lexicons.json` (the installed-lexicon manifest, with CIDs) is committed so
`lex:install` is reproducible. The generated `src/generated/` tree is git-ignored and rebuilt.

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
| `pnpm check` / `pnpm check:fix` | Biome lint, format, and import sorting |

### Testing

The non-DOM packages (`db`, `lexicons`, `api`, `indexer`) use Node's built-in test runner. The two
React packages (`web`, `ui`) use Vitest, jsdom, and Testing Library. API routes are exercised
through Hono's `app.request()` against fake `Store` and `PdsPort` ports, and the indexer run loop
takes an injected stream, clock, and exit.

```bash
pnpm test                 # everything; Postgres suites skip without a database
pnpm test:integration     # only the Postgres suites
```

Integration tests need a throwaway database, and they're skipped when `TEST_DATABASE_URL` is unset:

```bash
docker compose up -d
createdb clairvoyant_test
export TEST_DATABASE_URL=postgres://app:app@localhost:5432/clairvoyant_test
pnpm test:integration
```

See [`docs/TESTING.md`](docs/TESTING.md) for the full inventory, the testability seams, and how the
isolated test databases work.

### API endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/oauth/client-metadata.json` | OAuth client metadata |
| GET | `/oauth/jwks.json` | Empty JWKS (public client) |
| GET | `/oauth/login?handle=` | Start OAuth (redirects) |
| GET | `/oauth/callback` | OAuth redirect target; sets the session cookie |
| POST | `/oauth/logout` | Revoke the session and clear the cookie |
| GET | `/health` | Liveness probe, no dependencies |
| GET | `/ready` | Readiness probe, returns `503` when Postgres is unreachable |
| GET | `/api/me` | Current DID and handle |
| GET | `/api/me/events` | Events the current user hosts or is attending (authored plus RSVP'd), each with a `role` |
| GET | `/api/events?limit=` | Public discover feed: upcoming events, randomly sampled. No session required |
| GET | `/api/events/:encodedUri/rsvps` | RSVPs for an event, from the index |
| POST | `/api/events` | Create an event record on the user's PDS. Rate limited |
| POST | `/api/events/:encodedUri/invites` | Mint a per-person invite bound to a handle's DID. Rate limited |
| POST | `/api/events/:encodedUri/rsvp` | Write the invited user's RSVP to their own PDS. Rate limited |
| GET | `/api/invites/:token` | Validate an invite for the current viewer |

### Abuse controls

Every endpoint that writes to a PDS on a user's behalf is rate limited per account with a fixed
window (`apps/api/src/rate-limit.ts`): 10 event creations and 30 invites or RSVPs per 10 minutes.
When a limit is hit the response is a `429` with `Retry-After`, `RateLimit-Limit`,
`RateLimit-Remaining`, and `RateLimit-Reset` headers. Requests without a session aren't charged,
because there's no account to charge; they get the route's own `401`.

Request bodies are capped at 32 KiB (`apps/api/src/app.ts`). The limit is checked against
`Content-Length` when present and by streaming when it isn't, and oversized bodies get a `413`. The
limiter is in-process, so a multi-instance deployment would need a shared store. The `RateLimiter`
port is where that would go.

## Running the full stack in Docker

`docker compose up -d` still starts only Postgres, so local development is unchanged. The app
services are behind the `app` profile:

```bash
docker compose --profile app up --build
```

That builds three images from the root `Dockerfile` and serves the app at
<http://127.0.0.1:8080>. Caddy serves the SPA and proxies `/api` and `/oauth` to the API, so the
browser and API share an origin. See [`docs/DEPLOY.md`](docs/DEPLOY.md) for the image layout,
production settings, security headers, and health endpoints.

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
├─ docker-compose.yml            # Postgres, plus the full stack under the `app` profile
├─ pnpm-workspace.yaml
├─ turbo.json
└─ tsconfig.base.json
```

## Dependency versions

Every dependency was resolved against the npm registry and pinned to its current latest. The
versions are visible in each `package.json`, and `pnpm-lock.yaml` is committed.

To bump the whole repo later:

```bash
pnpm up --latest -r     # update every workspace manifest to the latest version
pnpm install            # refresh the lockfile
pnpm typecheck          # turbo: build dependencies, then typecheck all packages
pnpm lint && pnpm build
```

`pnpm update --latest --recursive` does the same thing. For continuous updates, add Renovate or
Dependabot rather than doing this by hand.

### Notes on the current majors

- TypeScript 7 (the native compiler) is installed. The generated `@atproto/lex` code typechecks
  under it once `exactOptionalPropertyTypes` is disabled (see below).
- `exactOptionalPropertyTypes` is off in `tsconfig.base.json`. It isn't part of `strict`, and the
  `@atproto/lex` generated schemas aren't compatible with it. Everything else in the base config
  stays at strict defaults.
- `@atproto/lex` is a runtime dependency of `packages/lexicons`, not a devDependency. The generated
  `dist/**` files import `{ l } from '@atproto/lex'` at runtime.
- zod 4 is used. The env and route schemas use the v4 top-level formats (`z.url()`,
  `z.iso.datetime()`).

## UI

The interface is styled by `@clairvoyant/ui`, an 8-bit design system built on the Game Boy DMG
palette with NES geometry: hard 2px outlines, no corner radius, notched filled shapes, and hard
offset shadows. It ships one stylesheet and a small set of React primitives, has no styling
dependencies, and defines a light theme (the DMG screen) and a dark one (the same screen at night).

In development, <http://127.0.0.1:5173/styleguide> renders every token, component, and state. That
route is left out of production builds.

See [`packages/ui/README.md`](packages/ui/README.md) for the design rationale, the component API,
the contrast budget, and the authoring rules the test suite enforces.

## RSVP status has two spellings

The lexicon declares `status` with `knownValues`, which is advisory rather than an enum. The indexer
stores whatever the network sent, so the live index contains both forms:

```
community.lexicon.calendar.rsvp#going       4021
community.lexicon.calendar.rsvp#interested  1699
community.lexicon.calendar.rsvp#notgoing     146
going                                         32
```

Filtering on the bare name alone matches 32 of 5898 rows and drops the rest.
`packages/db/src/rsvp-status.ts` is the one place that knows both spellings: the `WHERE status IN
(...)` list and the TypeScript normaliser both come from the same constant, so they can't drift. The
API returns the raw `status` for fidelity and a normalised `status_name` for the UI.

The queries also account for two other things in the index. 1005 of those 5898 RSVPs point at events
that aren't in `event` (deleted, or older than the indexer's start sequence), so the join is
`INNER`. And 80 `(author, event)` pairs hold more than one RSVP record, sometimes with conflicting
statuses (`going` and `interested`), so `mergeMyEvents` collapses them, preferring `going` and then
the most recently indexed record.

## Remaining things to confirm

The library APIs used here were checked against the installed `.d.ts` files. The following items are
behavioural or spec-level and aren't caught by the type checker:

- The exact atproto loopback `client_id` composition (`http://localhost?redirect_uri=…&scope=…`).
  The client accepts it; confirm it against the current atproto OAuth spec before shipping.
- `new Agent(oAuthSession)` plus `com.atproto.server.getSession()` at runtime on a real PDS. This
  typechecks against `@atproto/api@0.22`.
- The deployed (non-loopback) client metadata URL at `${PUBLIC_URL}/oauth/client-metadata.json` has
  to be reachable over HTTPS.

Re-check dependency version ranges against the registry before the first install. `pnpm update`
above does that.
