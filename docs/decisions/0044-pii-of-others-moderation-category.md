# ADR-0044: Add a `PII` (third-party doxxing) category to layer-1 content moderation (amends ADR-0034)

## Status

Accepted

> Amends [ADR-0034](./0034-content-moderation.md) D5 (four → five categories) and
> resolves A8 (PII deferral). ADR-0034 stays `Accepted`; its text is not
> rewritten — this ADR amends it.

## Date

2026-06-05

## Context

[ADR-0034](./0034-content-moderation.md) shipped layer-1 moderation: a
**pre-publication, content-neutral hard gate** that runs in every publishing
use case (`SubmitReviewUseCase`, `SubmitComplaintUseCase`,
`SubmitBrokerResponseUseCase`) **before** any `keccak256` / IPFS pin / DB write /
outbox. On a match it returns HTTP **422 `CONTENT_REJECTED`** with the offending
**category(ies) only** (never the matched substring, rule 50). It blocks **four**
categories: `PROFANITY`, `ATTACK`, `CONTACT`, `ILLEGAL`.

ADR-0034 **A8 deliberately deferred** a PII-of-others category, and **D5**
fixed the count at four, because automatic PII detection carries a high
false-positive risk and the owner did not select it for v1. Rule 52 codifies
the hard line: **a fifth category may not be added without amending ADR-0034 or
writing a superseding ADR.** This ADR is that amendment.

### Why revisit now

Layer 1 is otherwise fully shipped (gate + engine + DB wordlist + immutable
audit + admin CRUD + the public redacted audit view of [ADR-0043](./0043-public-redacted-moderation-audit-view.md)).
The one remaining pre-publication gap is the same one-shot irreversibility
problem ADR-0034 was created to close — only for a different harm:

A user can today publish a review/complaint that **exposes a private third
party's real-world identifiers** (e.g. a Hong Kong ID card number, a residential
address, a named individual's personal details). Once `SubmitReviewUseCase`
anchors it on-chain and pins it to IPFS (ADR-0019), it is **permanently
irreversible** — the no-deletion red line means the platform can never take it
back. That is a permanent, attributable **PDPO (Personal Data (Privacy)
Ordinance) violation** engraved on a platform whose brand is "公平、公開、不可
篡改". The only safe intervention point is **before anchoring** — exactly
ADR-0034 D1's logic.

### The genuine tension (why A8 deferred it)

The hard part is not engineering; the gate infrastructure already exists. It is
a **compliance vs free-speech boundary**:

- **PDPO / anti-doxxing** says: do not let users expose a private individual's
  personal data without consent.
- **OpenTrade's core promise** says: the platform must **always** protect the
  right to **name and criticise** the reviewed entity. Naming a broker
  ("富途客服爛"), a KOL ("XXX 喊單全錯，避雷"), or stating a negative opinion is
  the entire point of the platform and must keep passing the gate (rule 00 /
  rule 52 content-neutrality).

So the new category must target **only a private third party's identifiers**,
and must **never** be triggered by:

1. the **reviewed entity's public business identity** (broker / KOL name, a
   firm's public hotline, a public company registration), nor
2. the **reviewer's own** choice to disclose their own data, nor
3. **negative opinion / criticism** of any kind.

### What is already covered (scoping the genuine net-new gap)

Auditing the existing `BASELINE_MODERATION_TERMS` shows two overlaps that
**narrow** this category's real job:

- `CONTACT` already blocks **phone numbers** (HK 8-digit regex) — as
  off-platform solicitation. A bare phone number is therefore already gated.
- `ILLEGAL` already blocks doxxing **intent words** (`起底`, `人肉搜尋`) — the
  _act being described_, not an actual identifier.

The **genuinely new, currently-ungated** harm is therefore **an actual
third-party private identifier being posted as content** — principally a **HKID
number** (a distinctively-formatted, high-confidence pattern), and secondarily
structured residential-address fragments. This sharp scope keeps the
false-positive surface small and the category label meaningful.

## Decision

> All decisions below are the proposed direction for ratification.

### D1: Add a fifth category `PII` to the layer-1 gate (amends ADR-0034 D5/A8)

Add `PII` to the `ModerationCategory` enum (DB) and to the shared
`MODERATION_CATEGORIES` mirror. The gate behaviour is **identical** to the other
four: pre-publication **hard-block 422 `CONTENT_REJECTED`**, category-only
response, no masking, no warn-only, no human queue (ADR-0034 D4). It applies to
**all** publishing paths automatically because they share the one
`IContentModerator` port + `CachedTermProvider` singleton — no new wiring.

