# ADR-0028: Deprecate five-star rating in favour of three-way sentiment

## Status

Accepted

## Date

2026-05-25

## Context

Phase 1 shipped a 1–5 integer `Review.rating` column (per [ADR-0019](./0019-review-registry-contract-design.md) D1/D4 the value lives only in the IPFS payload, not in the on-chain `Review` struct). Every UI surface — `ReviewForm` star picker, `ReviewCard` star row, broker grid `RatingSummary` headline — renders the score as a five-star widget.

The 2026-05-25 team meeting (archived in [`docs/conversations/2026-05-25-team-meeting-strategy.md`](../conversations/2026-05-25-team-meeting-strategy.md) §「3. 產品功能設計」C1) reopened the question. Four observations forced a re-evaluation:

1. **Susceptibility to paid-promotion gaming**. The chief design rule of OpenTrade is rule 00 红线「商戶付費不影響評論顯示順序」. A five-star average is the universal lever paid-review networks game (WikiFX is exactly the case study OpenTrade was built to displace). Even with no platform-side weighting, the _appearance_ of a "score" creates a target the wrong incentives can shoot at.
2. **Subjective compression**. The five-star scale forces every reviewer to collapse "the broker delayed my withdrawal by 2 hours" (a fact) and "the customer-service agent was rude" (a feeling) onto the same axis. The meeting (Speaker 1) framed this as the root mistake of WikiFX / TripAdvisor: a single number that hides whether the complaint is verifiable.
3. **Verified-complaint count is a stronger trust signal**. The Phase 1.5 separation of complaints from reviews (per [ADR-0029](./0029-complaints-vs-reviews-separation.md), authored alongside this ADR) gives readers a second, evidence-backed metric (`verifiedComplaintCount`) that lives next to the sentiment distribution. Together they are more informative than any single star average.
4. **Internal disagreement on the call**. The same meeting (timestamp 02:42:10 in the raw transcript) revisited five-star and a counter-argument was made that mainstream consumers expect a star widget. The decision below picks **three-way sentiment** as primary but documents the five-star alternative in detail so the call can be reopened with a successor ADR if Phase 2 data shows reader confusion.

The project owner has explicitly resolved C1 in favour of removing the five-star rating ("remove_5star" — see the 2026-05-25 archive). This ADR formalises that resolution and pins the migration plan.

### Public-fairness red-line check

Removing a paid-promotion-vulnerable surface strengthens rule 00 红线 alignment. Replacing it with sentiment + verified-complaints respects the same UGC author intent (one act of self-expression per review) while reducing the platform's exposure to gaming.

## Decision

### D1: Add `Sentiment` enum + `Review.sentiment` nullable column

`packages/db/prisma/schema.prisma` gains:

```prisma
enum Sentiment {
  POSITIVE
  NEUTRAL
  NEGATIVE
}

model Review {
  // existing fields...
  /// @deprecated per ADR-0028; kept for two-release backward compatibility window, see D6
  rating          Int?
  sentiment       Sentiment?  // nullable during transition; required at submit time post-D4
  // ...
  @@index([tenantId, brokerId, sentiment])
}
```

The column is `nullable` initially so legacy rows do not have to be backfilled atomically — the migration (M3.1) and the backfill script (M3.2) ship as separate commits per rule 31.

### D2: Five-to-three mapping for backfill

The M3.2 backfill maps existing `rating` values per the table below:

| rating | sentiment |
| ------ | --------- |
| 5      | POSITIVE  |
| 4      | POSITIVE  |
| 3      | NEUTRAL   |
| 2      | NEGATIVE  |
| 1      | NEGATIVE  |

This is deliberately coarse — the goal is not to perfectly reconstruct the author's intent but to give every legacy row a sentiment so the new `RatingSummary` aggregator renders without holes. The original `rating` value is preserved so a future ADR could revisit the mapping.

### D3: IPFS payload schema v1 → v2

`PinataIpfsService` writes payloads at `version: 2` going forward:

```json
{
  "version": 2,
  "title": "...",
  "body": "...",
  "sentiment": "POSITIVE",
  "rating": 5,
  "createdAt": "..."
}
```

The `rating` field stays in v2 payloads for backward-compat — legacy v1 readers (e.g. third-party indexers) keep working. Forward readers (v2-aware) prefer `sentiment` when present. No schema-version field is required for parsing v1 vs v2 because `sentiment` presence is the discriminator; the explicit `version: 2` is for human auditors.

### D4: Required at submit time post-D4

After M3 ships (DB column + backfill), M4 makes `Sentiment` a required field on the `SubmitReviewInput` value object. The API endpoint `POST /v1/reviews` requires the body to include `sentiment`. The `rating` field becomes optional at the API layer and is omitted from new submissions by the web form (per M5).

### D5: Contract is unchanged

The on-chain `ReviewRegistry` (per [ADR-0019](./0019-review-registry-contract-design.md)) stores only `contentHash` + `ipfsCid` + author + brokerId. Rating / sentiment never crosses the on-chain boundary. No contract upgrade is needed.

### D6: Drop the `rating` column after two releases

Per cursor rule 31 「Drop column 不分階段」 there is no formal "deprecation period" mechanism — a column is either there or it is not. To honour rule 31 while still buying time for any third-party reader of the production DB to migrate, the schedule is:

