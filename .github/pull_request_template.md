<!--
  OpenTrade — Pull Request template per .cursor/rules/70-commit-pr.mdc.
  Fill every section. If a section truly does not apply, write "N/A"
  and a one-line reason — do not delete the heading.
-->

## What

<!-- 1-3 sentences. Imperative present tense, like a commit subject. -->

## Why

<!--
  Reference the ADR / status entry / open issue that triggered this PR.
  If this introduces a new red line or relaxes an existing one, link
  the ADR that ratifies the change.
-->

## How

<!--
  Brief design notes. Anything a reviewer would otherwise have to
  reconstruct from the diff. Skip the obvious.
-->

## Tests

<!--
  - Unit tests added/changed? Coverage delta?
  - Integration tests touched? Which envs?
  - Manual smoke steps if no automated test exists.
-->

## Checklist

<!-- Tick before requesting review. Untrue boxes block merge. -->

- [ ] Follows the relevant ADR (or this PR creates one)
- [ ] `docs/03-status.md` updated if Phase / commit / decision moved
- [ ] Docs updated where applicable (README, glossary, ADR cross-links)
- [ ] `.cursor/rules/` reviewed per rule 99 — listed deltas (or "no changes")
- [ ] `pnpm lint / typecheck / format:check / test:unit` pass locally
- [ ] If touched `infra/terraform/`: `terraform fmt -check -recursive` +
      `terraform validate` pass; `.terraform.lock.hcl` regenerated if
      `versions.tf` changed (per rule 81)
- [ ] If touched `packages/contracts/`: `forge build / test / fmt --check`
      pass; solhint clean (warnings OK per ADR-0015 D5)
- [ ] No secret, private key, `.env*` (except `.env.example`), or
      access key in the diff (rule 50 + rule 70)
- [ ] Commit messages follow Conventional Commits (rule 70 scope-enum)

## Refs

<!-- One per line. Delete blank lines if none. -->

- ADR-
- Closes #
- Related #
