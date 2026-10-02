# Testing

There are two runners, picked by whether the code under test needs a DOM:

| Packages | Runner | Notes |
| --- | --- | --- |
| `packages/db`, `packages/lexicons`, `apps/api`, `apps/indexer` | Node's built-in `node:test` | No DOM, no test dependencies. Tests import the compiled `dist/`, which also checks NodeNext emission. |
| `apps/web`, `packages/ui` | [Vitest](https://vitest.dev) + jsdom + Testing Library | The React SPA and its DOM behaviour need a real DOM. Vitest is Vite-native, so `import.meta.env` and TSX work. |

Non-DOM test files sit next to the code in `src/` and end in `*.test.ts`. Postgres integration files
end in `*.integration.test.ts`. DOM tests end in `*.test.tsx`.

```bash
pnpm test                     # turbo: every package, integration skipped without a DB
pnpm test:integration         # only the Postgres suites (needs TEST_DATABASE_URL)
pnpm test:coverage            # coverage for every package
pnpm --filter @clairvoyant/web test:watch   # Vitest watch
```

## Integration tests (Postgres)

`packages/db`, `apps/indexer`, and the `db:migrate` path run against a real Postgres. They're skipped
unless `TEST_DATABASE_URL` is set, so `pnpm test` works without Docker.

```bash
docker compose up -d
createdb clairvoyant_test      # or: psql -c 'CREATE DATABASE clairvoyant_test'
export TEST_DATABASE_URL=postgres://app:app@localhost:5432/clairvoyant_test
pnpm test:integration
```

Each `createTestDatabase()` call (`@clairvoyant/db/testing`) creates its own randomly named database,
runs the migrations, and drops it on `dispose()`. It has to be a separate database, not a schema.
Node runs test files in parallel processes, and Kysely's migrator checks for its bookkeeping tables
with `introspection.getTables()`, which ignores `search_path` and would see another schema's
`kysely_migration_lock`.

## What is covered

- `packages/db`: the rsvp-status and query logic, `readCursor`/`writeCursor`, the migration registry,
  and the CLI. Against Postgres: idempotent upserts, deletes, `deleteAllByDid` scoping, the `INNER
  JOIN` that drops orphan RSVPs, both status spellings, ordering, the two-tier discover feed,
  invites, the bigint cursor, and `migrate up/down`.
- `packages/lexicons`: the NSID constants and the generated `$safeValidate` contract the indexer
  relies on, including how advisory `knownValues` behaves.
- `packages/telemetry`: the OTLP enable/disable gate (no endpoint, per-signal endpoints,
  `OTEL_SDK_DISABLED`), the no-op handle, and `withSpan` with no tracer provider registered.
- `apps/api`: env, logger, the signed session cookie, invite tokens, OAuth metadata and stores, the
  PDS record helpers, the rate limiter, and every route through Hono's `app.request()` with fakes for
  the `Store` and `PdsPort` ports (auth, validation, invite enforcement, rate limiting, the body cap,
  PDS failures, and success paths).
- `apps/indexer`: env, logger, record parsing, Lexicon validation, the Jetstream metadata call,
  retry and backoff classification, the projector (unit and Postgres), the run loop with an injected
  stream, clock, and exit, and the `find-start-seq` search.
- `apps/web`: the pure `lib/` logic, the API client against a fake fetch, and every page and
  component with Testing Library.
- `packages/ui`: the static render, icon, theme, and stylesheet suites, plus jsdom interaction tests
  for `Modal` (Escape, backdrop, scroll lock, focus) and `ThemeToggle` (the `matchMedia` listener
  lifecycle).

## Testability seams

Some production modules are split so their behaviour can be tested without a server, a database, or a
browser:

- `apps/api` depends on the `Store` and `PdsPort` interfaces (adapters in `store.ts` and `pds.ts`)
  instead of importing `@clairvoyant/db` and `@atproto/api` directly. Its rate limiters come in
  through `AppDeps.limits` (`rate-limit.ts`), so a test can supply a fake clock and a small window.
- `apps/indexer` depends on a `ProjectorStore` port. `runIndexer(runtime)` takes the stream, clock,
  exit, and abort signal as arguments.
- Entry points (`apps/api/src/index.ts`, `apps/indexer/src/index.ts`, `packages/db/src/migrate.ts`,
  and `find-start-seq.ts`) are guarded with `import.meta.main`, so importing them in a test has no
  side effects.
- `apps/web` extracts its API client (`createApi`), navigation (`navigate.ts`), and view logic
  (`eventUri`, `eventSections`, `roles`, `handle`, `format`) out of the components.

## Coverage

`pnpm test:coverage` reports coverage. There's no threshold wired up yet. Rough baselines:
`packages/db` around 96% lines, `apps/web` around 97% lines and 86% branches.

## Continuous integration

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs on every push to `main` and every
pull request, across a Node 22/24 matrix:

1. `pnpm install --frozen-lockfile`
2. `pnpm check` (Biome lint, format, and import order)
3. `pnpm build` (generates the Lexicon bindings and builds every package)
4. `pnpm typecheck`
5. `pnpm test` (unit; the Postgres suites skip because `TEST_DATABASE_URL` is unset)
6. `pnpm test:integration` with a `postgres:17` service and `TEST_DATABASE_URL` set

A separate `images` job builds the `api`, `indexer`, and `web` Docker targets.

The Lexicon manifest and raw JSON are committed, so `lex:build` runs offline and CI doesn't need a
`lex:install` step.