1. **Release N (this ADR)**: `sentiment` added nullable, `rating` annotated `@deprecated`.
2. **Release N+1**: `sentiment` becomes non-nullable in code (every submit path writes it) and the backfill is verified complete on production.
3. **Release N+2**: `rating` column dropped via Prisma migration. A separate ADR (number TBD) explicitly authorises the drop and confirms the IPFS payload v2 rollout to indexers.

Until that drop ADR is written, `rating` stays in schema with a `/// @deprecated` doc-comment (see M3.3).

### D7: UI rebuild scope

`packages/ui` gains a `SentimentPicker` primitive (M5.1) modelled after the existing toggle-group story. The web `ReviewForm` swaps its star input for the picker; `ReviewCard` swaps its star row for a sentiment badge; `RatingSummary` becomes `SentimentDistribution` (a three-bar mini-chart). The console `ReviewsClient` table column and filter use the same sentiment vocabulary.

For legacy rows where `sentiment === null` (pre-backfill window or backfill failure), UI surfaces show a small caption derived from the historical `rating` ("依五星評分回推為 X") but **do not render stars**. This nudges every reader toward sentiment-first without throwing data away.

## Alternatives Considered

### A1: Keep five-star and ignore the meeting

- Pros:
  - Zero migration cost.
  - Star widgets are a universal shorthand most consumers parse instantly.
- Cons:
  - Leaves the paid-promotion-gaming surface intact (rule 00 红线 vulnerability).
  - Five-star averages obscure the difference between facts and opinions, which is the core differentiator of the OpenTrade design.
  - Does not honour the meeting outcome documented in the 2026-05-25 archive.
- Why rejected: The trust signal goal (rule 00) outranks UX familiarity, and the verified-complaint mechanism in ADR-0029 plus the sentiment distribution is at least as easy to scan as a number-out-of-5.

### A2: Five-star + sentiment dual axis

- Pros:
  - No backfill needed; both signals coexist.
  - Power-users get the star, casual readers get the badge.
- Cons:
  - Doubles the UI surface area and amplifies cognitive load (which signal is canonical?).
  - The "canonical score" question creates the exact paid-promotion target this ADR removes.
  - Two-axis rating surfaces are exactly what TripAdvisor / Yelp have spent a decade trying to compress back to one number.
- Why rejected: Carrying both during a transition window is fine (D6), but the steady state must be single-axis.

### A3: Seven-way scale (-3 .. +3)

- Pros:
  - More expressive than three-way without re-introducing the five-star pattern.
- Cons:
  - Reintroduces the average-of-numbers gaming surface (now bigger).
  - The meeting did not ask for finer granularity; it asked for _honester_ granularity.
- Why rejected: Solves the wrong problem.

### A4: Net Promoter Score (0..10)

- Pros:
  - Industry-standard, widely understood.
- Cons:
  - NPS is a _survey methodology_ for product teams, not a per-review verdict; mis-applying it here would confuse the UX.
  - Has the same paid-gaming exposure as a five-star average.
- Why rejected: Wrong tool.

## Consequences

### Positive

- Removes the highest-value paid-promotion-gaming target.
- Forces "is this a fact or a feeling" out into the open (via the ADR-0029 split).
- Aligns the API + DB + UI on a single canonical sentiment axis, reducing future drift.
- Storybook gets a reusable `SentimentPicker` primitive other domains can reuse (e.g. KOL signal sentiment in Phase 2).

### Negative / Trade-offs

- Existing E2E tests pinning star widgets break and need rewriting (M6).
- One-time DB backfill required (M3.2); cursor-paginated and idempotent so safe to re-run, but takes a deploy window.
- Some readers may genuinely prefer five-star familiarity. The plan accepts this and documents the counter-argument here so a successor ADR can reopen if Phase 2 reader data shows confusion.

### Neutral

- `Review.rating` column stays in schema for two releases (D6), so production tooling that reads it directly remains functional during transition.
- Contract layer is untouched (D5), so no upgrade is required.

## Implementation Notes

Implementation is decomposed into milestones M3-M6 of the 2026-05-25 execution plan (see `.cursor/plans/`):

- M3 — DB layer (3 commits): enum + nullable column + migration + backfill + `@deprecated` annotation
- M4 — API layer (4 commits): `Sentiment` VO + `SubmitReviewUseCase` + endpoint zod + `sentimentAggregate` on broker detail
- M5 — Web + Console UI (6 commits): primitive + ReviewForm + ReviewCard + RatingSummary + console + legacy caption
- M6 — Tests (3 commits): unit + Storybook + Playwright

Each milestone is independently mergeable per cursor rule 96. The IPFS payload v2 rollout (D3) happens inside M4.2 atomically with the use case rewrite.

## References

- Vision: [`docs/00-vision.md`](../00-vision.md)
- Meeting archive: [`docs/conversations/2026-05-25-team-meeting-strategy.md`](../conversations/2026-05-25-team-meeting-strategy.md)
- Related ADR: [ADR-0019](./0019-review-registry-contract-design.md) — contract stores hash only, so this change is off-chain
- Related ADR: [ADR-0029](./0029-complaints-vs-reviews-separation.md) — verified-complaint count partners with sentiment distribution
- Cursor rule 30 — API DDD four layers
- Cursor rule 31 — DB schema / migration / backfill split
