# ADR-0037: Merchant Phase 2.5 — broker public response + editable scope + ad isolation

## Status

Accepted

## Date

2026-05-26

## Context

Phase 1 (M7) shipped the complaint/review separation (per [ADR-0029](./0029-complaints-vs-reviews-separation.md)) and gave brokers passive visibility into complaints via the public broker page's third tab. Phase 2 (M8-M9) shipped the KOL signal architecture. The 2026-05-25 team meeting (archived in [`docs/conversations/2026-05-25-team-meeting-strategy.md`](../conversations/2026-05-25-team-meeting-strategy.md) §「公開回應」) identified broker response as the next critical-path feature for fairness — a complaint system where the accused party cannot respond is inherently one-sided.

`docs/03-status.md` §「被投訴方答辯權階段化實現追蹤」tracks the three-phase progression:

| Phase                         | Broker can do                                                                              | Cannot do                              |
| ----------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------- |
| Phase 1 (M7, done)            | Passively browse public complaints tab                                                     | No notification, no inbox, no response |
| **Phase 2.5 (M10, this ADR)** | **Merchant console complaint inbox + one public response per complaint + dashboard stats** | No formal arbitration / jury           |
| Phase 3 (future)              | 7-day defense window + evidence submission + jury vote                                     | —                                      |

This ADR promotes STAGING.md S4 (ADR-0033, public broker response) and S8 (ADR-0037, merchant editable scope), collapsing both into a single coherent decision per the STAGING.md §4 guidance: "S4 and S8 are most coherent as one ADR if M10 ships them together."

Five design questions require resolution:

1. How does a broker response map to the existing data model?
2. What constraints govern broker responses (count limit, editability, length)?
3. Does the response go on-chain or IPFS?
4. What can a merchant edit on their profile?
5. How is advertising / paid-promotion isolation enforced?

### Public-fairness red-line check

All decisions below preserve rule 00 red lines: no review or complaint can be deleted; broker responses cannot influence complaint display order; merchants cannot pay to affect any ranking; responses are append-only (once submitted, immutable per the chain-immutability spirit even though Phase 2.5 responses are off-chain).

## Decision

### D1: Broker response as a Review row with `respondsToReviewId` self-reference

A broker response is stored as a `Review` row with:

