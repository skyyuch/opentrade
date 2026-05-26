# ADR Staging — Deferred decisions awaiting trigger

> Decisions surfaced by team discussions or external pressure that have
> a clear ADR-shaped destination but are not yet ready to be ratified.
> Each row pins the trigger condition, the eventual ADR number, and the
> relationship with existing ADRs.

This index is a planning aid, not a commitment. A staged item only
becomes a real ADR when its trigger fires and a draft author writes the
proper `decisions/NNNN-...md` file following the format in
[`README.md`](./README.md). Until then, the row below is the canonical
"why is there no ADR for X yet" reference.

When a staged ADR is published, move the row out of this file, update
the index in `README.md`, and link the source conversation archive.

---

## Currently staged (post 2026-05-25 meeting)

| Stage # | Eventual ADR | Title (working)                                                     | Trigger                                                                             | Conflicts with                                                               | Priority                                 |
| ------- | ------------ | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------- |
| S1      | ADR-0030     | Token Economy: introduce platform token for B-side loyalty program  | Phase 5+ business validation or first concrete VATP-compliant scheme proposal       | Supersedes [ADR-0007](./0007-no-token-in-v1.md)                              | Low (Pitch narrative only until trigger) |
| ~~S2~~  | ~~ADR-0031~~ | ~~iAM Smart (智方便) integration~~                                  | ~~Promoted to Phase 2 per ADR-0036 D2~~                                             | → Published: [ADR-0031](./0031-iam-smart-identity-provider.md)               | ~~Done~~                                 |
| S3      | ADR-0032     | HKMA Sandbox via HKSTP — budget + timeline                          | Q3 2026 grant application formally submitted; CCMF acceptance + business plan stage | Touches [ADR-0002](./0002-aws-stack.md) budget envelope                      | Medium (Q3 deadline)                     |
| ~~S4~~  | ~~ADR-0033~~ | ~~Public broker response mechanism (Porto 聲明窗口)~~               | ~~M10 商戶功能 Phase 2.5 implementation kickoff~~                                   | → Folded into [ADR-0037](./0037-merchant-phase-2-5-broker-response.md) D1-D3 | ~~Done (absorbed by S8)~~                |
| S5      | ADR-0034     | Content moderation: hate speech filter + label-not-delete two-layer | First moderation incident in production OR pre-Phase 2 launch hardening             | Touches rule 00 红线 strictly; needs new rule 52                             | Medium (pre-Phase 2 must-have)           |
| S6      | ADR-0035     | Vision narrative upgrade — Embrace Regulation positioning           | M13 vision/roadmap update milestone                                                 | Amends `docs/00-vision.md` §五                                               | High (6/20 Pitch Deck dependency)        |
| ~~S7~~  | ~~ADR-0036~~ | ~~KOL signal architecture (Phase 2)~~                               | ~~M8 KOL ADR drafting kickoff~~                                                     | → Published: [ADR-0036](./0036-kol-signal-architecture.md)                   | ~~Done~~                                 |
| ~~S8~~  | ~~ADR-0037~~ | ~~Merchant editable scope + ad isolation (Phase 2.5)~~              | ~~M10 商戶功能 Phase 2.5 implementation kickoff~~                                   | → Published: [ADR-0037](./0037-merchant-phase-2-5-broker-response.md)        | ~~Done~~                                 |

Notes on the table columns:

- **Trigger** is the _minimum_ condition for promoting the row to a real ADR. Earlier promotion is allowed if the project owner declares a strategic need.
- **Conflicts with** distinguishes "supersedes" (must change the older ADR's status) from "coexists" (both stay Accepted) from "amends" (extends without invalidating).
- **Priority** orders work within the next phase but is not a strict scheduling commitment.

---

## Why these are staged, not written today

Each row passes one or more of the following filters:

1. **Strategic-but-not-implementation-ready**. S1 (Token Economy) is on the Pitch narrative critical path but the code-side decision needs Phase 5+ business data + VATP regulatory clarity before being binding. Writing the ADR today would either be too vague to be useful or too specific to survive contact with the regulator.
2. ~~**Blocked on infrastructure not yet built**. S2 (iAM Smart) — promoted to Phase 2 per ADR-0036 D2; published as [ADR-0031](./0031-iam-smart-identity-provider.md).~~
3. **Blocked on external timing**. S3 (HKMA Sandbox) is blocked on the grant application being formally filed.
4. ~~**Implementation-bundled**. S4 (broker response) and S8 (merchant scope) are most coherent as one ADR if M10 ships them together; we will collapse S4 into S8's body unless M10 splits them.~~ Done: S4 absorbed into S8 → published as [ADR-0037](./0037-merchant-phase-2-5-broker-response.md).
5. **Pre-launch hardening not yet hot**. S5 (moderation) is fine to write reactively to the first real incident; a hypothetical ADR written too early risks being prescriptive about cases that never materialise.
6. **Vision-narrative-only-for-now**. S6 (Embrace Regulation) is properly a vision-document amendment first and an ADR second; M13 ships both together.
7. ~~**Implementation-imminent**. S7 (KOL) — published as [ADR-0036](./0036-kol-signal-architecture.md).~~ ~~S8 (Merchant) is the next implementation milestone; its ADR lands in M10 ahead of any code.~~ Done: published as [ADR-0037](./0037-merchant-phase-2-5-broker-response.md).

---

## How to promote a staged ADR

1. Confirm the trigger condition has fired (or get explicit project-owner consent to promote early).
2. Pick the eventual ADR number (the table reserves them; do not reuse).
3. Author the full ADR in `decisions/NNNN-kebab-case-title.md` following the format in [`README.md`](./README.md).
4. If the new ADR supersedes an existing Accepted ADR, edit the old ADR's `Status:` line per the rules in `README.md`.
5. Add the new ADR to the `已有 ADR 列表` table in `README.md`.
6. Delete the corresponding row from this file.
7. Link the new ADR back to the conversation archive that originally surfaced the need.

---

## References

- ADR format and lifecycle: [`README.md`](./README.md)
- Source conversation: [`docs/conversations/2026-05-25-team-meeting-strategy.md`](../conversations/2026-05-25-team-meeting-strategy.md) §「會議結論與既有設計衝突的 6 項」
- Cursor rule 97 — status update + ADR discipline
