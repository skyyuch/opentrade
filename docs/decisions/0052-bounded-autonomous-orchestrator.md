# ADR-0052: Bounded autonomous handoff orchestration via an external Cursor-SDK tool

## Status

Accepted (owner ratified 2026-06-22). Relates rule 96 (task decomposition),
rule 97 (status/ADR discipline), rule 98 (session handoff), rule 70 (branch /
commit / PR), rule 50 (security), rule 00 (red lines). Amends none.

## Date

2026-06-22

## Context

The owner runs OpenTrade as a large project at high quality by decomposing
every requirement into atomic units (rule 96) and handing off to a fresh agent
session at clean boundaries to avoid context overload (rule 98). The handoff
ritual is manual: when a unit finishes, the agent prints a cold-start prompt
and the owner copy-pastes it into a brand-new chat. This forces the owner to
sit at the keyboard babysitting an otherwise self-directed pipeline.

The desired outcome is to automate the handoff loop — and the mid-task
clarification questions a fresh agent often asks — without weakening any of the
quality or safety disciplines that make the manual flow trustworthy.

A key framing correction: the OpenTrade handoff is **"the same role restarting
with fresh context"**, not multi-role orchestration (PM → Coder → QA). The
project's intelligence lives in its own `.cursor/rules` (20 rules) + `AGENTS.md`

- `docs/03-status.md`. Any automation must preserve that, not replace it.

## Decision

### D1. The orchestrator is an external, project-agnostic tool — zero product-repo footprint

The orchestrator (`cursor-conductor`) lives in its **own git repo outside**
OpenTrade and points at a target project via `--project <path>`. It drives
agents through the **Cursor SDK** (`@cursor/sdk`, local runtime): each unit is
a fresh `Agent.create` run with `settingSources: ["all"]`, so Cursor
auto-loads the **target project's** rules and `AGENTS.md` from its `cwd`.

OpenTrade's only footprint is **this ADR** (docs). No code, no dependency, no
`.env` key, no config is added to the product repo. All runtime state
(`handoff.json`, run logs) lives in the conductor's own state directory keyed
by project path. The tool is reusable on any future project unchanged.

### D2. Bounded autonomy — a hard fence aligned to OpenTrade's rules

The loop runs **inside a fence**; it executes already-decomposed, already-
decided work, never invents architecture:

- Runs **only on a `feature/*` branch**; refuses `main`/`master` (rule 70).
- **Never merges, never pushes to main, never force-pushes.** On completion it
  pushes the feature branch and opens a **PR for human review** (rule 70/50).
- **Hard-stops and defers to the human** when the next step needs a new ADR or
  architecture decision, or touches `packages/contracts`, security policy
  (`.cursor/rules/50-security.mdc`), `docs/decisions/`, or `infra/terraform/`.
  This is enforced two ways: the agent sets `needsHuman` per its contract, and
  the conductor independently inspects the unit's changed files (defense in
  depth).
- Also stops on: gate failure (after one corrective retry), a unit producing no
  new commit, `--max-iters`, a wall-clock budget, or a Telegram `/stop`.

### D3. Fresh context per unit; clarification questions routed to Telegram, resumed in-context

Each atomic unit gets a **fresh agent** (a genuine handoff per rule 98). When a
unit needs clarification to proceed, the agent must **not guess** and must not
use an interactive UI (there is no human at the screen); it writes structured
`questions` into `handoff.json` and ends the run. The conductor pushes them to
**Telegram** (inline-keyboard for multiple choice, free text otherwise),
blocks on long-poll for the answer, then **resumes the SAME agent** with the
answer so the unit continues with its working context intact. "Decision-level"
questions still hard-stop (D2); "clarification-level" questions unblock from the
phone.

### D4. Deterministic gate as defense-in-depth, on top of existing hooks

Before continuing past a unit, the conductor runs the project's own checks as a
configurable gate (default `pnpm typecheck`, `pnpm lint`) and verifies a new
commit exists. This is additive to husky pre-commit/pre-push hooks and to the
rules the agent already obeys — three independent layers, not a replacement.

