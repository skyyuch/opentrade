# ADR-0057: Third-party financial-news aggregation — headline-only, chronological, via curated RSS

## Status

Accepted (owner ratified 2026-07-01 via plan approval). Data-source choice
(RSS) is the MVP path; a symbol-aware news API is deferred to the future
quotes vertical (see D2 / Implementation Notes).

## Date

2026-07-01

## Context

The shareholder feature-priority plan ([docs/05-feature-backlog.md](../05-feature-backlog.md))
lists 新聞 (news) as a small item explicitly gated on "先做 1 份合規評估 (ADR)".
Both the backlog and [ADR-0055](./0055-telegram-driven-spec-then-ratify.md) /
the 2026-06-22 conductor conversation state that news must pass a compliance ADR
before any code is written.

The owner wants two things (2026-07-01 planning):

1. A **standalone `/news` page** in the main menu — a neutral financial-news
   feed for retail users doing pre-investment due diligence.
2. Groundwork so that a **future quotes page** can show **per-instrument related
   news** (the quotes vertical does not exist yet — backlog item 3, and only an
   internal `PriceRecord` table + `price-recorder` task exist today, no public
   quotes API).

News is a clean slate: no model, no domain, no route exists
(the `feed` domain is an in-app activity timeline, not news).

### Public-fairness / compliance red-line check (rule 00, AGENTS.md)

News aggregation touches three sensitive edges, all of which shape the design:

- **投資建議風險 (SFC Type 4)**: any editorial ranking, "top picks", or
  relevance scoring on financial news could be read as steering users toward a
  security. OpenTrade must **not** offer investment advice. → strictly
  chronological ordering, no curation of which headline ranks higher.
- **版權**: reproducing full article bodies is copyright infringement. →
  aggregate **headline + source + timestamp + outbound link only**; never store
  or render article bodies.
- **付費置入紅線**: rule 00 forbids "商戶付費影響顯示順序". News ordering must
  never be purchasable. → chronological only, no sponsored slots.

## Decision

### D1: Headline-only, outbound, chronological (the compliance contract)

An aggregated news item stores and displays **only**:

