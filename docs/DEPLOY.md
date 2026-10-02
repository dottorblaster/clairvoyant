# Deploying Clairvoyant

The repository ships three container images and a Compose stack.

| Target | Contents | Port |
| --- | --- | --- |
| `api` | Hono BFF (`apps/api`) on a pruned production tree | 3000 |
| `indexer` | Jetstream consumer (`apps/indexer`) | 3001 (optional health server) |
| `web` | Vite/React SPA served by Caddy, which also proxies `/api` and `/oauth` to `api` | 80 |

All three build from the root `Dockerfile`, which has a shared `deps`/`build` stage and one runtime stage per service.

## Compose

`docker compose up -d` starts **Postgres only**, so the `pnpm dev` workflow is unchanged. The application services live behind the `app` profile:

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

The stack is served at `http://127.0.0.1:8080`. Caddy serves the SPA and reverse-proxies `/api` and `/oauth` to `api`, so the browser and the API are same-origin, `VITE_API_BASE` stays empty, and the session cookie is first-party.

The default `OAUTH_MODE=loopback` expects the browser at `127.0.0.1:8080`, which matches the published port. To log in against a real PDS, open the app on that exact host.

Override anything from the shell:

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

Remove `COOKIE_SECURE: 'false'` in production so the session cookie is `Secure`. HSTS is emitted by Caddy only when the request arrives over HTTPS, and by the API only when `NODE_ENV=production`.

`VITE_API_BASE` is baked into the SPA at build time; leave it empty when the SPA and API share an origin, or set the API origin as a build arg when they do not.

Run migrations as a separate step (the `migrate` service or `pnpm db:migrate`) before rolling out `api` and `indexer`. Never run the migrator concurrently from more than one replica.

## Security headers

The SPA is served with a strict Content-Security-Policy defined in `apps/web/Caddyfile`:

```
default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https:;
font-src 'self'; connect-src 'self'; media-src 'self'; object-src 'none';
frame-ancestors 'none'; base-uri 'self'; form-action 'self'; worker-src 'none'; manifest-src 'self'
```

The policy holds because the production bundle has no inline scripts or styles. `img-src … https:` is required because event descriptions are user-authored Markdown that may embed remote images. If the API moves to a different origin, add it to `connect-src`.

The API sets its own defense-in-depth headers (`apps/api/src/security-headers.ts`): `Content-Security-Policy: default-src 'none'`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Cross-Origin-Resource-Policy` and `Cross-Origin-Opener-Policy`, plus HSTS in production.

## Health checks

| Endpoint | Service | Meaning |
| --- | --- | --- |
| `GET /health` | api | Liveness. No dependencies. |
| `GET /ready` | api | Readiness. Runs `select 1`; `503` when Postgres is unreachable. |
| `GET /health` | indexer | Liveness. Reports whether the stream is connected. |
| `GET /ready` | indexer | Readiness. `200` while the stream is connected and an event was processed within the last 10 minutes. |

The indexer only starts its server when `HEALTH_PORT` is set. Compose wires both services' health checks to these endpoints.

## Scaling notes

The per-account rate limiter is in-process. A multi-replica deployment should move the counters to a shared store behind the `RateLimiter` port (`apps/api/src/rate-limit.ts`). The `indexer` must run as a single consumer per cursor; it is not safe to scale horizontally. The index itself is derived, so it can be dropped and rebuilt by replaying Jetstream from sequence `0`.
