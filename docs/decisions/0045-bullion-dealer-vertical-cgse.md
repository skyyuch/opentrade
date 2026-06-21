# ADR-0045: Add a bullion-dealer vertical as a `Broker` category sourced from CGSE

## Status

Accepted (registry-identity decisions D3 / D5 / D6 amended by [ADR-0050](./0050-rebrand-cgse-to-hkgx.md) — CGSE 金銀業貿易場 rebranded to HKGX 香港黃金交易所)

## Date

2026-06-05

## Context

OpenTrade Phase 1 ships two kinds of reviewable subjects:

1. **Securities brokers** — seeded from the public SFC register (per [ADR-0020](./0020-scheduled-sfc-broker-sync.md)), modelled as the `Broker` entity.
2. **Financial KOLs (財演)** — modelled as a separate `Kol` entity whose trust signal is on-chain signal history, **not** reviews.

The project owner wants a **third local (Hong Kong) vertical: bullion / precious-metals dealers (金商)** — companies that trade physical gold and silver. The authoritative roster of licensed dealers is the **Chinese Gold & Silver Exchange Society (CGSE / 香港金銀業貿易場, https://www.cgse.com.hk/)**, a self-regulatory bullion exchange founded in 1910. CGSE plays the same "authoritative registry" role for bullion dealers that the SFC register plays for brokers and that iAM Smart (per [ADR-0031](./0031-iam-smart-identity-provider.md)) plays for individual identity.

Per `docs/00-vision.md` §10, **adding a target market must be accompanied by an ADR**. This ADR is that accompanying record.

### The decisive architectural fact

The platform's **only reviewable subject today is `Broker`**. Every trust-pipeline table binds to `brokerId`:

- `Review.brokerId` (per [ADR-0019](./0019-review-registry-contract-design.md))
- Complaints — same `reviews` table via the `kind` discriminator (per [ADR-0029](./0029-complaints-vs-reviews-separation.md))
- `BrokerClaimRequest.brokerId`
- `SbtVerificationRequest.brokerSlug` + `UserVerifiedBroker` (per [ADR-0025](./0025-multi-broker-verification-strategy.md))
- The on-chain `contentHash` / IPFS anchor pipeline embeds the broker identity

`Kol` does **not** receive reviews — it is a parallel entity. So whether a bullion dealer "can be reviewed" depends entirely on whether it **is** a `Broker`.

### Structural equivalence

A bullion dealer is structurally the same as a securities broker: a registered financial-service provider with (a) a name, (b) an authoritative-registry membership (SFC for brokers, CGSE for bullion dealers), and (c) the ability to receive reviews + complaints. The only material differences are the **registry source** and the **license vocabulary** — exactly the kind of variation a discriminator column handles, and exactly the precedent [ADR-0029](./0029-complaints-vs-reviews-separation.md) set when it chose "same table + `kind` discriminator" over a separate `Complaint` table.

### Public-fairness / compliance red-line check

- OpenTrade remains a **pure information platform** (no advice, no matchmaking) — bullion-dealer reviews are user opinions about service experience, the same posture as broker reviews. No new SFC / VATP licensing exposure for the platform itself.
- CGSE is a **self-regulatory bullion exchange, not a statutory securities regulator**. Physical bullion trading sits largely outside the SFC securities remit. (Note: some bullion dealers also offer leveraged "London Gold / 倫敦金" products that can touch SFC Type 3 — relevant background, but it does not change OpenTrade's positioning.)
- No content is deletable; CGSE's "觀察行員名單 / 已被勒令停業" (watch / suspended list) maps to the existing immutable `LicenseStatus` lifecycle, never a delete.

## Decision

### D1: Add a `BrokerCategory` discriminator on `Broker`

```prisma
enum BrokerCategory {
  SECURITIES   // SFC-licensed securities broker (existing behaviour)
  BULLION      // CGSE-member bullion / precious-metals dealer
}

model Broker {
  // ... existing fields ...
  category BrokerCategory @default(SECURITIES)
}
```

`@default(SECURITIES)` means every existing broker row inherits the correct category with **zero backfill** (identical pattern to ADR-0029 D1's `kind @default(REVIEW)`).

### D2: Same-entity-plus-dimension over a new `dealer` domain

Bullion dealers are `Broker` rows with `category = BULLION`. We **reject** opening a new `dealer` bounded context because the reviewable-subject is exclusively `Broker` (see Context). A separate `Dealer` model would force the **review target to become polymorphic** (`brokerId` → `targetType + targetId`, or a parallel nullable `dealerId`), rippling through the `reviews` table and every `(tenantId, brokerId, …)` index, complaints (ADR-0029 same table), verification, claims, the on-chain anchor + IPFS payload, and every reviews/complaints use case and front-end surface — a cross-cutting refactor of the entire trust pipeline **for zero functional payoff** (a dealer review behaves identically to a broker review).

This mirrors ADR-0029's "less code duplication wins; the discriminator keeps query cost flat" reasoning, applied at the entity level. Per cursor rule 10's decision tree, a bullion dealer is a business variation **inside the existing `brokers` domain**, not a new domain (no new lifecycle — same review/complaint/claim/verify lifecycle, new category).

### D3: New `Regulator` + `LicenseType` values; reuse `LicenseStatus`

```prisma
enum Regulator {
  HK_SFC
  HK_CGSE   // Chinese Gold & Silver Exchange Society (self-regulatory bullion exchange)
}

enum LicenseType {
  // ... existing HK_SFC_TYPE_1..10 ...
  HK_CGSE_MEMBER   // CGSE membership; the 行員 member code goes in BrokerLicense.licenseNumber
}
```

- CGSE membership is a single membership status (not 10 regulated-activity categories like SFC), so one `HK_CGSE_MEMBER` license type suffices; the 行員編號 (e.g. `001`, `009`) is stored in `BrokerLicense.licenseNumber`.
- `LicenseStatus` is **unchanged**: CGSE's watch/suspended roster maps to the existing `SUSPENDED` / `REVOKED` values — a ready-made, immutable trust signal.

### D4: Keep the `Broker` model name; no new tenant

We do **not** rename `Broker` → `Provider`/`Entity` (a large table-rename + all-FK migration with high risk and no Phase 1 payoff). Instead the model's meaning is widened to "a reviewable, registered financial-service provider," documented in the schema comment. Revisit a rename only if a third non-broker category proves the name is a real problem (A4).

Multi-tenancy is unchanged: bullion dealers are `hk`-tenant rows with `category = BULLION`. **No new tenant dimension** (per cursor rule 31 + ADR-0038 — only global reference tables skip `tenantId`; `Broker` is tenant-scoped and stays so).

### D5: CGSE roster via curated JSON + offline refresh (not scheduled scraping)

CGSE exposes **no API** — only a public, trilingual (en / zh-Hant / zh-Hans) HTML member-list page (`/chines/en/member-list`), ~171–261 members, with a "最後更新日期" timestamp and a separate watch/suspended list. The set is **small and slow-moving** (membership is sticky).

Data pipeline:

- Curated `packages/db/seed-data/cgse-members.json` (the same curated-JSON pattern ADR-0038 D5 used for INDEX/COMMODITY), committed to the repo.
- An **offline** refresh script (`packages/db/src/cgse/` + a `pnpm` script) that scrapes the public member-list page to regenerate the JSON. A developer runs it, reviews the git diff, and commits — so every membership change is an auditable diff and a markup change fails loudly in front of a human, not silently in production.
- Seed/upsert sets `BrokerLicense` rows with `regulator = HK_CGSE`, `source` provenance, and maps the watch/suspended roster to `SUSPENDED` / `REVOKED`.
- Per cursor rule 31 §外部參考資料同步: idempotent natural-key upsert, never hard-delete (soft via `LicenseStatus`), **never call CGSE at request time**.

We **reject** a scheduled ECS/EventBridge sync (ADR-0020 style) for now: SFC offers a structured JSON endpoint and churns weekly, justifying automation; CGSE offers only fragile HTML for a ~250-row sticky set, where weekly scraping adds production infra (ECS task, IAM, security group, monitoring) for near-zero freshness benefit. Scheduling is listed as a **Phase 2 follow-up** (same "revisit later" posture ADR-0020 took for failure alerts / diff reports). This also stays consistent with ADR-0038's documented anti-scraping lean (it rejected scraping investing.com on ToS + anti-bot grounds).

### D6: i18n / glossary

Register「金商 / 貴金屬交易商 / Bullion dealer」and「CGSE / 香港金銀業貿易場」in `docs/04-glossary.md`, and add the trilingual nav + category labels when the UI is wired.

### D7: UI surfaces (planning — UI delivered by Google, functionality by this team)

- **Navigation gets a dedicated「金商」menu entry** (a sibling to brokers).
- The bullion-dealer **list page reuses the broker grid**, filtered to `category = BULLION`.
- The **detail page reuses the broker detail layout for a consistent experience**, but because CGSE carries far less content than the SFC register (no 10 regulated-activity types, no responsible officers / disciplinary detail, no `sfcDetailJson`), the **tab set differs** — e.g. bullion dealers show「會籍 / 評論 / 投訴」without the SFC license-detail tab.
- Console admin broker management gains a `category` dimension (filter + label).

**UI division of labour:** all bullion-dealer page visuals/layout are **designed by Google**; this team only wires data, API, state, and i18n. The Google UI prompt is a **deliverable of the UI-wiring session** (written once DB/API shapes are final so the prop/field/tab structure is precise), then handed to the owner to paste into Google. It is intentionally **not** produced in this ADR session.

### D8: Work decomposition + hand-off discipline (per cursor rule 96 + 98)

Because the implementation is large, code is decomposed into independent sessions, each ending in a hand-off (status update + commit + next-session start point), each < 200 lines diff and independently typecheck/test/commit-able. See Implementation Notes.

## Alternatives Considered

- **A1: New `dealer` bounded context + `dealers` table.**
  - Pros: clean separation; dealer-specific fields without nullability; "correct" naming.
  - Cons: forces the review target polymorphic, a cross-cutting refactor of the entire reviews/complaints/verify/claim/on-chain pipeline; doubles surface area; a dealer review behaves identically to a broker review (zero payoff).
  - Rejected: cost without benefit; contradicts the ADR-0029 same-table precedent.
- **A2: Overseas / global bullion dealers.**
  - Pros: bigger market.
  - Cons: out of the owner-defined scope (local HK only); no single authoritative roster like CGSE.
  - Rejected: explicitly out of scope for this vertical.
- **A3: Scheduled ECS/EventBridge CGSE sync (ADR-0020 style).**
  - Pros: always fresh, no human in the loop.
  - Cons: CGSE has no API (fragile HTML scraping), the set is small + sticky, and production scraping infra is overkill for near-zero freshness gain.
  - Rejected for now; recorded as a Phase 2 follow-up. Curated JSON + offline refresh (D5) is more robust and auditable.
- **A4: Rename `Broker` → `Provider` / generic entity.**
  - Pros: semantically accurate once non-brokers exist.
  - Cons: large table-rename + all-FK migration; high risk, no Phase 1 payoff.
  - Rejected / deferred: widen the meaning via comment now; revisit only if a third category appears.

## Consequences

### Positive

- Bullion dealers are reviewable **immediately** with zero changes to reviews / complaints / verification / claim / on-chain pipelines (they are just `Broker` rows).
- CGSE watch/suspended roster reuses the immutable `LicenseStatus` lifecycle as a trust signal.
- Consistent reviewer/reader experience across securities and bullion verticals (shared UI components).
- Establishes a repeatable pattern for future `BrokerCategory` verticals (e.g. insurance, MPF) without schema churn.

### Negative / Trade-offs

- The `Broker` model name is now semantically broad (a documented widening, mitigated by schema comments; A4 deferred).
- SFC-specific columns (`ceNumber`, `sfcDetailJson`, `addressEn/Zh`) are null on bullion rows — acceptable, the same nullability trade-off ADR-0029 accepted.
- CGSE roster requires periodic manual offline refresh until a Phase 2 scheduled sync lands (low burden given the sticky set).
- Detail-page tab divergence by category adds conditional rendering in the UI.

### Neutral

- No new tenant dimension; `hk` tenant + category only.
- On-chain contract layer untouched (reviews already anchor by `contentHash`; category is indexer metadata).
- IPFS payload schema unchanged.

## Implementation Notes

Decomposed into independent sessions (cursor rule 96), each a hand-off point (cursor rule 98):

1. **DB** — `BrokerCategory` enum + `Broker.category` + `Regulator += HK_CGSE` + `LicenseType += HK_CGSE_MEMBER` + migration (schema and migration as separate commits per rule 31).
2. **CGSE roster** — `packages/db/seed-data/cgse-members.json` (curated) + offline refresh script (`packages/db/src/cgse/`) + idempotent seed upsert (`source = 'cgse'`; watch/suspended → `SUSPENDED`/`REVOKED`).
3. **API** — brokers domain `category` filter query param + detail response carries `category`; verify reviews/complaints pipeline needs zero change.
4. **Web wiring** — nav「金商」menu + list category filter + detail tab variant by category (consumes Google UI). **This session produces the Google UI prompt** and hands it to the owner.
5. **Console wiring** — admin broker management category dimension (consumes Google UI).
6. **Tests** — unit + component + e2e + trilingual i18n.

UI for steps 4–5 is designed by Google; this repo only wires functionality. No code is written in the ADR (this) session.

## References

- Vision: [`docs/00-vision.md`](../00-vision.md) §三 (target market), §十 (market changes require an ADR)
- Related ADR: [ADR-0029](./0029-complaints-vs-reviews-separation.md) — same-table discriminator precedent
- Related ADR: [ADR-0038](./0038-instrument-catalog-and-asset-scope.md) — curated-JSON reference-data pipeline; anti-scraping lean
- Related ADR: [ADR-0020](./0020-scheduled-sfc-broker-sync.md) — SFC sync pattern (why CGSE differs)
- Related ADR: [ADR-0019](./0019-review-registry-contract-design.md), [ADR-0025](./0025-multi-broker-verification-strategy.md) — reviewable-subject = Broker
- Related ADR: [ADR-0031](./0031-iam-smart-identity-provider.md) — authoritative-registry role analogy
- Cursor rule 10 (architecture / domain decision tree), rule 31 (DB / reference-data sync / no hard delete), rule 96 (task decomposition), rule 98 (session hand-off)
- CGSE member list: `https://cgse.com.hk/chines/en/member-list` (no public API; trilingual HTML)
