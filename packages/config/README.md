# `@opentrade/config`

> Single source of truth for environment-driven configuration.

## Purpose

This package centralises configuration that is consumed by every other package:

- **Supported chains** (Base Mainnet, Base Sepolia, future OP Stack chains) — per [ADR-0001](../../docs/decisions/0001-base-l2.md)
- **Contract addresses** per chain — read from env, never hard-coded
- **Supported locales** (zh-Hant, zh-Hans, en) — per [ADR-0003](../../docs/decisions/0003-i18n-trio.md)
- **Feature flag keys** — for `apps/api`'s feature flag system
- **Tenant defaults** — per multi-tenant ready architecture

## Why a separate package

If chain configuration were scattered across `apps/web`, `apps/api`, and `packages/contracts`, switching chains or adding a new chain would require coordinated changes everywhere. Centralising here means:

- Adding a new chain = update one place
- Apps and contracts read the same source of truth
- Type-safe across the whole monorepo

## Status

Phase 0 stub. Real chain / contract / locale configurations land in Commits #3-#5.

See [`docs/01-architecture.md`](../../docs/01-architecture.md) for the full architecture.