- `kind = REVIEW` (it is the broker's counter-narrative, not a complaint)
- `respondsToReviewId` pointing to the complaint's `Review.id`
- `userId` = the merchant user who submitted the response
- `brokerId` = same as the complaint's `brokerId` (enforced in the use case)

This aligns with [ADR-0029 D6](./0029-complaints-vs-reviews-separation.md) which defined the mechanism: "The response itself is also a `Review` row with `kind = REVIEW` and a `respondsToReviewId` foreign key."

The `respondsToReviewId` column was added in M7.1 (`cedd5a7`) as a plain `String? @db.Uuid` without a Prisma relation. M10.1 wires the bidirectional self-relation and adds an index.

**Schema change (M10.1):**

```prisma
model Review {
  // ... existing fields ...
  respondsToReviewId String?  @db.Uuid

  // New: self-relation for broker responses
  responseTo  Review?  @relation("ReviewResponse", fields: [respondsToReviewId], references: [id])
  responses   Review[] @relation("ReviewResponse")

  @@index([respondsToReviewId])  // new index for response lookup
  // ... existing indexes ...
}
```

### D2: One response per complaint, immutable after submission

Constraints:

- **One response per complaint per broker**: enforced via a unique partial index or application-layer guard (`WHERE respondsToReviewId = :complaintId AND brokerId = :brokerId`). Application-layer guard chosen over DB partial unique index because Prisma 6.x does not natively support `@@unique` with a `WHERE` clause — the use case checks `count > 0` before insert.
- **Immutable**: once submitted, the response body cannot be edited or deleted. This mirrors the platform's core immutability principle — even though Phase 2.5 responses are DB-only (not on-chain), the behavioral contract is the same.
- **No sentiment**: broker responses do not carry a sentiment value (they are not an opinion about the broker — they ARE the broker). The `sentiment` column is set to `null` and `rating` to the deprecated default `3`.

Rationale: allowing edits would undermine trust ("the broker changed their story"). A broker who wants to add information can reference their original response in a new complaint on a separate topic, but cannot retroactively alter a response attached to a specific complaint.

### D3: Response goes to IPFS but not on-chain in Phase 2.5

Broker responses follow the same IPFS pipeline as reviews and complaints:

- Body is pinned to Pinata via the existing `IIpfsService` port
- `contentHash` (keccak256 of the JSON payload) is computed
- `ipfsCid` is stored on the `Review` row

The response does NOT go on-chain in Phase 2.5. The outbox event `broker_response.submitted` is ack-only (same pattern as `complaint.*` events in M7.2). Phase 3+ may add on-chain anchoring via the existing `ReviewRegistry` contract if the jury system requires it.

**IPFS payload shape** (extends v2 per [ADR-0028 D3](./0028-deprecate-five-star-rating.md)):

```json
{
  "version": 2,
  "kind": "BROKER_RESPONSE",
  "title": "",
  "body": "...",
  "respondsToReviewId": "<complaint-uuid>",
  "respondsToContentHash": "<complaint-content-hash>"
}
```

The `respondsToContentHash` field creates a cryptographic link between the response and the original complaint, enabling future on-chain verification that the response was authored against a specific complaint state.

### D4: Merchant complaint inbox in console

New console page `/broker/complaints` (parallel to existing `/broker/reviews`):

- Lists all complaints against the merchant's claimed broker
- Each complaint shows: status badge (OPEN/VERIFIED/REJECTED), body preview, evidence IPFS link, date, author info
- Each complaint shows a "Respond" CTA if no response exists, or the existing response inline if already responded
- Status filter (OPEN / VERIFIED / REJECTED / ALL)

New API endpoint: `GET /v1/brokers/:slug/owner-complaints` (auth: merchant, same ownership guard as `owner-stats`). Returns complaints with a `brokerResponse` nested object when one exists.

### D5: Dashboard complaint statistics

The existing `GET /v1/brokers/:slug/owner-stats` endpoint gains three new fields:

```typescript
{
  // ... existing stats ...
  complaintStats: {
    totalComplaints: number; // all complaints (any status)
    verifiedComplaints: number; // verifiedAt != null
    openComplaints: number; // verifiedAt == null AND adminNote == null
    respondedComplaints: number; // has at least one response row
  }
}
```

### D6: Merchant editable scope

Merchants who have claimed a broker (per the existing claim flow) can edit:

| Field                       | Editable?     | Constraint                                       |
| --------------------------- | ------------- | ------------------------------------------------ |
| `description`               | Yes           | Max 2000 chars, sanitized (no HTML)              |
| `logoUrl`                   | Yes           | Must be a valid URL; future: direct upload to S3 |
| `websiteUrl`                | Yes           | Must be a valid URL                              |
| `addressEn` / `addressZh`   | No (Phase 4+) | Sourced from SFC sync; manual override needs ADR |
| `displayName` / `legalName` | No            | Sourced from SFC; immutable by merchant          |
| `ceNumber`                  | No            | Regulatory identifier; immutable                 |
| `sfcDetailJson`             | No            | SFC sync data; immutable                         |

The existing `PATCH /v1/brokers/:slug` endpoint already handles `description` and `logoUrl`. M10 extends it with `websiteUrl` validation.

### D7: Advertising and paid-promotion isolation

**Absolute rule** (extends rule 00 red line):

- No merchant payment or subscription tier may influence:
  - Review/complaint display order
  - Sentiment aggregate computation
  - Verified complaint count
  - Search result ranking
  - KOL signal display near the broker profile
- Merchant-editable fields (`description`, `logoUrl`, `websiteUrl`) are displayed in a clearly labeled "Broker Profile" section, visually separated from user-generated content sections
- Future SaaS features (analytics dashboard, API access, enhanced profile) must never cross the UGC boundary

This is not a new decision — it reinforces rule 00's existing red lines with explicit M10 implementation guidance.

### D8: Broker response length and content rules

- **Body**: required, min 10 chars, max 2000 chars (same as complaint body cap per M7.5a)
- **Title**: not used (broker responses are inline, not standalone); set to empty string at the presentation layer
- **No evidence upload**: broker responses are text-only in Phase 2.5. Phase 3 jury defense adds evidence upload capability
- **Language**: `sourceLocale` captured from the merchant's console locale (same as review/complaint pattern per ADR-0027)
- **Rate limit**: 3 responses per hour per merchant (prevents spam while allowing reasonable batch processing of a complaint backlog)

## Alternatives Considered

### A1: Separate `BrokerResponse` model

- Pros: Clean separation; no nullable columns on existing model
- Cons: Duplicates the IPFS pin + content hash + outbox infrastructure for a third time; breaks ADR-0029 D6's explicit design to reuse the `Review` row model; Phase 3 jury system needs unified query across reviews + complaints + responses — three models means three-way UNION
- Why rejected: ADR-0029 D6 already decided this; reversing it creates more problems than it solves

### A2: Allow response editing within 24 hours

- Pros: Forgives typos and hasty first drafts; common in traditional platforms
- Cons: Undermines the immutability narrative that differentiates OpenTrade from WikiFX; creates a trust gap ("was this the original response or an edited version?"); complicates IPFS anchoring (which CID is canonical?)
- Why rejected: Immutability is the product's core value proposition. A merchant can always explain further in a separate communication channel — the platform response is the permanent record

### A3: Broker response as a separate `kind = RESPONSE` discriminator

- Pros: Three-way kind makes queries explicit (`WHERE kind = 'RESPONSE'`)
- Cons: Requires a schema migration adding a third enum value; all existing `kind`-based queries (aggregate splits, complaint tabs) need `WHERE kind IN ('REVIEW', 'RESPONSE')` adjustments; the response IS a review from the broker's perspective — it's their public statement
- Why rejected: `kind = REVIEW` + `respondsToReviewId IS NOT NULL` is a sufficient discriminator with zero schema change to the enum

### A4: On-chain broker responses from day one

- Pros: Maximum immutability guarantee; consistent with review on-chain pipeline
- Cons: Gas cost for merchant responses; no user-visible benefit over IPFS in Phase 2.5 (the chain only proves immutability — IPFS CID + content hash already prove content integrity); adds complexity to the outbox worker
- Why rejected: Phase 2.5 ships without on-chain anchoring; the IPFS + content hash + DB audit trail is sufficient. Phase 3+ jury system can add chain anchoring if dispute resolution requires provable response timestamps

## Consequences

### Positive

- Broker defense rights are structurally enabled without waiting for Phase 3 jury
- One-response-per-complaint immutability aligns with platform's core narrative
- Reusing the `Review` row model (per ADR-0029 D6) keeps the codebase DRY — same IPFS pipeline, same outbox pattern, same content hash computation
- `respondsToReviewId` self-relation enables efficient "complaint + response" pair queries
- Merchant complaint inbox closes the #1 merchant UX gap identified in the 2026-05-25 meeting
- Dashboard complaint stats give merchants actionable visibility

### Negative / Trade-offs

- `Review` model gains yet another nullable pattern (`respondsToReviewId` is null for 99% of rows). Mitigated by the index on `respondsToReviewId` which makes non-null lookups fast
- Application-layer uniqueness guard (one response per complaint) is weaker than a DB constraint. Mitigated by wrapping the check + insert in a single Prisma transaction
- Phase 2.5 responses are not on-chain — a determined attacker with DB access could theoretically alter them. Mitigated by IPFS CID + content hash which provide tamper detection even without chain anchoring
- Merchant editable scope is deliberately narrow (only 3 fields). Some merchants may want more customization — this is deferred to Phase 4+ per D6

### Neutral

- Console nav gains a fourth merchant item (`/broker/complaints`) — minimal sidebar real estate impact
- Outbox event vocabulary grows by one (`broker_response.submitted`) — same ack-only pattern as existing complaint events
- No contract changes required — `ReviewRegistry` and `ReviewerSBT` are untouched

## Implementation Notes

Implementation spans M10 of the 14-milestone execution plan (15 commits):

- M10.0 — This ADR + STAGING.md S4/S8 cleanup
- M10.1 — DB: wire `respondsToReviewId` self-relation + `@@index([respondsToReviewId])` + migration
- M10.2 — API: broker response domain bootstrap (entity types + repo port + Prisma impl)
- M10.3 — API: `SubmitBrokerResponseUseCase` + `POST /v1/complaints/:id/broker-response`
- M10.4 — API: `GET /v1/brokers/:slug/owner-complaints` + owner-stats complaint stats
- M10.5 — API: public complaint endpoints gain `brokerResponse` nested object
- M10.6 — API: outbox event `broker_response.submitted` ack-only handler
- M10.7 — Console: API client types + fetchers for merchant complaints
- M10.8 — Console: `/broker/complaints` inbox page
- M10.9 — Console: `BrokerResponseForm` modal + already-responded readonly display
- M10.10 — Console: dashboard complaint stats card + AuthGate nav item
- M10.11 — Web: API client broker response types
- M10.12 — Web: `ComplaintCard` broker response display section
- M10.13 — i18n: three-locale messages for all M10 UI (~80 keys x 3 locales)
- M10.14 — Tests: API use case unit tests + web e2e stub updates

Each commit is independently deployable per rule 96. UI design by Google is pending — M10 ships functional skeletons (API client, data fetch, state logic, routing, i18n keys) that the design layer will skin.

## References

- Vision: [`docs/00-vision.md`](../00-vision.md) §四 (broker as stakeholder)
- Meeting archive: [`docs/conversations/2026-05-25-team-meeting-strategy.md`](../conversations/2026-05-25-team-meeting-strategy.md) §「公開回應」
- Status: [`docs/03-status.md`](../03-status.md) §「被投訴方答辯權階段化實現追蹤」
- Related ADR: [ADR-0029](./0029-complaints-vs-reviews-separation.md) — D6 defines the `respondsToReviewId` mechanism
- Related ADR: [ADR-0028](./0028-deprecate-five-star-rating.md) — IPFS payload v2 pattern
- Related ADR: [ADR-0019](./0019-review-registry-contract-design.md) — ReviewRegistry contract (not modified)
- Related ADR: [ADR-0027](./0027-deprecate-ugc-translation.md) — sourceLocale capture pattern
- STAGING.md: S4 (public response) + S8 (merchant scope) — both promoted by this ADR
- Cursor rule 00 — no deletion, no paid ranking
- Cursor rule 30 — API DDD four layers
- Cursor rule 50 — PII protection
- Cursor rule 96 — atomic commit discipline