- `title` (the publisher's headline)
- `sourceName` (attribution, e.g. "信報" / "Reuters")
- `sourceUrl` (canonical link to the original article — opens in a new tab)
- `publishedAt` (publisher timestamp)

Hard rules, enforced in code and asserted by tests:

- **No full text.** Article bodies are never fetched, stored, or rendered. RSS
  `<description>`/`<content>` snippets are **not** persisted in the MVP (a
  conservative copyright stance; revisitable later per-source if a publisher's
  feed terms clearly permit excerpting).
- **Chronological only** (`publishedAt` DESC). No editorial ranking, no
  "featured", no relevance scoring, no personalisation.
- **No paid placement** — ordering is never influenceable.
- **Disclaimer on every view**: "本頁新聞為第三方來源之標題聚合，僅供資訊參考，
  不構成任何投資建議；OpenTrade 不對外部內容負責。" rendered with the existing
  page-footer disclaimer idiom.

### D2: Curated RSS aggregation for the MVP (data source)

The MVP sources news from a **curated list of trusted financial-media RSS
feeds** maintained in `packages/config` (not hard-coded, per rule 00 / rule 50).
Rationale over the alternatives (below): free, strong Hong-Kong-Chinese
coverage, an auditable/transparent source list, naturally chronological and
neutral, and no per-symbol paywall. A **symbol-aware third-party news API is
explicitly deferred** to when the quotes vertical is built and per-instrument
related news is actually needed (Alternative B).

Future symbol tagging is left as a cheap forward-compatible seam (D4) but is
**not implemented** in this unit — the standalone feed has no instrument
context to tag against yet, and building tagging now would be designing for a
page that does not exist.

### D3: Store-and-serve via a DB cache + scheduled fetch (not live proxy)

A scheduled background task periodically fetches the configured feeds, parses
each entry down to the four D1 fields, and **upserts** into a `NewsItem` cache
table (dedup by `sourceUrl`). The public API reads from this table. We do
**not** proxy the feeds live on each request, because:

- Live proxying couples page latency + availability to third-party feeds and
  risks provider rate-limiting under traffic.
- A cache table gives stable cursor pagination and a single place to later
  attach symbol tags / source-level moderation.

This mirrors the existing internal `apps/api/src/tasks/price-recorder` task
(scheduled provider poll → DB upsert), which is the established pattern for
"periodically pull external data into a table".

### D4: Minimal forward-compatible schema (a `symbols` seam, unused in MVP)

`NewsItem` carries a `symbols String[]` column, **left empty in the MVP**. When
the quotes vertical arrives, a tagging pass (keyword / `Instrument.symbol`
match, or a switch to Alternative B) can populate it, and the already-present
optional `?symbol=` filter on the list use case starts returning per-instrument
news — with no schema migration. This is a single cheap column, not a built-out
tagging subsystem (avoids over-designing for a non-existent page).

### D5: Global reference data, no tenant scope

Aggregated public news is **not tenant-scoped** business data — it is global
reference material, like the `Instrument` catalog (ADR-0038, a documented rule
31 exception). `NewsItem` therefore has **no `tenantId`**.

### D6: Public, unauthenticated read endpoint

`GET /v1/news` is public (no auth), mirroring `moderationPublicRouter`
(ADR-0043) and the public brokers/kols reads. News is public information.

## Alternatives Considered

- **A (chosen): Curated RSS aggregation.**
  - Pros: free; strong HK-Chinese coverage; source list is transparent and
    auditable; naturally chronological/neutral (fits D1); no per-symbol paywall;
    no third-party secret to manage.
  - Cons: we maintain the feed list; RSS parsing must be robust to malformed
    feeds; no built-in symbol tagging (future tagging needs keyword/code match).
- **B: Third-party financial-news API (Marketaux / Finnhub / GNews).**
  - Pros: structured; built-in per-symbol tagging (helps future related-news);
    built-in dedup.
  - Cons: HK-stock Chinese-language coverage is often weak; several are paid
    beyond small free tiers; adds a managed secret + ToS constraints; ordering
    still must be forced chronological to satisfy D1.
  - Rejected for the MVP; **revisit when building the quotes vertical's
    related-news** (D2).
- **C: Hybrid (RSS now, add a symbol-aware API later).**
  - Effectively "A now, evaluate B later" — folded into D2 rather than adopted
    as a distinct decision.
- **Live proxy (no DB cache).**
  - Pros: nothing stored; always fresh.
  - Cons: page latency/availability coupled to feeds; rate-limit exposure; hard
    to paginate or later attach tags/moderation. Rejected per D3.

## Consequences

### Positive

- Ships a neutral, compliant news feed with a small, well-bounded surface
  (one cache table + one domain + one scheduled task + one page).
- Zero recurring cost and good HK-Chinese coverage from day one.
- The `symbols` seam + optional `?symbol=` filter make the future quotes
  related-news feature a data-population task, not a re-architecture.
- Reuses two established patterns (instruments-style domain, price-recorder-style
  scheduled task).

### Negative / Trade-offs

- We own the curated feed list and RSS-parsing robustness (mitigated: per-feed
  failure is isolated; a bad feed cannot break the others).
- No symbol tagging yet, so related-news is genuinely deferred, not merely
  hidden.
- Dropping RSS description snippets is a conservative copyright choice that makes
  the feed headline-only (less rich); intentional, revisitable per-source later.

### Neutral

- No on-chain surface (news is off-chain public reference data).
- No new tenant dimension (D5).

## Implementation Notes

Decomposed into independent, individually commit-able units (rule 96), each
< 200 lines diff where practical (config/migration excepted):

1. **`packages/config`** — curated RSS feed list (name / url / lang / enabled),
   not hard-coded.
2. **`packages/db`** — `NewsItem` model (`title` / `sourceName` /
   `sourceUrl` unique / `publishedAt` / `lang` / `symbols String[]` (empty) /
   `fetchedAt` / `isActive`) + `@@index([publishedAt])`; additive migration.
3. **`apps/api` news domain** — instruments-style four layers + public
   `GET /v1/news?limit&cursor` (chronological, cursor by `publishedAt`); optional
   `?symbol=` seam wired in the use case but not surfaced in the MVP UI; mounted
   at `/v1/news`; `ListNewsUseCase` unit tests.
4. **`apps/api` news-fetcher task** — price-recorder-style scheduled task:
   `IFeedProvider` + `RssFeedProvider` (lightweight RSS parse dependency) →
   read config feeds → parse to the four D1 fields → upsert by `sourceUrl`;
   per-feed failure isolated.
5. **`apps/web`** — `/news` page + `NewsList` client + `fetchNews` client + nav
   (`Header` + `Footer`) entry + trilingual `news` namespace + parity test +
   footer disclaimer.
6. **Docs** — update backlog + `03-status.md`; register this ADR in
   `decisions/README.md`; rule 99 self-review (whether a new rule for
   news-source discipline is warranted).

## References

- Plan: roadmap item 4 「新聞」 ([docs/05-feature-backlog.md](../05-feature-backlog.md))
- [ADR-0055](./0055-telegram-driven-spec-then-ratify.md) — spec/ADR before grind
- [ADR-0043](./0043-public-redacted-moderation-audit-view.md) — public unauthenticated read precedent
- [ADR-0038](./0038-instrument-catalog-and-asset-scope.md) — `Instrument` catalog + global-reference (no-tenant) precedent + `symbol` anchor for future tagging
- Pattern precedent: `apps/api/src/tasks/price-recorder/` (scheduled external pull → DB upsert)
- Cursor rule 00 (business/compliance red lines), rule 10 (domain decision tree), rule 31 (DB / no-tenant reference exception), rule 50 (no hard-coded config/secrets), rule 96 (task decomposition), rule 97 (ADR discipline)
