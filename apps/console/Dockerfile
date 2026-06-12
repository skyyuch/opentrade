# OpenTrade — apps/console production container
#
# Build context: the monorepo root (NOT apps/console). Build with:
#
#   docker build -f apps/console/Dockerfile -t opentrade-console:dev \
#     --build-arg NEXT_PUBLIC_API_URL=https://<api-dist>.cloudfront.net \
#     --build-arg NEXT_PUBLIC_PRIVY_APP_ID=<privy-app-id> \
#     .
#
# Mirrors apps/web/Dockerfile — see that file for the full rationale
# (multi-stage layout, build-arg-baked NEXT_PUBLIC_* values, standalone
# output, non-root runtime; ADR-0014 conventions + ADR-0046 D5).
# The two files differ only in the app directory. The console-specific
# robots-disallow posture (ADR-0010) lives in app code + CloudFront
# headers, not here.

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

# python3/make/g++: node-gyp toolchain for native optional deps
# (bufferutil, utf-8-validate). Build stages only.
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

ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_PRIVY_APP_ID
ARG NEXT_PUBLIC_CHAIN_ID=84532
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_PRIVY_APP_ID=${NEXT_PUBLIC_PRIVY_APP_ID}
ENV NEXT_PUBLIC_CHAIN_ID=${NEXT_PUBLIC_CHAIN_ID}

COPY apps/console ./apps/console
COPY packages/db ./packages/db
COPY packages/shared ./packages/shared
COPY packages/config ./packages/config
COPY packages/ui ./packages/ui

RUN pnpm --filter @opentrade/db db:generate

RUN pnpm --filter @opentrade/console exec next build

# =============================================================================
# 4. runtime — what actually ships to ECS.
# =============================================================================
FROM node:${NODE_VERSION}-slim AS runtime

RUN groupadd --system --gid 1001 opentrade \
 && useradd --system --uid 1001 --gid opentrade --shell /usr/sbin/nologin opentrade

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /app

COPY --from=builder --chown=opentrade:opentrade /workspace/apps/console/.next/standalone ./
COPY --from=builder --chown=opentrade:opentrade /workspace/apps/console/.next/static ./apps/console/.next/static

USER opentrade

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "apps/console/server.js"]
