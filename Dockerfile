FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=/pnpm:$PATH
ENV npm_config_store_dir=/pnpm/store
ENV TURBO_TELEMETRY_DISABLED=1
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/indexer/package.json apps/indexer/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/lexicons/package.json packages/lexicons/package.json
COPY packages/telemetry/package.json packages/telemetry/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
ARG VITE_API_BASE=
ENV VITE_API_BASE=$VITE_API_BASE
RUN pnpm build

FROM build AS api-deploy
RUN pnpm --filter @clairvoyant/api deploy --prod --legacy /out/api

FROM build AS indexer-deploy
RUN pnpm --filter @clairvoyant/indexer deploy --prod --legacy /out/indexer

FROM node:22-bookworm-slim AS api
ENV NODE_ENV=production
WORKDIR /app
COPY --from=api-deploy /out/api ./
USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]

FROM node:22-bookworm-slim AS indexer
ENV NODE_ENV=production
WORKDIR /app
COPY --from=indexer-deploy /out/indexer ./
USER node
EXPOSE 3001
CMD ["node", "dist/index.js"]

FROM caddy:2-alpine AS web
COPY --from=build /app/apps/web/dist /srv
COPY apps/web/Caddyfile /etc/caddy/Caddyfile
EXPOSE 80
