# Deploying Clairvoyant

The repo builds three container images, plus a Compose stack for running them together.

| Target | What it is | Port |
| --- | --- | --- |
| `api` | Hono BFF (`apps/api`) on a pruned production tree | 3000 |
| `indexer` | Jetstream consumer (`apps/indexer`) | 3001 (optional health server) |
| `web` | Vite/React SPA served by Caddy, which also proxies `/api` and `/oauth` to `api` | 80 |

All three build from the root `Dockerfile`. It has shared `deps` and `build` stages and one runtime
stage per service.

## Compose

`docker compose up -d` starts only Postgres, so the `pnpm dev` workflow is unchanged. The app
services are behind the `app` profile:

```bash
docker compose --profile app up --build
```

| Service | Role |
| --- | --- |
| `postgres` | Postgres 17, published on `5432` |
| `migrate` | One-shot `@clairvoyant/db` migration, runs before `api` and `indexer` |
| `api` | BFF, internal only |
| `indexer` | Jetstream consumer, internal only |
| `web` | Caddy edge, published on `127.0.0.1:${WEB_PORT:-8080}` |

The stack is served at <http://127.0.0.1:8080>. Caddy serves the SPA and proxies `/api` and
`/oauth` to `api`, so the browser and the API are same-origin, `VITE_API_BASE` stays empty, and the
session cookie is first-party.

The default `OAUTH_MODE=loopback` expects the browser at `127.0.0.1:8080`, which matches the
published port. Open the app on that host to log in against a real PDS.

Any setting can be overridden from the shell:

```bash
COOKIE_SECRET="$(openssl rand -base64 48)" JETSTREAM_API_KEY=gk_… docker compose --profile app up --build
```

## Production

For a real deployment, terminate TLS at the edge and set:

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `OAUTH_MODE` | `web` |
| `PUBLIC_URL` | public HTTPS origin of the API, e.g. `https://api.example.com` |
| `WEB_ORIGIN` | public HTTPS origin of the SPA |
| `COOKIE_SECRET` | 32+ random bytes from a secret store |
| `DATABASE_URL` | managed Postgres |
| `JETSTREAM_API_KEY` | the Jetstream archive key (indexer only) |

Drop `COOKIE_SECURE: 'false'` in production so the session cookie is `Secure`. Caddy sends HSTS only
when the request arrives over HTTPS, and the API sends it only when `NODE_ENV=production`.

`VITE_API_BASE` is baked into the SPA at build time. Leave it empty when the SPA and API share an
origin, or set it to the API origin as a build arg when they don't.

Run migrations as a separate step (the `migrate` service, or `pnpm db:migrate`) before rolling out
`api` and `indexer`. Don't run the migrator concurrently from more than one replica.

## Security headers

The SPA is served with a strict CSP, defined in `apps/web/Caddyfile`:

```
default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https:;
font-src 'self'; connect-src 'self'; media-src 'self'; object-src 'none';
frame-ancestors 'none'; base-uri 'self'; form-action 'self'; worker-src 'none'; manifest-src 'self'
```

The policy works because the production bundle has no inline scripts or styles. `img-src … https:`
is there because event descriptions are user-authored Markdown that can embed remote images. If the
API moves to a different origin, add it to `connect-src`.

The API sets its own headers in `apps/api/src/security-headers.ts`: `Content-Security-Policy:
default-src 'none'`, plus `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
`Cross-Origin-Resource-Policy`, `Cross-Origin-Opener-Policy`, and HSTS in production.

## Health checks

| Endpoint | Service | Meaning |
| --- | --- | --- |
| `GET /health` | api | Liveness. No dependencies. |
| `GET /ready` | api | Readiness. Runs `select 1`; returns `503` when Postgres is unreachable. |
| `GET /health` | indexer | Liveness. Reports whether the stream is connected. |
| `GET /ready` | indexer | Readiness. Returns `200` while the stream is connected and an event was processed in the last 10 minutes. |

The indexer only starts its server when `HEALTH_PORT` is set. Compose wires both services' health
checks to these endpoints.

## Scaling

The per-account rate limiter is in-process. A multi-replica deployment needs a shared store behind
the `RateLimiter` port (`apps/api/src/rate-limit.ts`). Run one `indexer` per cursor; it isn't safe to
scale horizontally. The index is derived, so it can be dropped and rebuilt by replaying Jetstream
from sequence `0`.
