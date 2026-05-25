# ADR-0029: Separate complaints from reviews via a `kind` discriminator

## Status

Accepted

## Date

2026-05-25

## Context

OpenTrade's V1 UGC model is "the user writes a review and a star score". The 2026-05-25 team meeting (archived in [`docs/conversations/2026-05-25-team-meeting-strategy.md`](../conversations/2026-05-25-team-meeting-strategy.md) §「3. 產品功能設計 — 投訴與評論分離」) surfaced that this conflates two materially different user actions:

- **Review** — subjective experience, opinion-based ("customer service was rude", "the app feels slow"). Author trustworthiness comes from their SBT tier + verified-broker badge (per [ADR-0025](./0025-multi-broker-verification-strategy.md)).
- **Complaint** — alleged verifiable fact ("the platform was unreachable for 2 hours on 2026-04-01", "I was charged a fee not disclosed in the contract"). Author trustworthiness is per-claim and must be backed by evidence the platform (or eventually a jury) can verify.

Without the distinction, three things break:

1. **Reader signal**. A 1-star "rude staff" review and a 1-star "stole $5000 from me" complaint look identical on the broker page. The reader has no way to weight one heavier than the other.
2. **Phase 3 jury trigger**. The jury system per [ADR-0008](./0008-jury-phased-implementation.md) needs an explicit "this is a dispute, please vote" entry point. A review entity has no such concept; bolting it onto the existing `Review` model retroactively (with a nullable `disputeId`) creates the kind of "is this a real review or a dispute?" branching the codebase should avoid.
3. **Moderation posture**. Per rule 00 红线 the platform cannot delete user content. A _complaint_ however must require evidence (the IPFS-pinned evidence file from the verify-broker flow is the right pattern). Conflating them means either over-burdening reviewers with evidence upload or under-protecting complaints from false accusation.