### D5. Starting a run is the consent rule 98 requires; it does not authorize decisions

Rule 98 mandates human consent before commit/handoff. Launching a bounded run
**is** that consent, scoped by the fence. It explicitly does **not** authorize
the agent to make architecture/ADR decisions or cross any red line (rule 00) —
those remain human, surfaced via D2/D3. No red line is relaxed by this ADR.

## Alternatives Considered

- **A1: LangGraph / CrewAI multi-agent state machine (the suggestion that
  prompted this).** Rejected. It solves multi-role orchestration, not
  context-reset handoff; it calls raw LLM APIs and would discard `.cursor/rules`
  - `AGENTS.md` + the Cursor harness (the source of the project's quality), and
    its in-process state does not give the fresh context a new session does. High
    cost, wrong problem.
- **A2: Put the orchestrator inside OpenTrade (`tools/orchestrator/`).**
  Rejected. Couples a meta dev-tool to the product repo, would be re-copied per
  project, and pulls product rules/CI over a non-product concern. The owner
  explicitly chose to keep the product repo clean (D1).
- **A3: Cursor `stop`-hook self-continuation in the same session.** Rejected.
  The same session accumulates context, which defeats the very reason the
  handoff exists (rule 98).
- **A4: Full autonomy including auto-merge / cross-phase / self-made
  architecture decisions.** Rejected — directly violates rule 70 (PR review),
  rule 50 (sensitive review), and rule 00 (ADR-gated decisions).
- **A5: Cloud runtime (Cursor-hosted VM).** Deferred. Cloud can run with the
  laptop closed and open PRs, but cannot reach the owner's local `.env`, AWS SSO
  session, or local Postgres, and would need secrets in the cloud. Revisit for
  pure-code tasks; local is the right default now.

## Consequences

### Positive

- The owner stops copy-pasting handoff prompts; a bounded run executes a
  pre-decomposed plan unattended and opens a PR at the end.
- Mid-task questions are answerable from the phone (Telegram), so the owner is
  not pinned to the keyboard for routine clarifications.
- The product repo stays clean; the tool is reusable across projects.
- The fence + gate + existing hooks make unattended runs safe by construction:
  the worst case is a feature branch + an unmerged PR awaiting review.

### Negative / Trade-offs

- A new external moving part (the conductor) to maintain, plus two secrets
  (`CURSOR_API_KEY`, Telegram bot token) in the conductor's local `.env`.
- The SDK runs agents headless: no live IDE affordances, and the agent must
  follow the injected contract (write `handoff.json`, ask via the file) — a
  weaker channel than interactive use, mitigated by the deterministic gate.
- SDK agent runs consume Cursor usage/credits per unit.

### Neutral

- Each project tunes its own `--gate` commands; nothing here is OpenTrade-
  specific.
- `docs/03-status.md` is large; every cold start re-reads it. Optimizing that
  (passing a focused task pointer) is a separate, project-side follow-up.

## Implementation Notes

The conductor is built and typechecks at `~/dev/cursor-conductor` (separate
repo): `@cursor/sdk` loop + per-project config/state + deterministic gate +
file-based safety fence + Telegram bridge + PR-on-done. Within OpenTrade, the
only artifacts are this ADR, the index row, and the status entry. No OpenTrade
code/deps/secrets are added. Owner ratified 2026-06-22 (Status → Accepted).

## References

- `.cursor/rules/96-task-decomposition.mdc` — atomic units the loop consumes
- `.cursor/rules/98-session-handoff.mdc` — the handoff this automates
- `.cursor/rules/97-status-update.mdc` — status/ADR discipline
- `.cursor/rules/70-commit-pr.mdc` — branch / PR rules the fence enforces
- `.cursor/rules/50-security.mdc`, `.cursor/rules/00-project-overview.mdc` — red lines
- Cursor SDK — https://cursor.com/docs/sdk/typescript
