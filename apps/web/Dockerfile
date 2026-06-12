# OpenTrade — apps/web production container
#
# Build context: the monorepo root (NOT apps/web). Build with:
#
#   docker build -f apps/web/Dockerfile -t opentrade-web:dev \
#     --build-arg NEXT_PUBLIC_API_URL=https://<api-dist>.cloudfront.net \
#     --build-arg NEXT_PUBLIC_PRIVY_APP_ID=<privy-app-id> \
#     .
#
# Multi-stage layout mirrors apps/api/Dockerfile (ADR-0014 conventions),
# adapted for Next.js standalone output (ADR-0046 D5):
#
#   1. base    — Node 22 + pnpm pinned to root packageManager.
#   2. deps    — only manifests + Prisma schema; `pnpm install` so this
#                layer caches whenever locks haven't moved.
#   3. builder — copies source, bakes NEXT_PUBLIC_* build args, runs
#                `next build` with `output: 'standalone'`.
#   4. runtime — minimal Debian slim image carrying only the standalone
#                server + hashed static assets.
#
# NEXT_PUBLIC_* values are compile-time constants in Next.js — they are
# inlined into the client bundles during `next build` — so they enter as
# build args, never runtime env. One image == one environment; the API
# CloudFront URL must exist before this image can be built (ADR-0046 D5).

ARG NODE_VERSION=22.22
ARG PNPM_VERSION=9.15.4

# =============================================================================
# 1. base — pnpm + certificates
# =============================================================================
FROM node:${NODE_VERSION}-slim AS base

ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV CI=true
ENV PNPM_DISABLE_NETWORK_DIAGNOSTICS=true
ENV NEXT_TELEMETRY_DISABLED=1

# python3/make/g++ are required by node-gyp to compile native optional
# deps (bufferutil, utf-8-validate — ws performance addons pulled in by
# the web3 stack). Build stages only; the runtime stage ships none of it.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    python3 \
    make \
    g++ \
 && rm -rf /var/lib/apt/lists/*

RUN corepack enable \
 && corepack prepare pnpm@${PNPM_VERSION} --activate

WORKDIR /workspace

# =============================================================================
# 2. deps — install everything the workspace needs.
#
# Copy ALL package.json files first to maximise Docker layer cache.
# Prisma schema is required because @opentrade/db's
# `postinstall: prisma generate` reads it during `pnpm install`.
# =============================================================================
FROM base AS deps

# tsconfig.base.json is needed by packages/db's prisma.config.ts (loaded
# by `prisma generate`) and by every app tsconfig that extends it.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc tsconfig.base.json ./

COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/console/package.json apps/console/
COPY packages/contracts/package.json packages/contracts/
COPY packages/db/package.json packages/db/
COPY packages/db/prisma packages/db/prisma
COPY packages/shared/package.json packages/shared/
COPY packages/config/package.json packages/config/
COPY packages/ui/package.json packages/ui/

RUN pnpm install --frozen-lockfile

# =============================================================================
# 3. builder — `next build` with standalone output.
# =============================================================================
FROM deps AS builder

# Compile-time public env. CHAIN_ID defaults to Base Sepolia (84532) per
# the env schema in apps/web/src/env.ts; the other two have no safe
# default and must be provided.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_PRIVY_APP_ID
ARG NEXT_PUBLIC_CHAIN_ID=84532
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_PRIVY_APP_ID=${NEXT_PUBLIC_PRIVY_APP_ID}
ENV NEXT_PUBLIC_CHAIN_ID=${NEXT_PUBLIC_CHAIN_ID}

# apps/web imports type-only from @opentrade/db (allowed per rule 10), so
# the build's typecheck needs packages/db source + a generated Prisma
# client. apps/api, apps/console, packages/contracts are not in the
# import graph and are deliberately not copied.
COPY apps/web ./apps/web
COPY packages/db ./packages/db
COPY packages/shared ./packages/shared
COPY packages/config ./packages/config
COPY packages/ui ./packages/ui

RUN pnpm --filter @opentrade/db db:generate

# Call `next build` directly: the package.json `build` script wraps
# `dotenv -e ../../.env`, and no .env exists inside the image (secrets
# never enter build contexts per rule 50).
RUN pnpm --filter @opentrade/web exec next build

# =============================================================================
# 4. runtime — what actually ships to ECS.
# =============================================================================
FROM node:${NODE_VERSION}-slim AS runtime

# Non-root by default per rule 50 ("never run app code as uid 0").
RUN groupadd --system --gid 1001 opentrade \
 && useradd --system --uid 1001 --gid opentrade --shell /usr/sbin/nologin opentrade

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /app

# `.next/standalone` reproduces the monorepo layout from
# `outputFileTracingRoot` (repo root): apps/web/server.js + a pruned
# node_modules with only traced runtime deps. Hashed client assets under
# `.next/static` are NOT part of standalone output and are copied
# alongside so the same process serves them (CloudFront then caches
# /_next/static/* long-TTL per ADR-0046 D4).
COPY --from=builder --chown=opentrade:opentrade /workspace/apps/web/.next/standalone ./
COPY --from=builder --chown=opentrade:opentrade /workspace/apps/web/.next/static ./apps/web/.next/static

USER opentrade

EXPOSE 3000

# `/` 307-redirects to the default locale; fetch follows redirects, so a
# healthy SSR pipeline answers 200 here.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "apps/web/server.js"]