`PII` semantics (for the public audit category label and operator clarity):
**a private third party's personal identifiers exposed as content** — i.e.
_actual_ doxxing data, distinct from `ILLEGAL`'s doxxing _intent words_ and
`CONTACT`'s solicitation phone numbers.

### D2: Scope = third-party private identifiers only (the crux)

The **baseline** `PII` blocklist is deliberately **a single, narrow,
high-confidence pattern** (owner-ratified scope):

- **HKID number** — the distinctive `A123456(7)` shape (one or two leading
  letters, six digits, a check digit in optional brackets). High precision; does
  not collide with brokerage account numbers or order ids.

Structured **residential-address** fragments (e.g. `…座…樓…室` combined with an
estate/street token) are **explicitly NOT in the baseline**: their
false-positive risk is too high to ship as a default. They are left to
**operator-curated terms** (the console wordlist of ADR-0034 Phase B), so a
tenant can add address patterns with an audited reason if a real incident
warrants it — without baking false positives into every deployment.

Explicitly **NOT** in scope (must keep passing the gate):

- the reviewed broker/KOL's **public name** or public business contact;
- the **reviewer's own** identifiers;
- any **opinion / criticism** word (the content-neutral red line).

Phone numbers stay under `CONTACT` (no move); doxxing intent words stay under
`ILLEGAL` (no move). `PII` adds only the _identifier-exposure_ patterns.

### D3: Content-neutrality is re-proven by guard tests (rule 60)

`packages/shared/src/moderation/moderate.test.ts` gains guard cases asserting:

