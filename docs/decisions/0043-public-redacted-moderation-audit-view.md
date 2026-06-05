# ADR-0043: Public, redacted moderation audit view (transparency follow-up to ADR-0034)

## Status

Accepted

## Date

2026-06-05

## Context

[ADR-0034](./0034-content-moderation.md) introduced the project's first
admin-editable control: a moderation blocklist that operators manage from the
console, where every mutation (CREATE / UPDATE / ENABLE / DISABLE / DELETE)
writes an append-only `ModerationTermAudit` row **in the same transaction** as
the change (D3). ADR-0034 deliberately left "a future public-facing audit view
(transparency)" as a noted, unscheduled follow-up.

This matters because the blocklist is the one lever on the platform that could,
in principle, be abused into a censorship tool — the exact WikiFX behaviour
OpenTrade exists to abolish (rule 00 red lines). ADR-0034 mitigated this with a
mandatory, immutable audit trail and rule 52, but until now that trail was
**admin-only** (`GET /v1/admin/moderation/terms/:id/audits`). The public has no
way to verify that the platform is moderating fairly and content-neutrally.

The hard constraint is a genuine conflict between two project values:

1. **Transparency** ("公開") — prove the moderation lever is not abused.
2. **Not leaking the blocklist** — the audit snapshots (`beforeJson` /
   `afterJson`) contain the term text itself, including CONTACT-category
   regexes used to catch off-platform solicitation. Publishing the raw terms
   would hand bad actors the exact patterns to rephrase around, defeating the
   gate. This also echoes ADR-0034 D6 / rule 50 ("logs never carry the matched
   substrings", because CONTACT entries can resemble phone numbers / PII).

The project owner selected the redacted approach (option A below).

## Decision

### D1: Add a public, **redacted** moderation audit endpoint

A new public (no-auth) endpoint `GET /v1/moderation/audit` returns the tenant's
moderation-change history, newest first, cursor-paginated. Each entry exposes
**only**:

- `id` — the audit row id
- `termId` — the affected term's id (an opaque UUID; lets readers see that a
  single term was changed multiple times without revealing what it is)
- `action` — `CREATE | UPDATE | ENABLE | DISABLE | DELETE`
- `category` — `PROFANITY | ATTACK | CONTACT | ILLEGAL` (derived from the audit
  snapshot)
- `actor` — a **coarse role label** (`admin` when an actor id is present,
  `system` otherwise), never the actor's user id
- `reason` — the operator-authored justification (free text)
- `createdAt` — ISO timestamp

It **never** exposes: the `term` text, `isRegex`, `note`, the raw
`beforeJson` / `afterJson` snapshots, or the `actorUserId`.

This proves _that_ moderation happened, _what category_, _when_, _by an admin_,
and _why_ — without publishing the blocklist itself.

### D2: `reason` is a public field; operators must not put term text or PII in it

Because `reason` is now publicly visible, operators MUST NOT write the term
text, a third party's PII, or any matched substring into it. This is codified
in rule 52. The admin UI's reason prompts should reflect this. (The field stays
optional; an empty reason is acceptable.)

### D3: Redaction lives in the application layer, not the presentation layer

A dedicated `PublicModerationAuditService` (moderation application layer) maps
the raw `ModerationTermAuditRecord` to the redacted public DTO and derives
`category` from the snapshot. The presentation layer only does HTTP/zod. This
keeps the redaction policy in one auditable place (rule 30) rather than spread
across route handlers, and makes the "no term leakage" guarantee unit-testable
without HTTP.

### D4: The admin per-term audit endpoint is unchanged

`GET /v1/admin/moderation/terms/:id/audits` (admin-only) still returns the full,
un-redacted snapshots — operators legitimately need to see the term text. Only
the new public surface is redacted.

## Alternatives Considered

- **A (chosen): Redacted public view.** Exposes action/category/actor-role/
  reason/timestamp, not the term text.
  - Pros: satisfies the transparency promise; does not hand the blocklist to
    evaders; consistent with ADR-0034 D6 / rule 50.
  - Cons: a determined skeptic cannot independently verify _which exact words_
    are blocked, only that moderation is content-category-bounded and audited.
- **B: Fully public view (raw terms included).**
  - Pros: maximal transparency; anyone can audit the literal wordlist.
  - Cons: publishes the CONTACT regexes and the whole blocklist, letting
    solicitors/spammers rephrase around it; weakens the gate; conflicts with
    rule 50's "never surface matched substrings" posture. Rejected by the owner.
- **C: No public view (status quo — admin-only audit).**
  - Pros: zero leakage risk; least work.
  - Cons: forgoes the strongest external proof that the moderation lever is not
    a censorship tool — the entire reason the audit trail exists. Rejected.
- **D: Publish term _hashes_ instead of text.**
  - Pros: lets a reader who already guesses a term confirm it; no plaintext.
  - Cons: hashes of short tokens are trivially brute-forced (a dictionary of
    profanity/handles is tiny), so it leaks almost as much as plaintext while
    adding complexity and a false sense of privacy. Rejected.

## Consequences

### Positive

- External, machine-readable proof that moderation is content-category-bounded,
  attributable, and immutable — directly supports the "公平、公開、不可篡改"
  positioning for grant / investor due diligence.
- Redaction policy centralised in one service + covered by a leakage guard
  test, so a future refactor cannot silently start exposing term text.
- Reuses the existing append-only audit table; no schema change.

### Negative / Trade-offs

- `reason` becomes a public free-text field, creating a (small) operator
  discipline burden (D2) — mitigated by rule 52, not eliminated.
- The public view cannot prove the _exact_ wordlist, only its shape; a maximally
  skeptical observer must trust the category labels.

### Neutral

- The admin per-term audit endpoint and the gate behaviour are unchanged.
- A front-end transparency page that renders this endpoint is a natural next
  step but is not required by this ADR (the endpoint is the verifiable artifact).

## Implementation Notes

- New repo method `listRecentAudits(tenantId, { limit, cursor })` (tenant-wide,
  newest first) on `IModerationTermRepository` + its Prisma implementation.
- New `PublicModerationAuditService` performs the redaction + cursor pagination;
  a shared singleton lives in `moderation/runtime.ts` (reusing the same repo as
  the gate + admin service).
- New public router `moderationPublicRouter` mounted at `/v1/moderation`
  (no `authMiddleware`).
- A unit test asserts the redacted DTO carries **no** `term` / `isRegex` /
  `note` / snapshot / `actorUserId`, and that `category` is derived correctly.
- rule 52 updated with the public-view redaction + `reason`-hygiene discipline;
  rule 99 index reviewed.

## References

- [ADR-0034](./0034-content-moderation.md) — content moderation layer 1; D3
  (audit trail), D6 (never surface matched strings); this ADR implements its
  noted "public audit view" follow-up
- Cursor rules 00 (red lines / transparency), 30 (layering), 50 (privacy /
  never log matched strings), 52 (content moderation)
- `apps/api/src/domains/moderation/` — domain implementing this view
