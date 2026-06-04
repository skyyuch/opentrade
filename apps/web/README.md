# `@opentrade/web`

> Public-facing app for retail investors.

## Audience

Hong Kong retail investors looking up:

- Securities broker reviews (with on-chain authenticity)
- KOL trading signal track records
- Technical indicator vendor histories

## Tech (planned)

- Next.js 16 App Router + React 19 + TypeScript
- next-intl (zh-Hant default / zh-Hans / en)
- Tailwind + `@opentrade/ui` design system
- wagmi v2 + viem + Privy (Account Abstraction)
- TanStack Query (client-side data)
- Mobile-first responsive layout

## Auth

Privy social login. Visitors can browse without signing in; submitting a review requires login + a verified SBT (per ADR-0005).

## Domain

- prod: `opentrade.io`
- staging: `staging.opentrade.io`
- dev: `dev.opentrade.io`

## Status

Phase 0 stub. Next.js initialisation lands in Phase 0 commit #3.

See [`docs/01-architecture.md`](../../docs/01-architecture.md) §4.1 and [ADR-0010](../../docs/decisions/0010-split-web-and-console.md).
