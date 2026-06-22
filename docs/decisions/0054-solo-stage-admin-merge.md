# ADR-0054: Solo-stage self-review with admin merge (clarifies rule 70 review requirement)

## Status

Accepted (owner ratified 2026-06-22). Clarifies [rule 70](../../.cursor/rules/70-commit-pr.mdc).
Relates ADR-0047 (branch protection / OIDC deploy), ADR-0052 (conductor never
merges). Sunsets when a second human reviewer joins (see D3).

## Date

2026-06-22

## Context

Rule 70 mandates that every PR gets **at least one reviewer** (two for
security/contracts) and lists **"跳過 review 自己 merge"** in its forbidden list
(carving out only emergency hotfixes, which require a follow-up ADR). GitHub
branch protection enforces this with a required-review gate.

OpenTrade is, at this phase, a **solo-owner project**: the only human is the
project owner, and all code is produced by AI agent sessions the owner drives.
There is **no second human** who can satisfy the required-review gate. The gate
therefore reports `mergeStateStatus=BLOCKED` even on PRs whose CI is fully
green, making _no_ PR mergeable through the normal path.

This surfaced concretely on 2026-06-22 while reconciling a four-PR chain
(#44 CI fix → #40 migrate gate → #45 conductor docs → #42 KOL category): every
PR was green but BLOCKED on the unfillable review requirement. The owner
authorized `gh pr merge --squash --admin` to bypass the review gate on green
CI. The practice worked, but it directly contradicts rule 70's forbidden list,
leaving rules and reality out of sync. This ADR records the policy so the two
align, and pins the exact conditions under which the bypass is allowed.

## Decision

### D1: Solo-stage owner authorization satisfies the rule-70 reviewer requirement

While the project is **solo-stage** (no second human contributor), the
mandatory-reviewer requirement in rule 70 is considered satisfied by the
**owner's explicit merge authorization**. The owner may merge a PR with
`gh pr merge --squash --admin` to clear the branch-protection review gate.

### D2: Hard conditions that still hold (no weakening of other gates)

The bypass applies **only** to the _human-reviewer_ gate. All other rule-70
disciplines remain in force:

- **CI must be green.** Never `--admin`-merge a PR with any failing required
  check (rule 70 "跳過 CI 直接 merge" stays forbidden).
- **Squash-merge only**; never a merge commit (rule 70 Merge 策略).
- **Never force-push `main`**; never bypass on `contracts`/security/`infra`
  changes without the owner's deliberate, change-specific review (those remain
  high-scrutiny per rule 50 / 41 / 81).
- **The AI agent never decides to `--admin`-merge on its own.** It requires
  per-occurrence or standing owner authorization in the session. This preserves
  ADR-0052 D2 (the conductor _never_ merges; merge is always a human action).

### D3: Sunset when a second reviewer exists

When a second human reviewer joins (team growth, advisor, or Phase 4+ per
ADR-0016), this exception **sunsets**: rule 70's ≥1-reviewer (≥2 for
security/contracts) requirement is re-enforced and branch protection is
satisfied the normal way. A superseding ADR records that transition.

## Alternatives Considered

- **A1: Keep requiring review, never bypass.** Blocks _all_ work indefinitely
  on a solo project. Rejected — makes the project undeliverable.
- **A2: Remove branch protection entirely.** Would also drop the _CI_ gate,
  which we explicitly want to keep (D2). Rejected — throws out the valuable gate
  with the unfillable one.
- **A3: Self-approve via a second GitHub account.** Manufactures a fake
  "review" — dishonest and provides no real second pair of eyes. Rejected.
- **A4: Lower the required-approvals setting to 0 in branch protection.** Hides
  the intent in GitHub settings rather than in version-controlled policy, and
  silently drops the requirement for future contributors. Rejected in favour of
  an explicit, documented, sunsetting exception.

## Consequences

### Positive

- Rules and reality align: the practice the owner already uses is now the
  documented policy, not a silent rule violation.
- Work is unblocked while the project is solo, without throwing away the CI gate.
- The bypass is **narrow and conditional** (green CI, squash, no sensitive-area
  free pass, owner-authorized) and **self-sunsetting**.

### Negative / Trade-offs

- Single point of judgment: the owner is the only safety net for what merges.
  Mitigated by D2 (CI still gates) and the high-scrutiny carve-out for
  sensitive areas.
- Requires discipline to **remember to sunset** when a reviewer joins
  (tracked by D3 + the superseding-ADR convention).

## Implementation Notes

- Update `rule 70` 嚴禁 clause "跳過 review 自己 merge" to reference this ADR's
  solo-stage exception, and add a note under "Review 要求".
- No code change. Branch-protection settings are left as-is (the review gate
  stays defined; the owner clears it with `--admin` per D1).

## References

- [Rule 70 — Git, Commit & PR Standards](../../.cursor/rules/70-commit-pr.mdc)
- ADR-0047 — GitHub OIDC deploy pipeline / branch posture
- ADR-0052 — bounded autonomous orchestrator (conductor never merges; merge is a human action)
- ADR-0016 — AWS account architecture (Phase 4+ team/role growth, the sunset trigger)
