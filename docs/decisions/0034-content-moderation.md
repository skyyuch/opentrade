# ADR-0034: Content moderation layer 1 — pre-publication content-neutral gate + admin-managed wordlist with audit

## Status

Accepted

## Date

2026-06-05

## Context

Reviews are anchored on-chain and pinned to IPFS (per [ADR-0019](./0019-review-registry-contract-design.md)).
Once a review passes `SubmitReviewUseCase` (IPFS pin → DB + outbox → `ReviewRegistry.submitReview`)
it is **permanently irreversible**: the project red line (rule 00 / `AGENTS.md`)
forbids the platform from ever deleting or mutating a published review.

That irreversibility creates a one-shot problem the platform has never addressed:
today the only validation on a review is Zod length/type/enum checks
(`apps/api/src/domains/reviews/presentation/routes.ts`). There is **no content
moderation whatsoever**. Profanity, personal attacks, off-platform solicitation
("加我 TG @xxx"), or outright illegal content would be permanently engraved
on-chain with no way to take it back.

The only point at which the platform can intervene without violating the
no-deletion / no-tampering red lines is **before the content is anchored**.

This decision was surfaced as staged item **S5 → ADR-0034** in
[`STAGING.md`](./STAGING.md) ("Content moderation: hate speech filter +
label-not-delete two-layer"; trigger: "first moderation incident OR pre-Phase 2
launch hardening"). The project owner elected to **promote it early** as
pre-Phase 2 launch hardening, and to ship the **pre-publication layer first**.

The hardest constraint here is not technical. A content filter on a platform
whose entire reason to exist is "公平、公開、不可篡改" (fair, open, immutable)
can itself become a censorship vector. WikiFX deletes negative reviews for pay;
OpenTrade must never gain an equivalent lever. Therefore the filter must be
**strictly content-neutral** and **fully auditable**.

## Decision

### D1: A pre-publication, content-neutral hard gate (layer 1)

Moderation runs at submit time, **before** `keccak256` / IPFS pin / DB write /
outbox. On a match the submission is rejected with HTTP **422
`CONTENT_REJECTED`** and the user edits their own text and resubmits. Nothing
prohibited is ever pinned or anchored.

The gate is **content-neutral**. It blocks only four categories (D5). It MUST
NOT block negative opinion. Criticism words such as 騙 / 爛 / 差 / 避雷 / 虧錢
("scam", "trash", "bad", "avoid", "lost money") are explicitly **allowed** and
this is enforced by a guard test in `packages/shared` (rule 60). Using the
moderation system to suppress negative reviews is a red-line violation, codified
in the new rule 52.

### D2: New `moderation` DDD domain; reviews depends via a port

Because the wordlist becomes shared infrastructure (reviews now; complaints /
KOL notes later), a new domain `apps/api/src/domains/moderation/` is created
with the standard four layers (per rule 10 "新增 domain 必先寫 ADR" and ADR-0006).

`reviews` does **not** import a `moderation` use case directly (rule 30). The
`reviews` domain defines an `IContentModerator` port; `moderation` provides a
`ContentModeratorAdapter`; the two are wired at the `reviews/presentation/routes.ts`
composition root. `SubmitReviewUseCase` receives `IContentModerator` by
constructor injection.

The pure matching engine lives in `packages/shared` (`moderateContent(text, terms)`),
framework-free and DB-free, so both `apps/api` (DB-backed terms) and `apps/web`
(baseline terms) reuse identical logic (rule 10 dependency direction).

### D3: Admin-managed wordlist in DB + the project's first audit-log pattern

The wordlist is **editable from the console admin**, stored in two new tables
(see [ADR's DB shape](#implementation-notes)):

- `ModerationTerm` — `tenantId, category, term, isRegex, enabled, note,
createdByUserId, timestamps, deletedAt`.
- `ModerationTermAudit` — append-only, **never deleted**: `termId, action
(CREATE/UPDATE/ENABLE/DISABLE/DELETE), beforeJson, afterJson, actorUserId,
reason, createdAt`.

Every mutating admin action writes an audit row **in the same Prisma
transaction** as the change. This is the project's first audit-log pattern and
exists specifically to make the moderation lever **non-abusable and
transparent**: any term ever added/removed is attributable to an actor with a
reason and a timestamp. A future public-facing audit view (transparency) is
noted as follow-up.

At runtime the API loads terms through a `CachedTermProvider` (in-memory TTL)
to avoid a DB read on every submission; admin writes invalidate the cache. On a
cold start with an empty table, the provider falls back to
`BASELINE_MODERATION_TERMS` (D6) so the gate is never silently open.

### D4: Behaviour is hard-block — not mask, not warn, not human queue

Confirmed with the owner. On match: reject (422), tell the user which
category(ies) to fix, let them edit. Rationale tied to the red lines:

- **No masking** (`***`): the platform would be silently altering the author's
  words — a form of tampering.
- **No warn-only**: would let prohibited content reach the chain.
- **No human review queue**: a human gatekeeper deciding which reviews get
  published is exactly the "platform controls what appears" lever OpenTrade
  exists to abolish.

### D5: Four categories now; PII and post-publication labelling deferred

Layer-1 categories (owner-selected): **PROFANITY, ATTACK, CONTACT
(solicitation/ads), ILLEGAL**. A PII-of-others category was considered and
deferred (D-Alternatives). The staged S5 "label-not-delete two-layer" idea —
a **post-publication** admin _annotation_ layer that labels (never deletes)
already-anchored content — remains in scope for this moderation theme but is
**explicitly deferred** to a later layer-2 effort; the existing
`Review.adminNote` column already anticipates it.

### D6: Server is authoritative; client mirror is UX-only; logs carry no matched strings

- `apps/web` cannot touch the DB (rule 00), so the `ReviewForm` runs the same
  `moderateContent` against a bundled `BASELINE_MODERATION_TERMS` for instant
  feedback. This is **advisory UX only**; the API (full DB terms) is the sole
  authority.
- Moderation logs record `categories + count` only — **never the matched
  substrings**, because the CONTACT category can capture phone numbers (PII)
  (rule 50 / rule 30).

### D7: New cursor rule 52

A new `.cursor/rules/52-content-moderation.mdc` codifies the content-neutral
red line, the wordlist + audit discipline, and the prohibition on using
moderation to suppress negative reviews. Rule 99's index is updated.

## Alternatives Considered

- **A1: No moderation; rely on terms-of-service + after-the-fact reporting.**
  - Pros: zero censorship risk; simplest.
  - Cons: irreversibility means a single profane/illegal/doxxing review is
    permanent and unfixable. Unacceptable pre-launch.
  - Rejected.
- **A2: Mask matched terms with `\***` and publish anyway.\*\*
  - Pros: never blocks a user.
  - Cons: platform silently rewrites the author's content = tampering; conflicts
    with "不可篡改". Rejected (D4).
- **A3: Warn-only / soft gate.**
  - Cons: prohibited content still reaches the immutable chain. Rejected (D4).
- **A4: Human moderation queue (approve before publish).**
  - Cons: reintroduces "platform decides what appears", the exact WikiFX-style
    lever OpenTrade opposes; also unscalable. Rejected (D4).
- **A5: Git-static wordlist (code-versioned, no DB).**
  - Pros: maximally transparent and auditable via git history; no schema; no
    abuse lever.
  - Cons: adding a term needs a deploy; no operator self-service. The owner
    chose DB-managed self-service, so this is kept only as the `BASELINE` seed
    and client-mirror source. Partially adopted.
- **A6: Put moderation logic inside the `reviews` domain (no new domain).**
  - Cons: the wordlist + audit will be reused by complaints / KOL notes;
    embedding it in reviews would force cross-domain reach-ins later. Rejected
    in favour of a dedicated domain (D2).
- **A7: Enforce via a Zod `.refine()` in the presentation layer.**
  - Cons: puts business policy in presentation (rule 30 violation) and couples
    the rule to the HTTP edge. The authoritative check belongs in the use case.
    Rejected.
- **A8: Add a PII-of-others category in layer 1.**
  - Pros: prevents doxxing third parties on-chain.
  - Cons: high false-positive risk (legitimate account/case numbers), needs
    careful tuning; owner did not select it for v1. Deferred to a follow-up.

## Consequences

### Positive

- Prohibited content can never be anchored — the one-shot irreversibility
  problem is closed at the only safe point.
- Content-neutrality + full audit trail keep the moderation lever from becoming
  a censorship vector, protecting the core promise.
- Shared pure engine → identical client/server logic, high unit-test coverage,
  reusable by complaints / notes later.
- Establishes the project's first audit-log pattern for future admin actions.

### Negative / Trade-offs

- Introduces the project's first admin-editable control that _could_ in
  principle be abused; mitigated by mandatory audit + rule 52, not eliminated.
- A new domain, two DB tables + migration, and a console surface to build,
  test, and maintain.
- The wordlist is never "complete": Cantonese profanity and evolving
  solicitation phrasing need ongoing native-speaker curation (rule 51 culture
  note). The `BASELINE` ships a usable starter set, not a finished list.
- False positives are possible (e.g. compact-normalisation catching embedded
  substrings); mitigated by guard tests and tunable terms.

### Neutral

- Client-side mirror uses only `BASELINE`, so it can diverge from the full DB
  list; this is acceptable because the server is authoritative.
- Layer 2 (post-publication label-not-delete) and a public audit view are
  deferred but remain within this moderation theme.

## Implementation Notes

Delivered in two phases with a handoff between them (rule 96 / 98).

**DB shape (Phase A):**

```prisma
enum ModerationCategory { PROFANITY ATTACK CONTACT ILLEGAL }

model ModerationTerm {
  id              String             @id @default(uuid()) @db.Uuid
  tenantId        String             @db.Uuid
  category        ModerationCategory
  term            String
  isRegex         Boolean            @default(false)
  enabled         Boolean            @default(true)
  note            String?
  createdByUserId String?            @db.Uuid
  createdAt       DateTime           @default(now())
  updatedAt       DateTime           @updatedAt
  deletedAt       DateTime?
  @@index([tenantId, enabled, category])
  @@map("moderation_terms")
}

model ModerationTermAudit {
  id          String   @id @default(uuid()) @db.Uuid
  tenantId    String   @db.Uuid
  termId      String   @db.Uuid
  action      String   // CREATE | UPDATE | ENABLE | DISABLE | DELETE
  beforeJson  Json?
  afterJson   Json?
  actorUserId String?  @db.Uuid
  reason      String?
  createdAt   DateTime @default(now())
  @@index([tenantId, termId, createdAt])
  @@map("moderation_term_audits")
}
```

- **Phase A (pre-publication gate):** DB schema + migration; `packages/shared`
  `moderateContent(text, terms)` + `BASELINE_MODERATION_TERMS` + tests;
  `moderation` API domain (repo + cached provider + `ContentModeratorAdapter`,
  seed baseline); `ErrorCode.CONTENT_REJECTED` (422) wired into
  `SubmitReviewUseCase` via `IContentModerator`; `ReviewForm` baseline mirror +
  three-locale i18n (`errors.code.CONTENT_REJECTED`, `errors.reason.content_rejected`).
  Then a full session handoff (rule 98).
- **Phase B (admin management, new session):** `/v1/admin/moderation/terms`
  CRUD with audit-on-write; console `admin/moderation` page; three-locale i18n.
- **Follow-up (not scheduled):** apply the same gate to complaints submit +
  broker-response; PII category (A8); layer-2 post-publication labelling; public
  audit view.

## References

- [ADR-0019](./0019-review-registry-contract-design.md) — on-chain review anchor (irreversibility)
- [ADR-0006](./0006-ddd-modular-monolith.md) — DDD domain layering + outbox
- [ADR-0029](./0029-complaints-vs-reviews-separation.md) — `Review.kind`, `adminNote` (future label layer)
- [`STAGING.md`](./STAGING.md) — promoted from staged item S5
- Cursor rules 00 (red lines), 10 (architecture), 20, 30, 50, 51, 60; new rule 52
- `apps/api/src/domains/reviews/application/SubmitReviewUseCase.ts` — gate insertion point
- `apps/api/src/shared/errors/ErrorCode.ts` — `CONTENT_REJECTED`
