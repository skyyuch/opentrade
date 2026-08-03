# ADR-0060: Display the publisher's own RSS-provided thumbnail on aggregated news

## Status

Accepted (owner ratified 2026-08-03 via chat approval). Amends
[ADR-0057](./0057-news-aggregation-compliance-and-architecture.md) D1 by adding
one optional field (`imageUrl`) to the compliance contract. All other ADR-0057
decisions (chronological-only ordering, no full text, no paid placement, DB
cache, no tenant scope, public read) are unchanged and remain in force.

## Date

2026-08-03

## Context

The `/news` page ships today as a text-only chronological headline list
(ADR-0057 D1). The owner wants a richer, card-style layout with thumbnails —
comparable to how WikiFX / BrokersView present their news list — so the feed
reads as a real financial-news surface rather than a bare link list.

ADR-0057 D1 deliberately stored/displayed **only** four fields (title / source
/ link / timestamp) and dropped all RSS `<description>`/`<content>` snippets as
"a conservative copyright stance; revisitable later per-source if a publisher's
feed terms clearly permit". Adding images therefore requires an explicit
amendment and a fresh compliance check rather than an incidental UI change —
the same red-line discipline (rule 00 / rule 97) that gated the original news
feature.

### Compliance re-check (rule 00, rule 50, AGENTS.md)

- **版權 (copyright).** RSS media enclosures (`media:thumbnail`,
  `media:content`, `<enclosure>`) are images the publisher **themselves placed
  in their own syndication feed** specifically for downstream display. Rendering
  that image **unmodified, with source attribution and a link back to the
  original article**, is the intended use of a media-enabled RSS feed. This is
  materially different from scraping an article page or its `og:image` — which
  we do **not** do. For the two enabled Yahoo feeds this is explicitly covered
  by Yahoo ToS §16 "RSS Feeds" (display of feed content without modification,
  with attribution + link, no advertising incorporated), the same clause that
  authorised the headline aggregation in ADR-0057 D2.
- **No re-hosting.** We store only the image **URL**, never the image bytes, and
  render it directly from the publisher's own CDN via a native `<img>` (not
  `next/image`, which would re-encode/proxy and could be read as "modification"
  and re-hosting). If a feed provides no media, no image is shown — we never
  synthesise or fetch one.
- **投資建議風險 (SFC Type 4) / 付費置入.** Ordering stays strictly
  chronological (`publishedAt` DESC). The thumbnail is presentational only and
  never affects ranking, so it introduces no editorial-curation or
  paid-placement surface.
- **No full text, still.** ADR-0057's "article bodies are never fetched, stored,
  or rendered" is untouched. A thumbnail is not article text.
- **PII / on-chain.** News is off-chain public reference data; image URLs carry
  no PII. Nothing here touches the chain.

## Decision

### D1 (amends ADR-0057 D1): add one optional field — `imageUrl`

An aggregated news item MAY additionally store and display:

- `imageUrl` — the URL of the **publisher's own** feed-provided thumbnail, taken
  only from the item's `media:thumbnail` / `media:content` (image MIME) /
  `<enclosure>` (image MIME). **Nullable**: absent when the feed provides none.

Hard rules (enforced in code):

- The image URL is extracted **only** from the RSS item's own media enclosure —
  never from scraping the article page, and never a synthesised/placeholder
  remote image.
- Only `https:` image URLs are accepted (no mixed-content, no `data:` URIs).
- Stored as a URL only; the bytes are never fetched or re-hosted by OpenTrade.
- Rendered unmodified via a native lazy `<img>` with `referrerPolicy` set and a
  client-side error fallback (broken/blocked images collapse to the text-only
  layout — they never break the row).
- Everything else in ADR-0057 D1 stands: chronological only, no full text, no
  paid placement, disclaimer on every view.

### D2: no schema churn beyond one nullable column

`NewsItem` gains `imageUrl String?` (nullable, additive migration). The
news-fetcher backfills it opportunistically on the next poll; existing rows keep
`null` until re-fetched. No dedup-key or index change.

## Alternatives Considered

- **A (chosen): render the publisher's own feed media enclosure only.**
  - Pros: uses images the publisher syndicated for exactly this purpose; stays
    within the ToS clause already relied on (Yahoo §16); no re-hosting; graceful
    text-only fallback when absent; one nullable column.
  - Cons: coverage is uneven (feeds without media show no image); hotlinked
    images depend on the publisher's CDN staying up (mitigated by error
    fallback).
- **B: scrape each article's `og:image`.**
  - Rejected: fetching the article page to extract an image is exactly the kind
    of content harvesting ADR-0057 avoided; higher copyright + latency + fragility
    cost.
- **C: re-host thumbnails on our own S3/CDN.**
  - Rejected: storing/serving the publisher's image bytes is a stronger
    copyright claim than hotlinking their syndicated URL, and adds storage +
    invalidation cost for a presentational nicety.
- **D: keep text-only (status quo).**
  - Rejected by owner: the page should read as a real news surface.

## Consequences

### Positive

- Card layout with thumbnails; the feed looks like a first-class news product.
- Minimal, well-bounded change: one nullable column + feed-parser extraction +
  UI; no ranking, tenant, or on-chain surface touched.
- Compliance envelope unchanged in spirit — we display only what the publisher
  syndicated, attributed and linked.

### Negative / Trade-offs

- Uneven image coverage across feeds (news.gov.hk feeds may carry no media →
  those rows stay text-only). Acceptable and by design.
- Hotlinked images can 404/hotlink-block; handled by a client error fallback so
  a broken image never degrades the row.

### Neutral

- No new dependency (image extraction uses `rss-parser` custom fields on the
  existing parser).
- Backfill is lazy: pre-existing rows show no image until the next fetch upserts
  them.

## Implementation Notes

Decomposed into independently commit-able units (rule 96):

1. **`packages/db`** — `NewsItem.imageUrl String?` + additive migration.
2. **`apps/api` news-fetcher** — `NewsHeadline.imageUrl`; `RssFeedProvider`
   extracts `media:thumbnail` / `media:content` / `enclosure` (https image only)
   via `rss-parser` custom fields; `NewsFetcher` upserts it (two-phase-safe:
   only overwrites when the new draft carries one, mirroring the calendar
   fetcher's value guard).
3. **`apps/api` news domain** — `NewsItemRecord.imageUrl`,
   `PrismaNewsRepository` maps it, `ListNewsUseCase` DTO exposes it; route
   unchanged.
4. **`apps/web`** — `NewsItem.imageUrl` client type; `NewsList` becomes a
   card/grid layout with a thumbnail (native lazy `<img>` + error fallback),
   preserving the outbound link, attribution, timestamp, and disclaimer.
5. **Docs** — register this ADR in `decisions/README.md`; update
   `docs/03-status.md`; rule 99 self-review.

## References

- [ADR-0057](./0057-news-aggregation-compliance-and-architecture.md) — the news
  aggregation compliance contract this ADR amends (D1) and otherwise upholds.
- [ADR-0058](./0058-economic-calendar-compliance-and-architecture.md) D8 — the
  per-source ToS gate discipline in `packages/config/src/news.ts`.
- `packages/config/src/news.ts` — Yahoo ToS §16 "RSS Feeds" note (the clause
  covering unmodified display of feed content with attribution + link).
- Cursor rule 00 (business/compliance red lines), rule 50 (no hard-coded
  config/secrets), rule 96 (task decomposition), rule 97 (ADR discipline).
