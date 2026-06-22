# ADR-0053: Add a filterable KOL category as two independent `Kol` dimensions (type + focus)

## Status

Accepted

## Date

2026-06-22

## Context

OpenTrade Phase 2 ships **financial KOLs (財演)** as the `Kol` entity, whose
trust signal is on-chain signal history (per [ADR-0036](./0036-kol-signal-architecture.md)).
KOLs are currently undifferentiated: a user browsing the KOL directory cannot
narrow the list down by what kind of KOL a person is, nor by which market they
talk about.

The project owner wants to **give KOLs a filterable category, mirroring the
broker/bullion category approach** (`BrokerCategory` discriminator, per
[ADR-0045](./0045-bullion-dealer-vertical-cgse.md) / [ADR-0050](./0050-rebrand-cgse-to-hkgx.md)).
This is roadmap item 1 ("KOL 類別 — 小型") in the shareholder feature-priority
plan: a low-risk warm-up that mirrors the just-shipped 金商分類 plumbing.

Two candidate taxonomies surfaced during planning:

1. **KOL type** — 財演 (a pundit who publicly calls buy/sell) vs 技術指標賣家
   (a vendor who sells self-built trading-signal indicators). Both terms are
   already registered in `docs/04-glossary.md`.
2. **Asset focus** — 股票 / 加密 / 外匯 (equities / crypto / forex): the broad
   market a KOL primarily talks about.

The owner decided (2026-06-22) to model **both** dimensions as **two
independent, nullable** fields, with **no default** (assigned per-row by a later
onboarding/admin flow). This ADR records that decision before any schema change,
per rule 00 ("任何架構級決策必須先寫 ADR、讓使用者拍板") and rule 97.

### Public-fairness / compliance red-line check

- The category is **pure classification metadata** for discovery/filtering. It
  carries **no ranking, no scoring, and no paid-influence surface** — adding it
  cannot make OpenTrade "a second WikiFX" (rule 00).
- It produces **no investment advice**: a label like "財演 / 股票" describes the
  person, it does not recommend an action. Existing disclaimers are unaffected.
- Nothing here is deletable user content; the fields are admin/onboarding-set
  profile attributes, not on-chain reviews.

## Decision

### D1: Two independent nullable dimensions on `Kol`

```prisma
enum KolType {
  FINANCIAL_KOL    // 財演 — publicly calls buy/sell (per glossary)
  INDICATOR_VENDOR // 技術指標賣家 — sells self-built trading-signal indicators
}

enum KolFocus {
  EQUITY // 股票
  CRYPTO // 加密
  FOREX  // 外匯
}

model Kol {
  // ... existing fields ...
  type  KolType?
  focus KolFocus?
}
```

Field names `type` / `focus` are single-word and consistent with the existing
`Notification.type` field; the enums are `KolType` / `KolFocus`.

### D2: Two orthogonal dimensions, not one combined enum

KOL _type_ and asset _focus_ are **orthogonal**: a 財演 may focus on equities,
crypto, or forex, and so may a 技術指標賣家. Encoding the pair as a single
enum (e.g. `FINANCIAL_KOL_EQUITY`, `INDICATOR_VENDOR_CRYPTO`, …) would create a
2×3 combinatorial enum that explodes on every future value added to either axis
and cannot express "type known, focus unknown". Two columns keep each axis
independently filterable and independently extensible (new enum values are
non-breaking Postgres `ADD VALUE`s).

### D3: Nullable, no default (deliberately unlike `Broker.category`)

