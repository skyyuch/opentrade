# ADR-0055: Telegram-driven spec/ADR drafting then owner ratification before grind (amends ADR-0052)

## Status

Accepted (owner ratified 2026-06-22). Amends [ADR-0052](./0052-bounded-autonomous-orchestrator.md) (extends D2/D3 fence). Relates rule 96 (task decomposition), rule 97 (status/ADR discipline), rule 98 (session handoff), rule 70 (branch/commit/PR), rule 50 (security), rule 00 (red lines + owner ratifies ADRs).

## Date

2026-06-22

## Context

ADR-0052 gave the `cursor-conductor` a bounded autonomy loop that **executes already-decomposed, already-decided** atomic units and routes mid-task **clarification** questions to Telegram (D3), but **hard-stops on any decision-level / architecture work** (D2): a fresh requirement with no ADR cannot be started by the conductor at all.

The owner wants to point the conductor at a **large, under-specified requirement** (e.g. the items in `docs/05-feature-backlog.md`: 券商比較 / 報價 / 新聞) and have it **define the requirement through Telegram Q&A** — answering design questions from the phone — rather than first sitting at the keyboard to write an ADR and decompose by hand.

The tension: rule 00 requires the **owner to ratify** every architecture decision, and rule 97 requires that decision to live as a **written, cross-referenced ADR** (the project's durable intelligence that makes every future agent competent). Defining a requirement purely as an ephemeral Telegram thread would trade that durable asset for chat history, and a red-line (rule 00: no paid ranking / no total-score / no investment advice / no on-chain mutation / no review deletion) could be crossed by a single careless tap.

This ADR resolves the tension by moving the **drafting** of a spec into the conductor loop (Telegram-driven) while keeping **ratification** an explicit human gate and keeping every red line / sensitive zone a hard-stop.

## Decision

### D1. New unit type — a "spec unit" that drafts an ADR, never product code

The conductor may accept a large/under-specified requirement and run a **spec unit first** (a fresh agent per rule 98). Its sole job:

1. Read the target repo + `.cursor/rules` + `AGENTS.md` + `docs/03-status.md`.
2. Ask the owner the open **requirement/design questions over Telegram** (the D3 channel: inline-keyboard for choices, free text otherwise).
3. Crystallise the answers into a **draft ADR** (`Status: Proposed`) committed to `docs/decisions/NNNN-*.md` on the feature branch, **plus** an atomic-unit decomposition (rule 96) recorded for the subsequent grind.

A spec unit **must not write product code** (no `apps/**`, `packages/**` source, no migrations). It writes only `docs/decisions/**` (+ optionally a plan/todo artifact). The conductor enforces this by file-path inspection (defense in depth, mirroring ADR-0052 D2).

### D2. Ratification gate — execution is blocked until the owner ratifies

After the spec unit, the conductor **hard-stops**. **No execution unit runs** until the draft ADR's `Status` flips `Proposed → Accepted` on the branch. Ratification is an **explicit human action**:

- For ADRs that touch **no red line and no sensitive zone** (see D3), ratification **may** be given via a Telegram **approve** of the committed draft (the owner attests they read the branch's ADR file), which the conductor records by flipping the Status line and continuing.
- For ADRs that touch a **red line or the sensitive zone**, ratification **requires keyboard action** (owner edits Status in the IDE); a Telegram tap is insufficient.

This preserves rule 00 ("owner ratifies ADRs") and rule 97 (the decision lands as a written ADR), regardless of how the questions were answered.

### D3. What Telegram may decide vs what still hard-stops

**May be decided via Telegram and captured in the draft ADR** (clarification + bounded design choices): scope, compared fields, UI variant, endpoint shape, copy, ordering of non-ranking lists — anything that (a) lands in the written draft ADR and (b) crosses no red line and touches no sensitive zone.

**Never decided by a Telegram tap; always hard-stops for the human** (unchanged from ADR-0052 D2):

- **rule 00 red lines** — no merchant-paid ranking, no total-score ranking, no investment advice, no owner-mutation of on-chain data, no review deletion. The draft ADR may **document** that a red line constrains the design, but the conductor can **never waive** one.
- **Sensitive zone** — any unit touching `packages/contracts`, security policy (`.cursor/rules/50-security.mdc`), or `infra/terraform/`.

### D4. Everything else in ADR-0052 is unchanged

The grind that follows ratification is bounded exactly as ADR-0052 D2/D4: `feature/*` branch only, never merges / never pushes to main / never force-pushes, deterministic gate (`pnpm typecheck` / `pnpm lint`) + new-commit check, PR-on-done for human review (rule 70/50 + ADR-0054 admin-merge stays a human action). The only addition is the `spec → ratify → grind` prologue.

### D5. Tool-side prerequisite (external repo)

This ADR authorises the flow; the `cursor-conductor` repo must implement the spec-unit mode, the ratification gate (block until Status=Accepted on branch or a recorded TG ratify), and the spec-unit file-path fence. No OpenTrade code/deps/secrets are added — the only OpenTrade footprint is this ADR (consistent with ADR-0052 D1).

## Alternatives Considered

- **A1: Keep ADR-0052 as-is (all decision-level work hard-stops; owner hand-writes the ADR in the IDE).** Rejected — defeats the owner's goal of phone-driven requirement definition; the Telegram clarification channel already exists (D3), so extending it to drafting is the natural step **without** losing the written ADR.
- **A2: Let the conductor make architecture decisions autonomously (no ratification gate).** Rejected — violates rule 00 (owner ratifies), rule 97 (ADR discipline), and risks crossing a red line unattended.
- **A3: Define requirements purely in Telegram threads, no written ADR.** Rejected — trades the project's durable doc intelligence (rule 97) for ephemeral chat; future cold-start agents lose the context that makes them competent.
- **A4: Auto-flip `Proposed → Accepted` with no human approve at all.** Rejected — same failure as A2; ratification must be a human act. A4's milder form (TG approve counts as ratification) is adopted **only** for non-red-line, non-sensitive ADRs (D2).
- **A5: A spec unit that also writes product code in the same run.** Rejected — couples undecided design with implementation; keeping the spec unit code-free preserves the ratification gate's meaning (you ratify a spec, not a fait-accompli diff).

## Consequences

### Positive

- One entry point: the owner can hand the conductor a large requirement and define it from the phone via Telegram, instead of keyboard-authoring the ADR + decomposition.
- The decision still lands as a **written, ratified ADR** in the repo — rule 97 intact, future agents stay competent.
- Red lines and the contracts/security/infra zone remain hard-stops; the worst unattended case is still only a feature branch + a `Proposed` ADR awaiting the owner.

### Negative / Trade-offs

- Defining a vague requirement may take many Telegram round-trips; a headless agent drafting an ADR can produce a weaker draft than an interactive session — mitigated by the mandatory owner ratification + PR review.
- A rejected spec leaves a `Proposed` ADR commit on the branch; the owner abandons it by dropping the branch or marking the ADR `Superseded`/abandoned with a note (no dangling `Accepted` ADR is ever produced automatically).
- Requires building new capability in the external conductor (spec-unit + ratification gate); until then this flow is authorised but not yet runnable.

### Neutral

- Nothing here is OpenTrade-specific; any project reusing the conductor gets the same `spec → ratify → grind` option.
- The `docs/03-status.md` cold-start cost noted in ADR-0052 (Neutral) is unchanged.

## Implementation Notes

- OpenTrade footprint: this ADR only (no code/deps/secrets), consistent with ADR-0052 D1.
- Conductor (external `~/dev/cursor-conductor`) follow-ups: (1) spec-unit run mode that drafts a `Proposed` ADR + decomposition and ends; (2) ratification gate that refuses to start execution units until the branch ADR is `Accepted` (or a recorded TG ratify for non-sensitive ADRs); (3) extend the file-path fence so a spec unit may write only `docs/decisions/**`.
- Suggested pilot once the conductor supports it: 券商比較 from `docs/05-feature-backlog.md` (fence-safe execution after the spec is ratified). 陪審團/投訴仲裁 stays human-led (contracts + security hard-stop zone).

## References

- [ADR-0052](./0052-bounded-autonomous-orchestrator.md) — the bounded orchestrator this amends
- [ADR-0054](./0054-solo-stage-admin-merge.md) — admin-merge stays a human action after PR-on-done
- `docs/05-feature-backlog.md` — the requirement backlog this flow would consume
- `.cursor/rules/96-task-decomposition.mdc`, `.cursor/rules/97-status-update.mdc`, `.cursor/rules/98-session-handoff.mdc`, `.cursor/rules/00-project-overview.mdc`, `.cursor/rules/50-security.mdc`, `.cursor/rules/70-commit-pr.mdc`
- Cursor SDK — https://cursor.com/docs/sdk/typescript
