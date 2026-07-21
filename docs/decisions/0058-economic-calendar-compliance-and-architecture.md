# ADR-0058: Economic-calendar aggregation — official-source, facts-only, chronological

## Status

Proposed (drafted 2026-07-21 via plan approval; awaiting owner ratification per
[ADR-0055](./0055-telegram-driven-spec-then-ratify.md) before any product code is
written). Data-source choice (official statistical authorities) is the MVP path;
a third-party aggregated economic-calendar API is deferred (see D2 / Alternatives).

## Date

2026-07-21

## Context

The shareholder feature-priority plan
([docs/05-feature-backlog.md](../05-feature-backlog.md)) and the roadmap frame
OpenTrade as a neutral, tamper-evident information surface for Hong-Kong retail
users doing pre-investment due diligence. The news vertical shipped first as an
MVP ([ADR-0057](./0057-news-aggregation-compliance-and-architecture.md)):
headline-only, chronological, outbound, with a per-page disclaimer.

The owner now wants (2026-07-21 planning):

1. A **standalone `/calendar` page** — an "economic calendar" of macroeconomic
   data releases (CPI, GDP, non-farm payrolls / unemployment, retail sales,
   interest-rate decisions, etc.) so users can see when market-moving official
   statistics are scheduled and what the numbers were.
2. **Enhancement of the existing news vertical** — expand the curated feed list
   (Hong-Kong / Chinese media) with per-source terms-of-service confirmation,
   and lightly connect the calendar to news.

The economic calendar is a clean slate: no model, no domain, no route exists.
It is architecturally the same shape as news (external reference data pulled on
a schedule into a cache table, served read-only over a public endpoint), so this
ADR deliberately reuses the ADR-0057 pattern rather than inventing a new one.

### Public-fairness / compliance red-line check (rule 00, AGENTS.md)

An economic calendar touches the same sensitive edges as news, plus one more:

- **投資建議風險 (SFC Type 4)**: any "importance / impact" star rating,
  "top events to watch", forecast/consensus numbers, or interpretive commentary
  on a release could be read as steering users. OpenTrade must **not** offer
  investment advice. → facts only (name / time / region / period / previous /
  actual), strictly chronological, **no impact rating**, **no forecast or
  consensus values**, no editorial "what to watch" curation.
- **資料正確性 / 權威性**: an economic figure presented wrongly is materially
  worse than a mis-linked headline. → source **only** from primary statistical
  authorities, and every event links back to its official release page.
- **版權 / 全文轉載**: reproducing an agency's full release text is unnecessary
  and risks copyright. → store and display only the structured fact fields; link
  out for detail.
- **付費置入紅線**: rule 00 forbids "商戶付費影響顯示順序". Calendar ordering
  must never be purchasable. → chronological only, no sponsored slots.

## Decision

### D1: Official-source, facts-only, chronological (the compliance contract)

An aggregated economic-calendar event stores and displays **only**:

- `indicatorCode` (stable machine code, e.g. `US_CPI_YOY`) + trilingual display
  names (`nameZhHant` / `nameZhHans` / `nameEn`), mirroring the `Instrument`
  trilingual-name pattern (ADR-0038 / ADR-0026)
- `region` (enum: `US` / `HK` / `CN` for the MVP)
- `category` (enum: `INFLATION` / `GROWTH` / `EMPLOYMENT` / `RATE_DECISION` /
  `TRADE` / `OTHER`) — used purely for filtering, **not** ranking
- `scheduledAt` (release timestamp, stored UTC, displayed in Asia/Hong_Kong)
- `periodLabel` (the covered period, e.g. "2026-06" / "2026 Q2")
- `previousValue` + `actualValue` (nullable until released) + `unit`
  (e.g. `%` / `%_YOY` / `k`) — plain strings/decimals, no forecast/consensus
- `sourceName` + `sourceUrl` (canonical link to the official release)

Hard rules, enforced in code and asserted by tests:

- **No impact/importance rating.** Filtering is by `region` / `category` only;
  we never rank one event above another.
