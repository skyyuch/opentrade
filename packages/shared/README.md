# `@opentrade/shared`

> Cross-cutting types, enums, and pure utilities used across the OpenTrade monorepo.

## Purpose

This package is the **bottom of the dependency graph**. It contains:

- Shared TypeScript types (e.g. `Review`, `User`, `Sentiment`)
- Shared enums (e.g. `ErrorCode`)
- Pure utility functions (no I/O, no framework dependency)
- Branded types (`UserId`, `ReviewId`, etc.)

## Rules

- ❌ **No runtime dependencies on Next.js, Hono, Prisma, viem, React, etc.**
- ❌ No code that imports Node's `fs`, `child_process`, etc.
- ❌ No browser globals (`window`, `document`)
- ✅ Pure TypeScript / pure functions only
- ✅ Anything here can be safely imported by any other package

## Status

Phase 0 stub. Real types and utilities will be added as we build features.

See [`docs/01-architecture.md`](../../docs/01-architecture.md) for the full architecture.
