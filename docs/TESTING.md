# Testing

Two runners, chosen by whether the code under test needs a DOM:

| Packages | Runner | Why |
| --- | --- | --- |
| `packages/db`, `packages/lexicons`, `apps/api`, `apps/indexer` | Node's built-in `node:test` | No DOM, zero test dependencies. Tests import the compiled `dist/`, which also smoke-tests NodeNext emission. |
| `apps/web`, `packages/ui` | [Vitest](https://vitest.dev) + jsdom + Testing Library | The React SPA and its DOM behaviours need a real DOM. Vitest is Vite-native, so `import.meta.env` and TSX work. |

Non-DOM test files live next to the code in `src/` and are named `*.test.ts`; Postgres
integration files are `*.integration.test.ts`. DOM tests are `*.test.tsx`.

```bash
pnpm test                     # turbo: every package, integration skipped without a DB
pnpm test:integration         # only the Postgres suites (needs TEST_DATABASE_URL)
pnpm test:coverage            # coverage for every package
pnpm --filter @clairvoyant/web test:watch   # Vitest watch
```

## Integration tests (Postgres)

`packages/db`, `apps/indexer` and the `db:migrate` path are exercised against a real
Postgres. They are skipped unless `TEST_DATABASE_URL` is set, so `pnpm test` works
without Docker.

```bash
docker compose up -d
createdb clairvoyant_test      # or: psql -c 'CREATE DATABASE clairvoyant_test'
export TEST_DATABASE_URL=postgres://app:app@localhost:5432/clairvoyant_test
pnpm test:integration
```

Each `createTestDatabase()` call (`@clairvoyant/db/testing`) creates its own
randomly-named **database**, runs the migrations, and drops it on `dispose()`. This
matters: Node runs test files in parallel processes, and a per-*schema* approach does
not work because Kysely's migrator decides whether its bookkeeping tables exist via
`introspection.getTables()`, which ignores `search_path` and would see another schema's
`kysely_migration_lock`.

## What is covered

- **`packages/db`** — pure `rsvp-status` and query logic; `readCursor`/`writeCursor`;
  the migration registry; the CLI; and, against Postgres, idempotent upserts, deletes,
  the `deleteAllByDid` scoping, the `INNER JOIN` that drops orphan RSVPs, both status
  spellings, ordering, the two-tier discover feed, invites, the bigint cursor and
  `migrate up/down`.
- **`packages/lexicons`** — the NSID constants and the generated `$safeValidate`
  contract the indexer relies on (including the advisory-`knownValues` behaviour).
- **`apps/api`** — `env`, `logger`, the signed session cookie, invite tokens, OAuth
  metadata/stores, the PDS record helpers, and every route exercised through Hono's
  `app.request()` with fakes for the `Store`/`PdsPort` ports (auth, validation, invite
  enforcement, PDS failures and success paths).
- **`apps/indexer`** — `env`, `logger`, record parsing, Lexicon validation, the Jetstream
  metadata call, retry/backoff classification, the projector (unit + Postgres), the run
  loop (injected stream/clock/exit) and the `find-start-seq` search.
- **`apps/web`** — pure `lib/` logic, the API client against a fake fetch, and every
  page/component with Testing Library and a URL-routing fetch stub.
- **`packages/ui`** — the existing static-render, icon, theme and stylesheet suites,
  plus jsdom interaction tests for `Modal` (Escape, backdrop, scroll lock, focus) and
  `ThemeToggle` (`matchMedia` listener lifecycle).

## Testability seams

A few production modules were split so that behaviour could be tested without a server,
database or browser:

- `apps/api` depends on `Store` and `PdsPort` interfaces (adapters in `store.ts`,
  `pds.ts`) instead of importing `@clairvoyant/db` and `@atproto/api` directly.
- `apps/indexer` depends on a `ProjectorStore` port; `runIndexer(runtime)` takes the
  stream, clock, exit and abort signal as arguments.
- Entry points (`apps/api/src/index.ts`, `apps/indexer/src/index.ts`,
  `packages/db/src/migrate.ts`, `find-start-seq.ts`) are guarded with
  `import.meta.main`, so importing them in a test has no side effects.
- `apps/web` extracts its API client (`createApi`), navigation (`navigate.ts`) and pure
  view logic (`eventUri`, `eventSections`, `roles`, `handle`, `format`) out of the
  components.

## Coverage

`pnpm test:coverage` reports coverage; it is not wired to a threshold yet. Rough
baselines: `packages/db` ~96% lines, `apps/web` ~97% lines / ~86% branches.

## Continuous integration

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs, for every push to
`main` and every pull request, on a Node 22/24 matrix:

1. `pnpm install --frozen-lockfile`
2. `pnpm check` (Biome lint + format + import order)
3. `pnpm build` (generates the Lexicon bindings and builds every package)
4. `pnpm typecheck`
5. `pnpm test` (unit; the Postgres suites skip because `TEST_DATABASE_URL` is unset)
6. `pnpm test:integration` with a `postgres:17` service and `TEST_DATABASE_URL` set

The Lexicon manifest and raw JSON are committed, so `lex:build` runs offline and no
`lex:install` step is needed.