The C5 public-response mechanism for brokers (Speaker 2's "Porto 聲明窗口" framing in the meeting) deepens the divergence — a complaint deserves an inline broker response with parity weight; a review's broker response should be allowed but optional.

### Public-fairness red-line check

Reviewing (subjective) and complaining (factual) are both first-class UGC actions per rule 00. The split below preserves both: nothing gets deleted from the chain or DB; the only change is structural. Verified-complaint counts join sentiment distribution as the trust-signal pair from ADR-0028.

## Decision

### D1: Same table, new `kind` discriminator

Add `enum ReviewKind { REVIEW COMPLAINT }` to `packages/db/prisma/schema.prisma`. Extend `Review` with:

```prisma
enum ReviewKind {
  REVIEW
  COMPLAINT
}

model Review {
  // existing fields per ADR-0019 / ADR-0027 / ADR-0028 ...
  kind             ReviewKind  @default(REVIEW)
  evidenceIpfsCid  String?     // required when kind == COMPLAINT; nullable for kind == REVIEW
  verifiedAt       DateTime?   // set by admin / jury when complaint is sustained
  verifiedByUserId String?     // admin user id who verified (Phase 1) or jury proposal id (Phase 3)

  @@index([tenantId, brokerId, kind, verifiedAt])
}
```

Both kinds reuse the existing `contentHash` + `ipfsCid` + on-chain anchor pipeline (per [ADR-0019](./0019-review-registry-contract-design.md)). Both reuse `sourceLocale` (per [ADR-0027](./0027-deprecate-ugc-translation.md)) and `sentiment` (per [ADR-0028](./0028-deprecate-five-star-rating.md)).

### D2: Same-table over separate-table

Rejected the `Review` + `Complaint` two-table split because:

- Both kinds need the identical IPFS pin + on-chain anchor + outbox flow; duplicating the use case and infrastructure layer would create two near-identical 60% copies that drift.
- The Phase 3 jury system (per [ADR-0008](./0008-jury-phased-implementation.md)) needs to enumerate "anything that might be disputed" in one query; a `WHERE kind = COMPLAINT` scan is cheaper and more idiomatic than a `UNION ALL` across tables.
- The cursor rule 31 single-source-of-truth principle for similar entities maps directly to the discriminator approach.

Trade-off: the `evidenceIpfsCid` and `verifiedAt` columns are nullable on review rows. This is acceptable because a partial index (`@@index([tenantId, brokerId, kind, verifiedAt])`) keeps the verified-complaints query path narrow regardless of how many review rows pile up.

### D3: Complaint submission requires evidence

`POST /v1/complaints` (new endpoint, M7.2) requires `evidenceIpfsCid: string` in the body. The web form uses the same `Pinata.upload.public.file` path the `/verify` flow already uses (per [ADR-0025](./0025-multi-broker-verification-strategy.md) D7). Allowed MIME types are PNG / JPEG / PDF; size cap 5MB. The complaint body field stays text, no different from a review.

The endpoint is gated by `authMiddleware('verified')` (L2+ SBT per cursor rule 30). Anonymous or L1 users can read complaints but cannot file them. Rationale: every complaint is a future-dispute candidate, and only verified-broker-customer users have a legitimate basis to file.

### D4: Admin verification flow

Two new admin endpoints (M7.3):

- `PATCH /v1/admin/complaints/:id/verify` — sets `verifiedAt = now()`, `verifiedByUserId = admin.userId`, emits outbox event `complaint.verified`.
- `PATCH /v1/admin/complaints/:id/reject` — does **not** delete or hide the complaint (rule 00 红线); only sets `verifiedAt = null` (no-op since it was null) and writes an `adminNote` rejecting the verification claim. The complaint stays visible on the broker page with a "not verified by platform" label.

Phase 3 will add a third path: jury verification (proposal + vote) that competes with admin verification. Per [ADR-0008](./0008-jury-phased-implementation.md) the data shape allows both — `verifiedByUserId` becomes nullable when `verifiedByJuryProposalId` is set (column added later).

### D5: Broker page aggregation

`GET /v1/brokers/:slug` response (already returns `sentimentAggregate` per [ADR-0028](./0028-deprecate-five-star-rating.md) D7) gains `verifiedComplaintCount: number`. Computed via `prisma.review.count({ where: { brokerId, kind: 'COMPLAINT', verifiedAt: { not: null } } })`. The composite index in D1 makes this an index-only scan.

Broker grid cards add a second pill next to the verified-user count: `verifiedComplaintCount` (red when > 0, neutral otherwise). The broker detail tabs gain a tabs split: "Reviews" (kind = REVIEW) and "Complaints" (kind = COMPLAINT) so readers can drill into either feed.

### D6: Per-complaint broker response (C5 fold-in)

The C5 public-response mechanism applies primarily to complaints (and optionally to reviews). A broker (post Phase 2.5 merchant onboarding per ADR-0037, to be written) can submit one inline response per complaint via `POST /v1/complaints/:id/broker-response`. The response itself is also a `Review` row with `kind = REVIEW` and a `respondsToReviewId` foreign key (column added in M7.1). This keeps everything in one table without a separate `BrokerResponse` model.

### D7: Outbox event vocabulary

- `complaint.submitted` (new, written by `SubmitComplaintUseCase`) — analytics + future notification fan-out
- `complaint.verified` (new, written by admin / jury verify path) — fan-out to indexers
- `complaint.rejected` (new, written by admin reject path) — fan-out to indexers
- Existing `review.submitted` covers `kind = REVIEW` as before

The worker treats them as pass-through unless a handler is wired (per the worker's known-event design from the 2026-05-24 follow-up). Phase 1 wires only the indexer fan-out; jury / notification handlers land in Phase 3.

## Alternatives Considered

### A1: Status quo — everything is a `Review`

- Pros: Zero schema change.
- Cons: Conflates the two reader signals; jury system has no clean entry point; complaints cannot require evidence without making evidence required for everyone.
- Why rejected: Conflation is the actual bug the meeting flagged.

### A2: Separate `Complaint` model in its own table

- Pros: Each kind gets its own surface area for kind-specific fields without nullability.
- Cons: Doubles the IPFS pin + on-chain anchor + outbox infrastructure; future jury system needs a `UNION ALL`; refactor of the shared `SubmitReviewUseCase` into two parallel use cases that immediately drift.
- Why rejected: Less code duplication wins over fewer nullables; the partial index in D1 keeps query cost flat.

### A3: Tagging system — review with arbitrary tags

- Pros: Most flexible; "complaint" is just a tag.
- Cons: Tags are user-controlled and would let a malicious user tag a review "complaint" to inflate the verified-complaint count target.
- Why rejected: Server-controlled discriminator is the only safe shape.

### A4: New on-chain `ComplaintRegistry` contract

- Pros: On-chain proof of complaint kind.
- Cons: Cost (new deployment, new audit, new upgrade path), unclear benefit (the on-chain `contentHash` already proves immutability — the `kind` is metadata the indexer can supply).
- Why rejected: No Phase 1 / Phase 1.5 user-visible benefit; revisit at Phase 3+ if jury enforcement requires it.

## Consequences

### Positive

- Reader gets two distinct signals (sentiment for opinions, verified-complaints for facts).
- Phase 3 jury system has a clean trigger (`kind = COMPLAINT && verifiedAt = null && admin reject reason set`).
- Broker response mechanism (C5) gets a structural home without a separate `BrokerResponse` table.
- Cursor rule 30 DDD layering stays clean: one repo, one use case factory, two thin use cases share infrastructure.

### Negative / Trade-offs

- Nullability spreads on `Review` (evidenceIpfsCid, verifiedAt, verifiedByUserId, respondsToReviewId). Mitigated by the type-narrowing kind-discriminator pattern in the application layer (see M7 plan).
- M7 ships a non-trivial 7-commit change (DB + API + admin + web + console + aggregate + tests).
- Broker page tabs UX needs research before final polish — what's the default tab? Mixed feed?
- Backfill of legacy rows: every existing `Review` row inherits `kind = REVIEW` from the schema default; no script needed.

### Neutral

- IPFS payload schema stays at v2 (per ADR-0028 D3) — no new version bump.
- On-chain contract layer is untouched (per A4 rejection).

## Implementation Notes

Implementation is M7 of the 2026-05-25 plan (7 commits):

- M7.1 — DB: `kind` enum + nullable columns + composite index + migration
- M7.2 — API: `SubmitComplaintUseCase` + `POST /v1/complaints`
- M7.3 — API: admin verify / reject endpoints + outbox events
- M7.4 — Web: `ComplaintForm` + broker page Reviews / Complaints tabs split
- M7.5 — Web: `verifiedComplaintCount` pill on broker grid + RatingSummary
- M7.6 — Console: `/admin/complaints` queue page + verify modal
- M7.7 — Tests: unit + integration + E2E

Each commit is < 200 lines and independently deployable per cursor rule 96.

## References

- Vision: [`docs/00-vision.md`](../00-vision.md)
- Meeting archive: [`docs/conversations/2026-05-25-team-meeting-strategy.md`](../conversations/2026-05-25-team-meeting-strategy.md) §「3. 產品功能設計」C5
- Related ADR: [ADR-0008](./0008-jury-phased-implementation.md) — Phase 3 jury entry point
- Related ADR: [ADR-0019](./0019-review-registry-contract-design.md) — contract stores hash only
- Related ADR: [ADR-0025](./0025-multi-broker-verification-strategy.md) — evidence upload pipeline reuse
- Related ADR: [ADR-0028](./0028-deprecate-five-star-rating.md) — sentiment + verified-complaint count are the two-signal trust pair
- Cursor rule 30 — DDD four layers + auth gate
- Cursor rule 31 — DB schema + index strategy