- a review that **names and harshly criticises** a broker/KOL (e.g. "富途 XX
  係騙子，避雷") **passes** (`ok: true`);
- content exposing a **third-party HKID** is **blocked** under `PII`;
- the existing negative-sentiment corpus (騙 / 爛 / 差 / 避雷 / 虧錢 / scam …)
  still **passes** unchanged.

Deleting or weakening these guards is a red-line violation (rule 52).

### D4: Engineering reuse — no new domain, no engine change

The `moderate.ts` engine already supports regex terms (`isRegex: true`, `iu`
flags) and never throws on user input — **no engine change needed**. The work is
purely additive:

- DB: `ALTER TYPE "ModerationCategory" ADD VALUE 'PII'` (additive enum migration,
  rule 31 — no table rewrite; note the Postgres "can't use a new enum value in
  the same transaction" caveat for the migration/seed split).
- `packages/shared`: add `'PII'` to `MODERATION_CATEGORIES`; add a `PII` section
  to `BASELINE_MODERATION_TERMS`.
- i18n: add a `PII` label to the three-locale `moderationCategory` namespace
  (web) **and** to the public transparency page's `moderationAudit` category
  labels (web), plus the console moderation category options.
- The public redacted audit view needs **no change**:
  `PublicModerationAuditService.extractCategory` already validates the category
  against the shared union via `isModerationCategory`, so `PII` flows through
  once added to the union — and term text still never leaves the API
  (ADR-0043 invariant intact).

### D5: rule 52 update

Change rule 52 "四個類別 (v1)" → five categories; **remove** the "`PII-of-others`
為 v1 刻意延後" line; add the D2 boundary ("only third-party private
identifiers; never the reviewed entity's public identity, the reviewer's own
data, or any opinion"); add the `reason`-hygiene reminder that an operator must
not paste a real third-party identifier into an audit `reason` (it is public via
ADR-0043). Rule 99 index reviewed.

## Alternatives Considered

- **A (chosen): narrow regex-based `PII` category in layer 1.**
  - Pros: closes the irreversible third-party-doxxing gap at the only safe
    point; reuses 100% of existing infra; deterministic and client-mirrorable;
    auditable wordlist consistent with ADR-0034's transparency posture.
  - Cons: regex cannot read intent — residual false positives (mitigated by
    narrow HKID-first scope + guard tests + operator-tunable terms).
- **B: keep it deferred; rely on layer-2 post-publication labelling instead.**
  - Cons: the doxxing data is already on-chain and permanent before any label
    can be attached; labelling cannot undo a PDPO exposure. Same logic as
    ADR-0034 A1. Rejected.
- **C: ML / NER-based PII detection.**
  - Pros: higher recall on free-form addresses/names.
  - Cons: heavy, non-deterministic, cannot run as the bundled web client mirror,
    and is opaque — it conflicts with the **auditable, content-neutral wordlist**
    that makes the moderation lever non-abusable. Rejected for v1 (revisit only
    if baseline regex proves insufficient).
- **D: broadly block all ID-like / numeric patterns.**
  - Cons: massive false positives — would block legitimate complaint evidence
    (users citing their _own_ account/order numbers). Rejected; scope to HKID
    shape, not generic digit runs.
- **E: fold the patterns into the existing `CONTACT` or `ILLEGAL` category.**
  - Cons: conflates "solicitation" / "illegal-act words" with "privacy exposure",
    muddying both the operator's mental model and the **public audit category
    label** (ADR-0043 shows the category to the world). A distinct `PII` label is
    clearer and more honest. Rejected.

## Consequences

### Positive

- The last pre-publication irreversibility gap (permanent third-party doxxing /
  PDPO exposure) is closed at the only safe point — completing layer 1.
- Strengthens the PDPO compliance posture (vision §8) with a concrete,
  auditable, content-neutral control.
- Zero new infrastructure: additive enum + baseline terms + i18n + tests; the
  public audit view and all four publishing gates inherit it for free.

### Negative / Trade-offs

- Introduces a new false-positive surface; a legitimate review that happens to
  contain a HKID-shaped string would be blocked pre-publication (user can edit
  and resubmit — no content is silently altered). Mitigated by narrow scope +
  guard tests + operator-tunable terms, not eliminated.
- The category will need ongoing native-speaker / legal curation as doxxing
  patterns evolve (same caveat as ADR-0034 for the other categories).
- Adds operator discipline: a real third-party identifier must never be written
  into a (public) audit `reason`.

### Neutral

- Phone numbers and doxxing intent words keep their current categories; this ADR
  only adds identifier-exposure patterns.
- The baseline list stays a _modest starter_, not a finished list.

## Implementation Notes

Proposed as a small, doc-first-then-code effort (this session writes the ADR
only; code follows on ratification, decomposed per rule 96).

- **DB:** new migration `ALTER TYPE "ModerationCategory" ADD VALUE 'PII';` and
  `schema.prisma` enum comment. Mind the Postgres constraint that a freshly
  added enum value cannot be referenced in the _same_ transaction — keep any
  `PII` seed in a later step than the `ADD VALUE`.
- **`packages/shared/src/moderation/types.ts`:** append `'PII'` to
  `MODERATION_CATEGORIES` (keeps `isModerationCategory`, the union, and the
  public-audit derivation correct everywhere by construction).
- **`packages/shared/src/moderation/baseline.ts`:** add a `// --- PII ---`
  section containing **only** the HKID regex; address fragments are
  operator-managed (console wordlist), **not** baseline.
- **`packages/shared/src/moderation/moderate.test.ts`:** add the D3 guard cases
  (criticism-with-name passes; third-party HKID blocked; negative corpus still
  passes).
- **i18n (web `messages/{zh-Hant,zh-Hans,en}.json`):** add `PII` to
  `reviewCard.moderationCategory` and to the `moderationAudit` category labels;
  **console** moderation category options likewise.
- **No change** to: the engine (`moderate.ts`), the gate wiring, the
  `IContentModerator` port, `PublicModerationAuditService` (category derivation
  is union-driven), or the public endpoint contract.
- **Tests to stay green:** `packages/shared` engine tests, the api moderation
  unit tests, and the public-audit leak-guard test (must still assert no `term`
  / `isRegex` / `note` / snapshot / `actorUserId` leaks).

## References

- [ADR-0034](./0034-content-moderation.md) — layer-1 moderation; **this ADR
  amends D5 (four → five categories) and resolves A8 (PII deferral)**; reuses
  D1 (pre-publication gate), D4 (hard-block), D6 (never surface matched strings)
- [ADR-0043](./0043-public-redacted-moderation-audit-view.md) — public redacted
  audit view; the new category flows through its category derivation unchanged
- [ADR-0019](./0019-review-registry-contract-design.md) — on-chain anchor
  (irreversibility)
- `docs/00-vision.md` §8 — PDPO compliance positioning
- Cursor rules 00 (red lines), 50 (PII / privacy), 52 (content moderation — to
  be updated to five categories), 60 (guard tests), 31 (additive migration)
- `packages/shared/src/moderation/{types,baseline,moderate}.ts`
- `apps/api/src/domains/moderation/application/PublicModerationAuditService.ts`