- **No forecast or consensus values.** Only the agency's own `previous` and
  post-release `actual`. (This is a stricter stance than most commercial
  calendars and is deliberate: consensus estimates edge toward "what the market
  expects", i.e. advice-adjacent.)
- **No interpretation / commentary.** No "beat/miss", no colour-coding of
  surprise, no "what this means".
- **Chronological only** (`scheduledAt`). No "featured", no personalisation.
- **No paid placement** — ordering is never influenceable.
- **Disclaimer on every view**: the calendar aggregates third-party official
  data for information only, does not constitute investment advice, and
  OpenTrade is not responsible for external content — rendered with the existing
  page-footer disclaimer idiom (same as `/news`).

### D2: Official statistical authorities as the data source (MVP)

The MVP sources events from a **curated registry of primary statistical
authorities**, maintained in `packages/config` (not hard-coded, per rule 00 /
rule 50), mirroring [packages/config/src/news.ts](../../packages/config/src/news.ts):

- **US (first batch)**: BLS / BEA / Federal Reserve **release schedules** for the
  event calendar, and **FRED** (Federal Reserve Bank of St. Louis) for the
  released `actual` / `previous` observation values. FRED requires a free API key
  → stored in AWS Secrets Manager, never hard-coded (rule 50).
- **HK (second batch)**: Census & Statistics Department (政府統計處) release
  calendar.
- **CN (later batch)**: National Bureau of Statistics (國家統計局) release
  schedule — lower priority (scraping difficulty), explicitly deferred.

Rationale over the alternatives (below): authoritative and correct, every value
traces to a government release, free, and naturally neutral/chronological. A
third-party aggregated economic-calendar API (Forex Factory feed, Marketaux,
etc.) is **explicitly deferred** — those bundle impact ratings + consensus
values we would have to strip to satisfy D1 anyway, and carry third-party ToS
risk.

### D3: Store-and-serve via a DB cache + scheduled fetch (not live proxy)

A scheduled background task (`calendar-fetcher`) periodically fetches the
configured sources, parses each entry to the D1 fields, and **upserts** into an
`EconomicEvent` cache table (dedup by a stable key, see D6). The public API reads
from this table. This mirrors the existing
[apps/api/src/tasks/news-fetcher](../../apps/api/src/tasks/news-fetcher/fetcher.ts)
and `price-recorder` tasks (scheduled external pull → DB upsert), and gives:

- decoupled page latency/availability from third-party sources;
- stable cursor pagination;
- a single place to later attach source-level moderation / corrections.

**Two-phase population.** Unlike news (a headline exists exactly once), a
calendar event is known **ahead** of time (schedule) and its `actualValue`
becomes known **at release**. The fetcher therefore upserts the scheduled event
first (`actualValue = null`) and backfills `actualValue` on a later poll once the
authority publishes the figure — the upsert key (D6) makes this idempotent.

### D4: Global reference data, no tenant scope

Aggregated public economic data is **not tenant-scoped** business data — it is
global reference material, like the `Instrument` catalog (ADR-0038) and
`NewsItem` (ADR-0057 D5, a documented rule-31 exception). `EconomicEvent`
therefore has **no `tenantId`**.

### D5: Public, unauthenticated read endpoint

`GET /v1/calendar?from&to&region&category` is public (no auth), mirroring
`GET /v1/news` (ADR-0057 D6) and the public brokers/kols reads. Ordering is
chronological by `scheduledAt`. `region` / `category` are optional filters;
`from` / `to` bound the window. Economic-release data is public information.

### D6: Idempotent upsert key + trilingual names

The upsert dedup key is `(indicatorCode, periodLabel)` — one CPI release for
"2026-06" is a single row whether we see it as a future schedule entry or after
the actual prints. Display names are stored trilingually on the row (the set of
indicators is small and curated, so names live with the event rather than in a
separate lookup, matching the `Instrument` precedent).

### D7: Time handling — store UTC, display Asia/Hong_Kong, no new dependency

`scheduledAt` is stored as UTC. Rendering uses the existing next-intl
`useFormatter()` + native `Intl.DateTimeFormat` with `timeZone: 'Asia/Hong_Kong'`
(the monorepo has no `date-fns` / `dayjs` / `luxon` dependency and this ADR does
**not** introduce one). This matches how `/news` renders timestamps.

### D8: News enhancement scope

- **Expand the curated RSS feed list** in
  [packages/config/src/news.ts](../../packages/config/src/news.ts) with
  additional Hong-Kong / Chinese financial-media feeds, **each gated on a
  per-source ToS confirmation** that headline aggregation + outbound linking is
  permitted; the confirmation is recorded in a comment next to the source and
  summarised here / in status. This also clears the existing ADR-0057 follow-up
  to confirm the three initial sources' ToS.
- **Light calendar↔news linking** (MVP): a calendar event view may link out to
  `/news` for context. We do **not** build per-event or per-symbol news tagging
  in this MVP — that seam already exists as `NewsItem.symbols` (ADR-0057 D4) and
  is populated only when the quotes vertical arrives.

## Alternatives Considered

- **A (chosen): official statistical authorities (schedules + FRED for actuals).**
  - Pros: authoritative/correct; every value traces to a government release;
    free; naturally neutral and chronological; no impact-rating or consensus to
    strip; no commercial ToS beyond the agencies' open-data terms.
  - Cons: we maintain the source registry; each authority has a different
    schedule/format so providers are per-source; coverage grows batch by batch
    (US first, then HK, then CN); FRED needs a managed API key.
- **B: third-party aggregated economic-calendar API / feed (Forex Factory free
  JSON feed, Marketaux, Finnhub, EconPulse, Apify actors).**
  - Pros: one integration for broad global coverage; structured; includes
    forecast/consensus + impact ratings + dedup out of the box.
  - Cons: the bundled impact ratings + consensus values are exactly what D1
    forbids, so we would strip them anyway; third-party ToS / rate-limit /
    paywall risk; correctness depends on a scraper, not the primary source.
  - Rejected for the MVP; revisitable if official-source coverage proves too
    narrow.
- **C: hybrid (official now, add a third-party API later).**
  - Effectively "A now, evaluate B later" — folded into D2 rather than adopted
    as a distinct decision.
- **Live proxy (no DB cache).**
  - Pros: nothing stored; always fresh.
  - Cons: page latency/availability coupled to sources; cannot do the two-phase
    schedule→actual backfill cleanly; hard to paginate. Rejected per D3.
- **Include an impact/importance rating (like commercial calendars).**
  - Rejected: an editorial ranking of which release matters more is
    advice-adjacent and violates rule 00. Region/category filtering replaces it.

## Consequences

### Positive

- Ships a neutral, compliant economic calendar with a small, well-bounded
  surface (one cache table + one domain + one scheduled task + one page),
  reusing the proven ADR-0057 news shape.
- Every figure traces to a primary government source — strong correctness and a
  good grant/investor story ("we only show official facts, no advice").
- Zero recurring cost for the MVP (FRED + public schedules are free).
- Batch-by-batch coverage (US → HK → CN) keeps each unit small.

### Negative / Trade-offs

- We own the source registry and one parser per authority (mitigated: per-source
  failure is isolated, matching news-fetcher).
- No forecast/consensus and no impact rating makes the calendar less rich than
  commercial ones — intentional, to stay clearly on the information (not advice)
  side of the SFC line.
- CN coverage is genuinely deferred, not merely hidden.
- The two-phase schedule→actual backfill (D3) is slightly more complex than
  news' one-shot upsert.

### Neutral

- No on-chain surface (calendar is off-chain public reference data).
- No new tenant dimension (D4).
- No new date/time dependency (D7).

## Implementation Notes

Decomposed into independent, individually commit-able units (rule 96), each in
its own session with a rule-98 handoff (this ADR is unit 1):

1. **ADR (this unit)** — draft ADR-0058 (Proposed), register in
   `decisions/README.md`, update `03-status.md` + `05-feature-backlog.md`;
   owner ratifies (flip to Accepted) before unit 2.
2. **`packages/config` + `packages/db`** — `packages/config/src/calendar.ts`
   source registry (authority / indicator / url / region / category / lang /
   enabled), not hard-coded; `EconomicEvent` model (fields per D1, unique
   `(indicatorCode, periodLabel)` per D6, `@@index([scheduledAt])`,
   `@@index([region, category])`); additive migration.
3. **`apps/api` calendar domain** — news-style four layers + public
   `GET /v1/calendar?from&to&region&category` (chronological); `ListEventsUseCase`
   unit tests; mounted at `/v1/calendar`.
4. **`apps/api` calendar-fetcher task** — news-fetcher-style scheduled task:
   `ICalendarProvider` port + one provider per authority (US first: schedule +
   FRED actuals; HK next) → parse to D1 fields → two-phase upsert by
   `(indicatorCode, periodLabel)`; per-source failure isolated; FRED key from
   Secrets Manager. Wire into `main.ts`.
5. **News enhancement** — expand `news.ts` feed list with per-source ToS
   confirmation notes; clear the ADR-0057 three-source ToS follow-up.
6. **`apps/web` (last, per owner)** — `/calendar` page + client (week/month list,
   region/category filters, upcoming vs released) + `fetchCalendar` client +
   nav (`Header` + `Footer`) entry + trilingual `calendar` namespace + parity
   test + footer disclaimer + calendar↔news outbound link + component/e2e tests.

## References

- Plan: roadmap "financial calendar + news enhancement" ([docs/05-feature-backlog.md](../05-feature-backlog.md))
- [ADR-0057](./0057-news-aggregation-compliance-and-architecture.md) — the news vertical this mirrors (headline-only, chronological, DB-cache, public read, no-tenant, `symbols` seam)
- [ADR-0055](./0055-telegram-driven-spec-then-ratify.md) — spec/ADR (Proposed) before grind; ratify gate
- [ADR-0043](./0043-public-redacted-moderation-audit-view.md) — public unauthenticated read precedent
- [ADR-0038](./0038-instrument-catalog-and-asset-scope.md) — `Instrument` catalog: global-reference (no-tenant) + trilingual-name precedent
- [ADR-0026](./0026-zh-hans-broker-name.md) — trilingual display-name column pattern
- Pattern precedent: [apps/api/src/tasks/news-fetcher/](../../apps/api/src/tasks/news-fetcher/fetcher.ts) and `apps/api/src/tasks/price-recorder/` (scheduled external pull → DB upsert)
- Cursor rule 00 (business/compliance red lines), rule 10 (domain decision tree), rule 31 (DB / no-tenant reference exception), rule 50 (no hard-coded config/secrets; FRED key in Secrets Manager), rule 96 (task decomposition), rule 97 (ADR discipline), rule 98 (session handoff)