`Broker.category` used `@default(SECURITIES)` because every pre-existing broker
row genuinely _was_ a securities broker — the default was correct backfill.
A `Kol` row has **no inherent type/focus**: pre-seeded UNCLAIMED profiles and
existing rows were created before this taxonomy existed, so any default would be
a _guess_, not a fact. We therefore make both columns **nullable with no
default** (owner's Q2 = B):

- Zero risk of mislabelling existing rows.
- `NULL` is a first-class "uncategorised / not yet assigned" state the UI can
  filter on ("未分類").
- A later onboarding step + admin tool assigns values per row (Implementation
  Notes); a backfill script is **not** required and is intentionally not part of
  this unit.

### D4: A coarse `KolFocus`, distinct from the fine-grained `AssetClass`

The existing `AssetClass` enum (EQUITY_HK / EQUITY_US / FUTURES / SPOT / FOREX /
CRYPTO / INDEX / COMMODITY, per [ADR-0038](./0038-instrument-catalog-and-asset-scope.md))
classifies an **individual signal** for settlement-pipeline routing and the
instrument catalog. `KolFocus` is a **profile-level, self-declared descriptor**
for human discovery/filtering and is intentionally **coarse** (3 values). We do
**not** reuse `AssetClass` because:

- Forcing a KOL profile into the 8-value settlement taxonomy would conflate
  "what this person broadly talks about" with "how a single signal settles".
- A KOL who posts both HK and US equity calls is simply `focus = EQUITY`; the
  per-signal `AssetClass` stays as granular as settlement needs.

`KolFocus` can gain values later (e.g. `COMMODITY`) as a non-breaking change if
product demand appears.

### D5: Indexing

```prisma
@@index([tenantId, type])
@@index([tenantId, focus])
```

The two axes are filtered **independently** (a user may filter by type only, by
focus only, or both), so two `(tenantId, <dim>)` composite indexes serve the
documented filter use case; a single `(tenantId, type, focus)` index would not
cover focus-only queries. Both columns are initially all-`NULL`, so the indexes
start near-empty and grow as rows are categorised. This mirrors the single
`[tenantId, category]` index ADR-0045 added for brokers, doubled for the two
dimensions.

### D6: i18n / glossary

「財演」(Financial KOL) and「技術指標賣家」(Technical Indicator Vendor) are
already in `docs/04-glossary.md`. Trilingual nav/filter/label strings
(財演/技術指標賣家 and 股票/加密/外匯) are added when the UI is wired, not in
this DB unit.

### D7: Same-entity-plus-dimension; no new domain, no new tenant

Like ADR-0045, this is a business variation **inside the existing `kols`
domain** (rule 10 decision tree): no new lifecycle, no new bounded context. The
fields are tenant-scoped attributes on the existing tenant-scoped `Kol` model
(rule 31); no new tenant dimension, no global reference table.

## Alternatives Considered

- **A1: Single combined enum `KolCategory` (type × focus).**
  - Pros: one column, one index.
  - Cons: 2×3 combinatorial explosion; cannot express partial knowledge
    ("type known, focus unknown"); every new axis value multiplies the enum.
  - Rejected per D2.
- **A2: One dimension only (just type, or just focus).**
  - Pros: smallest change.
  - Cons: the owner explicitly wants both axes; type and focus answer different
    user questions ("what kind of KOL" vs "which market").
  - Rejected: under-delivers the requirement (owner Q1 = C).
- **A3: Reuse the existing `AssetClass` enum for focus.**
  - Pros: no new enum.
  - Cons: conflates profile-level discovery with per-signal settlement routing;
    forces a coarse profile attribute into an 8-value settlement taxonomy.
  - Rejected per D4.
- **A4: Non-null with a default (mirror `Broker.category` exactly).**
  - Pros: no nullable handling in the UI.
  - Cons: any default is a _guess_ for KOLs (no inherent category), risking
    silent mislabelling; loses the "uncategorised" state.
  - Rejected per D3 (owner Q2 = B).

## Consequences

### Positive

- KOLs become filterable by type and by focus with a small, additive, fully
  non-breaking schema change (two nullable columns + two enums + two indexes).
- `NULL` gives a clean "uncategorised" state and zero-risk rollout (no backfill).
- Establishes a repeatable per-axis pattern; new type/focus values are
  non-breaking `ADD VALUE`s.
- Mirrors the broker/bullion category plumbing, so the API filter + UI wiring
  follow a known shape.

### Negative / Trade-offs

- Two nullable columns mean the API/UI must handle the "uncategorised" case and
  an onboarding/admin assignment flow is needed before the filter is useful
  (tracked in Implementation Notes; not in this unit).
- Two indexes on initially-empty columns are a tiny, deliberate up-front cost
  for future filter performance.
- A coarse `KolFocus` separate from `AssetClass` is a second asset vocabulary;
  mitigated by the clear "profile descriptor vs settlement routing" split (D4).

### Neutral

- On-chain contract layer untouched (categories are off-chain discovery
  metadata; KOL signals already anchor by `contentHash`).
- No new tenant dimension; `hk` tenant + per-row attributes only.

## Implementation Notes

Decomposed into independent units (rule 96), each a hand-off point (rule 98),
each < 200 lines diff and independently typecheck/commit-able:

1. **DB (this unit)** — `KolType` + `KolFocus` enums + `Kol.type` + `Kol.focus`
   (nullable, no default) + two indexes + Prisma migration. Schema + migration
   committed together per rule 31 §Migration 規範.
2. **API** — kols domain `type` / `focus` filter query params + detail/list
   responses carry the two fields; zod input validation; signal pipeline
   untouched.
3. **Onboarding / admin assignment** — KOL onboarding captures `type`/`focus`;
   console admin KOL management can set/override them (per-row, per D3).
4. **Web wiring** — KOL directory filter UI (type + focus + "未分類") + label
   chips on profile; trilingual strings (consumes UI design).
5. **Console wiring** — admin KOL management `type`/`focus` dimension.
6. **Tests** — unit + component + e2e + trilingual i18n.

UI for steps 4–5 is designed externally; this repo wires functionality. No code
beyond the DB layer is written in this unit.

## References

- Plan: roadmap item 1 「KOL 類別 — 小型」 (shareholder feature-priority plan)
- Related ADR: [ADR-0045](./0045-bullion-dealer-vertical-cgse.md) — broker/bullion
  category discriminator precedent (the approach this mirrors)
- Related ADR: [ADR-0036](./0036-kol-signal-architecture.md) — `Kol` entity + signals
- Related ADR: [ADR-0038](./0038-instrument-catalog-and-asset-scope.md) — `AssetClass`
  scope (why `KolFocus` stays separate)
- Glossary: `docs/04-glossary.md` —「財演」/「技術指標賣家」
- Cursor rule 10 (domain decision tree), rule 31 (DB / migration / no hard delete),
  rule 96 (task decomposition), rule 97 (status + ADR discipline)
