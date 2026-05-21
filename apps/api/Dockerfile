# OpenTrade — apps/api production container
#
# Build context: the monorepo root (NOT apps/api). Build with:
#
#   docker build -f apps/api/Dockerfile -t opentrade-api:dev .
#
# Multi-stage layout per ADR-0014:
#
#   1. base    — Node 22 + pnpm pinned to root packageManager.
#   2. deps    — only manifests + Prisma schema; runs `pnpm install` so this
#                layer caches whenever locks haven't moved.
#   3. builder — copies source, runs `tsup` to produce dist/main.js, then
#                `pnpm deploy` to materialise a self-contained tree at
#                /deploy with all production deps copied in (no pnpm
#                symlink trickery survives into the runtime image).
#   4. runtime — minimal Debian slim image carrying only /deploy.
#
# Why Debian slim rather than Alpine: Prisma's binary engines are built
# against glibc/openssl-3 by default. Running on Alpine (musl) requires
# either pinning binaryTargets in schema.prisma or a custom dance with
# libcrypto symlinks. Phase-0 prioritises correctness over the ~30 MB
# image-size delta.
#
# Image size budget (Phase 0): ~140 MB compressed (~280 MB on disk).

# --- Build args ---------------------------------------------------------------
# We pin pnpm here rather than relying on `corepack prepare` reading
# package.json; ECS task definitions deploy a single immutable image, so
# the version must be deterministic at build time.
ARG NODE_VERSION=22.13
ARG PNPM_VERSION=9.15.4

# =============================================================================
# 1. base — pnpm + non-root scaffolding
# =============================================================================
FROM node:${NODE_VERSION}-slim AS base

ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV CI=true
ENV PNPM_DISABLE_NETWORK_DIAGNOSTICS=true

# OpenSSL is bundled in node:22-slim but Prisma's runtime probes for it
# via libssl.so.* lookups. Installing the package explicitly keeps that
# probe happy across slim image variants.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
 && rm -rf /var/lib/apt/lists/*

RUN corepack enable \
 && corepack prepare pnpm@${PNPM_VERSION} --activate

WORKDIR /workspace

# =============================================================================
# 2. deps — install everything the workspace needs.
#
# Copy ALL package.json files first to maximise Docker layer cache. This
# layer only invalidates when a manifest or the lockfile actually changes.
# Prisma schema is also required here because @opentrade/db's
# `postinstall: prisma generate` reads it during `pnpm install`.
# =============================================================================
FROM base AS deps

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./

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
# 3. builder — build apps/api, then `pnpm deploy` into /deploy.
# =============================================================================
FROM deps AS builder

# Copy only the source apps/api transitively depends on. apps/web,
# apps/console, packages/contracts, packages/ui are not in the import
# graph; pulling them in would invalidate this cache layer for any
# unrelated frontend / contract change.
COPY apps/api ./apps/api
COPY packages/db ./packages/db
COPY packages/shared ./packages/shared
COPY packages/config ./packages/config

# tsup produces dist/main.js + sourcemap with workspace deps inlined and
# `@prisma/client` + `pino-pretty` left external (per ADR-0014 D2).
RUN pnpm --filter @opentrade/api build

# `pnpm deploy` writes a self-contained directory layout for production:
#
#   /deploy/package.json
#   /deploy/dist/main.js  (built above)
#   /deploy/node_modules/@prisma/client      (real dir, not a pnpm symlink)
#   /deploy/node_modules/<…runtime deps…>
#
# The `--ignore-scripts` is required because `@opentrade/db`'s postinstall
# runs `prisma generate`, which needs the `prisma` CLI — but that CLI is
# a devDep and `--prod` excludes it. The generated client + engines
# already live under packages/db/node_modules/.prisma from the deps-stage
# install; we copy that artefact into /deploy after the deploy completes.
RUN pnpm --filter @opentrade/api --prod deploy --ignore-scripts /deploy

# Fold the prisma-generated client + binary engines into /deploy so the
# runtime stage can be a single COPY. `prisma generate` runs as part of
# @opentrade/db's postinstall during the deps stage; the output lands in
# pnpm's `.pnpm` content store at:
#
#   /workspace/node_modules/.pnpm/@prisma+client@<ver>_<hash>/node_modules/.prisma
#
# The hash suffix changes with deps so we resolve it dynamically. `cp -rL`
# dereferences any symlinks so /deploy gets real files.
RUN set -eu; \
    PRISMA_GEN_DIR="$(find /workspace/node_modules/.pnpm -maxdepth 3 -type d -name '.prisma' | head -n 1)"; \
    if [ -z "$PRISMA_GEN_DIR" ]; then \
      echo 'FATAL: cannot locate prisma-generated .prisma/ in pnpm store'; \
      exit 1; \
    fi; \
    echo "Copying $PRISMA_GEN_DIR → /deploy/node_modules/.prisma"; \
    cp -rL "$PRISMA_GEN_DIR" /deploy/node_modules/.prisma

# =============================================================================
# 4. runtime — what actually ships to ECS.
# =============================================================================
FROM node:${NODE_VERSION}-slim AS runtime

# Non-root by default per rule 50 ("never run app code as uid 0").
RUN groupadd --system --gid 1001 opentrade \
 && useradd --system --uid 1001 --gid opentrade --shell /usr/sbin/nologin opentrade

# Same OpenSSL install as the base layer; runtime has its own root.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
# tsx / pino / Prisma read these. ECS task env can override at launch.
ENV SERVER_HOST=0.0.0.0
ENV SERVER_PORT=4000
ENV LOG_LEVEL=info

WORKDIR /app

COPY --from=builder --chown=opentrade:opentrade /deploy ./

USER opentrade

EXPOSE 4000

# Smoke healthcheck: `/v1/health` returns 200 when the DB is reachable
# and 503 otherwise (per Commit number-five). ECS task definitions in
# Phase 1 will add their own healthCheck block; this one is here for
# `docker run` validation and any non-ECS scheduler that might reuse
# this image.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || process.env.SERVER_PORT || 4000) + '/v1/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist/main.js"]
