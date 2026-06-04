# `@opentrade/console`

> B2B back office for brokers, KOLs, and platform admins.

## Audience

- **Brokers** — claim profile, respond to disputes, view review analytics
- **KOLs / Financial Pundits** — bind on-chain identity, publish signals, view performance dashboards
- **Admins** — operate the platform (no power to alter user content; per cursor rule 50)

## Tech

Same stack as `apps/web` — Next.js 16 + React 19 + next-intl 4 (zh-Hant / zh-Hans / en, `as-needed` prefix) + Tailwind extending `@opentrade/ui/tailwind-preset` + Inter via `next/font/google` (build-time self-hosted, GDPR-safe) + zod-validated client env. Differences vs `apps/web` (per ADR-0010 + ADR-0011):

- Desktop-first (data-dense dashboards, tables, charts)
- **Dark by default** via `next-themes` (`defaultTheme="dark"` in `ThemeProvider.tsx`)
- KYC-gated entry — Phase 0 shell is intentionally browseable; the auth gate composes onto the i18n middleware in Phase 1
- `robots.txt` disallows everything (no SEO; site-level metadata route at `src/app/robots.ts`)
- Production deployment additionally sends `X-Robots-Tag: noindex, nofollow` from the edge
- Dev port `3001` (apps/web is on `3000`)
- RBAC: broker / KOL / admin / super-admin (Phase 1)

## Domain

- prod: `console.opentrade.io`
- staging: `console.staging.opentrade.io`
- dev: `console.dev.opentrade.io`

## Local development

```bash
# from repo root
pnpm install
pnpm --filter @opentrade/console dev   # http://localhost:3001
```

The dev / build / start scripts read env from the repo-root `.env`
through `dotenv -e ../../.env --` so the same `NEXT_PUBLIC_API_URL`
serves both `apps/web` and `apps/console`.

## Status

Phase 0 shell complete (Commit number-seven):

- next-intl 4 i18n triad + middleware
- Locale layout with dark-default ThemeProvider
- Merchant dashboard placeholder (`/`, `/zh-Hans`, `/en`) — four-card grid (claim / reviews / signals / disputes)
- `robots.txt` disallow-all + zod-validated `NEXT_PUBLIC_API_URL`
- No `<ImmutableMark>` anywhere — per ADR-0011 §5.1 it only ever decorates real on-chain data, not Phase 0 mock copy

The KYC-gated experience, RBAC, and the real broker / KOL / admin
workflows arrive in Phase 1.

See [`docs/01-architecture.md`](../../docs/01-architecture.md) §4.1, [ADR-0010](../../docs/decisions/0010-split-web-and-console.md), and [ADR-0011](../../docs/decisions/0011-ui-design-language.md).
