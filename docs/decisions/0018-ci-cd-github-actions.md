# ADR-0018: CI/CD GitHub Actions architecture (Phase 0 scope)

## Status

Accepted

## Date

2026-05-21

## Context

Commit number-nine closed the infrastructure provisioning piece of Phase 0:
real VPC, RDS, ECS cluster, ECR, CloudFront, and Secrets slots running in
`opentrade-dev`, costing ~$54/month, governed by Terraform under
ADR-0017. That left exactly one outstanding Phase-0 Definition-of-Done
item per `docs/02-roadmap.md`:

> CI 在 PR 上自動跑

Until that item ships, every `pnpm lint / typecheck / format:check`,
every `forge build / forge test`, and every `terraform fmt -check /
terraform validate` is run **by hand** before each commit. That worked
for nine commits with a single founder iterating quickly, but it does
not survive (a) the first outside contributor, (b) a midnight push to
`main` after a long session where one of the gates was forgotten, or
(c) Renovate / Dependabot PRs that bump a dependency and need an
independent CI signal before merge.

Six interlocking design questions have to be decided together for
Phase 0 CI to be coherent. They are interlocking because each one
constrains the others:

1. **Workflow file layout**. One monolithic `ci.yml` with many jobs,
   or several focused workflow files (`ci.yml`, `contracts.yml`,
   `terraform.yml`)? The path-filter, secret-scope, and runner-time
   trade-offs differ between TS, Solidity, and HCL pipelines.
2. **Node + pnpm bootstrapping**. `pnpm/action-setup` versus
   `actions/setup-node` + Corepack. Both work; they have different
   cache hooks and different failure modes.
3. **Foundry version pin**. ADR-0015 D7 notes that the CI needs to
   pin Foundry to the same `1.7.x` the founder uses locally. CI must
   match exactly — but `foundry-toolchain@v1` with `version: nightly`
   would silently break us. Where do we anchor the pin?
4. **Terraform's chicken-and-egg in CI**. The bootstrap workspace has
   local state and is therefore unrunnable in CI. The environments/dev
   workspace has remote state in S3 — requiring AWS credentials, which
   we deliberately do not give CI in Phase 0 (per ADR-0017 D11 and
   rule 80, GitHub OIDC arrives Phase 4+). How do we run `terraform
validate` against both workspaces without backend access?
5. **CI's relationship with AWS**. The blueprint in rule 70 lists
   "Snyk / Slither / license check / bundle size / E2E" as eventual CI
   gates. Phase 0 cannot afford all of them. Which subset is
   non-negotiable for Phase 0, and which are explicitly deferred?
6. **Dependency-bot posture**. Renovate vs. Dependabot vs. neither;
   how to encode ADR-0013 (pin Prisma 6) and the open question on
   Next 14 → 15/16 (per `docs/03-status.md` open items) so the bot
   does not silently propose a major bump that breaks the project.

This ADR resolves all six together so Commit number-ten, every
subsequent Renovate/Dependabot PR, every contributor PR, and the
Phase-4 OIDC migration plan all pull against the same written-down
ground truth.

## Decision

Eleven coordinated decisions, ratified at the start of Commit number-ten.

### D1. Three independent workflow files: `ci.yml`, `contracts.yml`, `terraform.yml`

```
.github/
├── workflows/
│   ├── ci.yml           ← TS / pnpm / turbo for all 8 packages
│   ├── contracts.yml    ← Foundry for packages/contracts/
│   └── terraform.yml    ← Terraform for infra/terraform/
├── dependabot.yml
├── CODEOWNERS
└── pull_request_template.md
```

Reasons for splitting rather than putting all jobs into one
`ci.yml` with `if:` conditionals:

- **Different runner shapes**. The TS pipeline needs Node 22 +
  pnpm. The Foundry pipeline needs `foundry-toolchain` + submodule
  init. The Terraform pipeline needs `setup-terraform`. Each
  pipeline's setup steps are cleanly orthogonal.
- **Different path filters**. `contracts.yml` runs only when
  `packages/contracts/**` changes (saves ~3 minutes per unrelated PR).
  `terraform.yml` runs only when `infra/terraform/**` changes.
  `ci.yml` runs on every PR because every package's `package.json`
  could affect any package's typecheck.
- **Workflow-level concurrency cancellation** is per-workflow; with
  one mega-workflow a fast `git push --force-with-lease` would cancel
  the still-relevant Foundry job alongside the no-longer-relevant TS
  job.
- **Future OIDC scope-down**. Phase 4+ gives `terraform.yml` an AWS
  OIDC role for `terraform plan`. Keeping it separate means that
  permission grant is narrowly scoped to one workflow, not to every CI
  job in the repo.

### D2. Workflow triggers and concurrency

All three workflows share the same trigger shape and concurrency
contract:

```yaml
on:
  pull_request:
    branches: [main]
    paths: [<workflow-specific globs>]
  push:
    branches: [main]
    paths: [<workflow-specific globs>]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

`ci.yml` has no `paths` filter (runs on every PR and every push to
main). `contracts.yml` and `terraform.yml` have path filters per D1.
All three cancel in-progress runs when a developer pushes fast
iterations to the same branch.

### D3. Node + pnpm bootstrapping via `actions/setup-node` + Corepack

```yaml
- uses: actions/checkout@v4
  with:
    submodules: false # ci.yml; contracts.yml uses 'recursive'
- uses: actions/setup-node@v4
  with:
    node-version-file: .nvmrc
- name: Enable corepack
  run: |
    corepack enable
    corepack prepare pnpm@9.15.4 --activate
- name: Get pnpm store path
  id: pnpm-store
  run: echo "path=$(pnpm store path --silent)" >> "$GITHUB_OUTPUT"
- uses: actions/cache@v4
  with:
    path: ${{ steps.pnpm-store.outputs.path }}
    key: pnpm-${{ runner.os }}-${{ hashFiles('pnpm-lock.yaml') }}
    restore-keys: pnpm-${{ runner.os }}-
- run: pnpm install --frozen-lockfile
```

Rather than `pnpm/action-setup@v4`. Reasons:

- `actions/setup-node@v4` is maintained by GitHub itself; Corepack
  ships with Node 22 LTS. One fewer third-party action in the supply
  chain.
- Corepack reads `packageManager` from root `package.json`
  (`pnpm@9.15.4`), so the pnpm version is anchored exactly where it
  is already anchored locally — single source of truth.
- The setup-node action caches `~/.npm` automatically; the explicit
  pnpm store cache above handles pnpm's separate store. Both caches
  are keyed on `pnpm-lock.yaml` so a lockfile change correctly
  invalidates both.

### D4. Turborepo remote cache: skip in Phase 0, revisit Phase 1

Turborepo supports a remote cache (Vercel-hosted or self-hosted) that
would let CI runs reuse build artifacts across commits. We
**deliberately skip** that in Phase 0:

- Vercel's free remote cache requires a Vercel account integration;
  it is one more SaaS dependency for marginal Phase-0 benefit.
- Self-hosted (S3-backed) requires a Phase-1 OIDC role to AWS — not
  available until that ADR lands.
- The local `actions/cache@v4` cache on `.turbo/` provides the
  branch-local 80 % of the speedup at zero extra config.

Phase 1+ revisits this when CI cumulative time crosses 5 minutes per
PR.

### D5. Foundry pinned to `v1.7.1` via `foundry-rs/foundry-toolchain@v1`

```yaml
- uses: actions/checkout@v4
  with:
    submodules: recursive # OZ + OZ-upgradeable + forge-std
- uses: foundry-rs/foundry-toolchain@v1
  with:
    version: v1.7.1
```

`v1.7.1` matches the founder's local install (`~/.foundry/bin/forge`
per `docs/03-status.md`) and matches ADR-0015 D2's known-good version
for OpenZeppelin v5.6.1 submodule resolution.

The pin lives only here — not in `foundry.toml` (Foundry has no
version pin block) — so CI is the enforcement point. When ADR-0015's
bump trigger fires (cancun cheatcode needed for audit, or OZ tag
resolution bug fixed), the bump is a one-line change in
`contracts.yml` plus a successor ADR amending ADR-0015.

### D6. Solhint stays warning-only in CI (per ADR-0015 D5)

`contracts.yml` runs `pnpm --filter @opentrade/contracts lint`, which
executes `solhint --noPrompt 'test/**/*.sol'`. Solhint exits 0 even
on warnings; that is intentional per ADR-0015 D5 ("Phase-0 warning-
only, Phase-1 first business contract flips it to error-level").

The hard gates in `contracts.yml` are:

- `forge build` (must succeed)
- `forge test --no-match-test testFork` (must pass, fork tests
  excluded for Phase 0 since no RPC URL is configured)
- `forge fmt --check` (must report zero diffs)

Soft gate (warning, does not fail CI):

- `solhint --noPrompt 'test/**/*.sol'`

### D7. Terraform pinned to `v1.15.4` via `hashicorp/setup-terraform@v3`; CI runs `validate` only

```yaml
- uses: actions/checkout@v4
- uses: hashicorp/setup-terraform@v3
  with:
    terraform_version: 1.15.4
    terraform_wrapper: false # we want raw exit codes
- run: terraform fmt -check -recursive
  working-directory: infra/terraform
- name: Validate bootstrap workspace
  working-directory: infra/terraform/bootstrap/state-backend
  run: |
    terraform init -backend=false -input=false
    terraform validate
- name: Validate environments/dev workspace
  working-directory: infra/terraform/environments/dev
  run: |
    terraform init -backend=false -input=false
    terraform validate
```

`-backend=false` is the critical flag. It tells Terraform "do not try
to read the S3 remote state". With it set, `init` only downloads
provider plugins from `.terraform.lock.hcl` (per t2 of Commit
number-ten) and `validate` checks HCL syntax, variable references,
module wiring, and provider-resource shape — without ever touching
AWS. CI therefore needs zero AWS credentials and cannot be tricked
into a `terraform apply` via prompt injection or supply-chain
compromise.

What this catches:

- Module call signatures (missing required vars, unknown vars, type
  mismatches)
- HCL syntax errors
- `terraform fmt` drift
- Provider version mismatches between `.terraform.lock.hcl` and
  `required_providers`

What this does NOT catch:

- Cost regressions (would need `terraform plan` with real state)
- IAM evaluation issues (would need `apply` against AWS)
- Resource attribute conflicts that depend on existing state (e.g.,
  changing an attribute that requires resource replacement on a
  resource that already exists)

Those are accepted gaps in Phase 0. They land in Phase 4+ alongside
OIDC + `terraform plan` integration that posts plan output as a PR
comment.

### D8. CI has zero AWS credentials in Phase 0 (defers OIDC to Phase 4+)

Per ADR-0017 D11, rule 80, and rule 81:

- No `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` GitHub Secrets.
- No `aws-actions/configure-aws-credentials` step in any workflow.
- No GitHub OIDC trust relationship between `opentrade-dev` IAM and
  this repository.

CI is a **purely read-only quality gate** against the codebase. It
runs lint, typecheck, tests, format checks, forge build/test,
terraform validate — all of which can be done offline.

Phase 4+ adds, in dependency order:

1. IAM Role `GitHubActionsCIRole` in `opentrade-dev` with OIDC trust
   for `repo:skyyuch/opentrade:ref:refs/heads/main` (tightly scoped,
   `ecr:BatchCheckLayerAvailability`, `ecr:PutImage`, etc. only).
2. `terraform.yml` gains a `plan` job after `validate`, which posts
   the plan output as a PR comment.
3. New workflow `deploy.yml` triggered on push to `main` that builds
   and pushes `apps/api` to ECR with the commit SHA tag, then runs
   `aws ecs update-service` to roll the API service.
4. Same `deploy.yml` triggers a `next build` for `apps/web` and
   `apps/console`, uploads to S3, and CloudFront invalidation.

All four require ADR-0019 (Phase 4+ deploy pipeline) which is out of
scope for Commit number-ten.

### D9. Dependabot, not Renovate; npm + github-actions ecosystems only

`.github/dependabot.yml` configures the GitHub-native Dependabot
service:

- **`package-ecosystem: npm`** — weekly schedule, root `pnpm-lock.yaml`
  scope. Ignores `prisma` and `@prisma/client` major bumps (per
  ADR-0013) and `next` / `eslint-config-next` major bumps (per
  `docs/03-status.md` open question 對 14 → 15/16 升級評估). Group
  rules consolidate `@types/*`, `@storybook/*`, `eslint*`, and
  `@typescript-eslint/*` into single PRs to avoid PR storms.
- **`package-ecosystem: github-actions`** — weekly, picks up new
  versions of `actions/checkout`, `actions/setup-node`, etc., so the
  next time we deliberately bump them we are not jumping six majors.

Not in Phase 0 Dependabot:

- **Terraform provider ecosystem** — Terraform Dependabot is recent
  and the AWS provider 5.x → 6.x migration would be a separate ADR
  anyway. Phase 0 stays on the `~> 5.83` pin in ADR-0017 D7.
- **Docker ecosystem** — `apps/api/Dockerfile` pins
  `node:22.13-slim`. A weekly Dependabot bump there would generate
  noise; Phase 1+ revisits when there is a deploy pipeline that can
  rebuild and push to ECR automatically.

Renovate is rejected for Phase 0 because: (a) Dependabot is
GitHub-native with zero extra integration, (b) its grouping rules are
sufficient for our 9-package monorepo, and (c) Renovate's monorepo
power comes from its `packageRules` system, which is overkill until
we have a substantially larger contributor base.

### D10. Branch protection rules are UI-configured follow-up (not encoded as commit)

GitHub does not let us encode branch protection rules in a workflow
file (the protected-branches API requires an admin token; we will not
ship a long-lived `GITHUB_TOKEN` PAT in CI for this). After the first
successful run of all three workflows on this PR, the founder
configures (via repo Settings → Branches → Branch protection rule):

| Setting                               | Value                                                     |
| ------------------------------------- | --------------------------------------------------------- |
| Branch name pattern                   | `main`                                                    |
| Require a pull request before merging | ✅                                                        |
| Required approving reviews            | 0 (Phase 0 solo; flip to 1 when 2nd contributor)          |
| Dismiss stale reviews                 | ✅                                                        |
| Require status checks                 | ✅                                                        |
| Status checks required                | `ci / lint`, `ci / typecheck`, `ci / format`, `ci / test` |
| Conditional checks (when paths match) | `contracts / forge`, `terraform / validate`               |
| Require branches up to date           | ✅                                                        |
| Require conversation resolution       | ✅                                                        |
| Require linear history                | ✅ (matches rule 70 "Squash and merge default")           |
| Do not allow bypassing                | ✅                                                        |
| Restrict force pushes                 | ✅ (rule 70 紅線)                                         |
| Restrict deletions                    | ✅                                                        |

That settings list lives in this ADR rather than as code because the
settings page is the only source of truth GitHub gives us. Future
contributor adds the rule via UI.

### D11. What is explicitly NOT in Phase 0 CI

These belong in CI per rule 70's eventual target list, but Phase 0
deliberately scopes them out to ship the Phase-0 DoD this week:

| Check                                   | Why deferred             | Lands in                     |
| --------------------------------------- | ------------------------ | ---------------------------- |
| Bundle size check (apps/web)            | Need first deploy first  | Phase 4+ deploy              |
| Snyk / dependency vulnerability scan    | Snyk is paid > free tier | Phase 1+                     |
| License check (FOSSA / similar)         | No outside contributor   | Phase 1+                     |
| Playwright E2E                          | No E2E tests yet         | Phase 1 MVP-A                |
| Storybook visual regression / Chromatic | Chromatic is paid SaaS   | Phase 2+                     |
| Slither static analysis                 | No business contracts    | Phase 1+ with first contract |
| Mythril symbolic execution              | Same                     | Phase 1+                     |
| Prisma migration safety check (diff)    | One migration so far     | Phase 1+                     |
| Coverage threshold gate                 | No tests yet             | Phase 1+                     |
| Performance budget                      | No perf budget defined   | Phase 4+                     |

Each cell in the "Lands in" column is a future commit; ADR-0018 is
the anchor that confirms they are deliberate deferrals, not
omissions.

## Alternatives Considered

### A. Single monolithic `ci.yml` with all jobs

- Pros: One file to read; all caches share the same key prefix; all
  paths trigger the same workflow.
- Cons: Concurrency cancellation cancels unrelated jobs; runner
  topology is a least-common-denominator (Foundry + Terraform + Node
  on one runner); future OIDC scope creeps to the whole workflow.
- Conclusion: rejected per D1.

### B. `pnpm/action-setup` instead of Corepack

- Pros: Standard pnpm-recommended approach; explicit pnpm install
  step.
- Cons: One more third-party action in the supply chain; pnpm version
  lives in a workflow file separate from `packageManager` in root
  `package.json`, easy to drift; need to manage cache path manually
  anyway.
- Conclusion: rejected per D3.

### C. Run `terraform plan` in CI with OIDC in Phase 0

- Pros: Catches the 20 % of issues `validate` misses (cost, IAM,
  resource-state conflicts) early; posts plan as PR comment for
  reviewer.
- Cons: Requires an OIDC role in `opentrade-dev` IAM, which requires
  the full Phase-4 IAM hardening story to be done first (per ADR-0017
  D11); even a read-only plan role still touches state-bucket reads,
  which feels premature for solo Phase 0.
- Conclusion: rejected for Phase 0; explicitly scheduled for Phase 4+
  per D8.

### D. Renovate instead of Dependabot

- Pros: More powerful grouping; supports Terraform providers;
  monorepo-native.
- Cons: Requires GitHub App install + `renovate.json` (more setup);
  group rules are overkill at Phase-0 scale; Dependabot is sufficient
  for ignore-Prisma-7 + ignore-Next-15.
- Conclusion: rejected per D9.

### E. Pin Foundry / Terraform via workflow `env.` block

- Pros: All versions in one workflow header.
- Cons: Versions spread across three workflows would require
  duplication; would feel "magical" since the actions accept the pin
  natively via input.
- Conclusion: rejected; the action's own `with: version:` input is
  the right place per Foundry / Hashicorp documentation.

### F. Use GitHub Container Registry (GHCR) for `apps/api` image

- Pros: Free for public repos; would let CI push images today without
  AWS OIDC.
- Cons: Production deploy target is ECS Fargate, which pulls from
  ECR; an intermediate GHCR push then ECR copy would be wasteful
  plumbing; AGENTS.md tech table pins AWS as sole registry.
- Conclusion: rejected. ECR push waits for Phase 4+ OIDC.

### G. Local CI via `act` / nektos as primary, GitHub Actions as backup

- Pros: Founder can test workflow locally without push-and-pray.
- Cons: `act` does not perfectly emulate GitHub Actions (cache,
  matrix, OIDC, secrets all have caveats); CI is the source of truth
  anyway.
- Conclusion: rejected as primary; `act` may be added as a developer
  convenience tool later but is not a substitute for the real CI.

## Consequences

### Positive

- Every PR runs lint + typecheck + format + test for all 8 packages
  unconditionally, so a forgotten `pnpm typecheck` before commit is
  caught at PR open time, not at merge time.
- Foundry build/test/fmt run on every `packages/contracts/**` change,
  so OZ submodule drift or a missing `forge fmt` pass is caught
  immediately.
- Terraform `validate` catches HCL syntax, module wiring, and provider
  drift on every `infra/terraform/**` change, without ever touching
  AWS — supply-chain blast radius is zero.
- Dependabot ignore rules encode ADR-0013 (Prisma 6) and the open
  Next 14→15 question as machine-enforced policy; future
  `dependabot[bot]` PRs cannot quietly propose a major bump.
- Branch protection rules (D10) make the "no force push to main"
  red line of rule 70 enforced by GitHub itself, not just by founder
  discipline.
- The deferral table in D11 turns "we should add Snyk later" from a
  vague worry into a documented Phase-1 follow-up.

### Negative / Trade-offs

- Phase 0 CI is read-only. Bugs that only surface during `terraform
plan` (cost regressions, IAM evaluation) wait until the founder runs
  `plan` locally before `apply`. Mitigated by rule 81's apply
  discipline ("plan before apply, always").
- Three workflow files mean three places to update when adopting a new
  GitHub Actions feature (e.g., reusable workflows). Acceptable cost;
  consolidating into one mega-workflow loses path-filter granularity.
- Corepack-managed pnpm requires Node 22.11+ (we use 22.22.3 per
  `.nvmrc`). If we ever downgrade Node to a version below Corepack-
  bundled-pnpm, CI breaks. Unlikely given AGENTS.md fixes Node 22.
- Dependabot does not auto-merge anything. Founder must triage each
  PR. Acceptable for Phase 0 — auto-merge requires a robust test
  suite first, which is itself a Phase 1+ deliverable.
- `terraform validate` cannot catch attribute conflicts that depend on
  existing state (e.g., changing an RDS `engine_version` from 16.14
  to 16.6 when an instance with 16.14 already exists). Documented as
  Phase 4+ OIDC + `plan` follow-up.

### Neutral

- Three workflow files cost ~7 minutes per full CI run (a fresh PR
  that touches all three globs). pnpm + turbo cache typically bring
  the warm-cache time below 3 minutes.
- The `pull_request_template.md` from D10 is enforced softly by
  GitHub (pre-fills the PR body); a contributor who deletes the
  template gets reviewer side-eye but no CI failure.
- `CODEOWNERS` Phase 0 has only `@skyyuch` (single contributor).
  Reviewer assignment is automatic but the practical effect is nil
  until a second contributor joins.

## Implementation Notes

The following lands in Commit number-ten alongside this ADR (in this
order, per the Phase-0 DoD task decomposition):

- `.terraform.lock.hcl` for both `bootstrap/state-backend/` and
  `environments/dev/` workspaces is unignored from `.gitignore` and
  committed. Required for D7's `terraform init -backend=false` to
  resolve providers from a pinned set, not re-resolve on each CI run.
  `terraform providers lock -platform=linux_amd64
-platform=darwin_arm64 -platform=darwin_amd64` is run once locally
  to populate Mac (founder) and Linux (CI runner) hashes.
- `conversations` scope added to `commitlint.config.mjs` and rule 70's
  scope list. Required so `docs(conversations): ...` archive commits
  pass commitlint, not just warn.
- `.github/workflows/ci.yml` — TS pipeline per D3.
- `.github/workflows/contracts.yml` — Foundry pipeline per D5.
- `.github/workflows/terraform.yml` — Terraform pipeline per D7.
- `apps/web/eslint.config.mjs` and `apps/console/eslint.config.mjs`
  gain a `no-restricted-imports` rule that blocks runtime imports of
  `@opentrade/db` and `@prisma/client`; `import type` is allowed
  (per rule 10's type-only exception). Enforces the rule 10 boundary
  at lint time.
- `.github/dependabot.yml` per D9.
- `.github/pull_request_template.md` per rule 70 PR description shape.
- `.github/CODEOWNERS` per rule 70.
- `docs/03-status.md` updates: Phase 0 DoD CI item ticked,
  Commit number-ten listed under "已完成", next step shifts to
  Phase 1 MVP-A.
- `docs/02-roadmap.md` Phase 0 DoD checklist ticks the CI item.

End-to-end validation that Commit number-ten will perform:

- `pnpm lint / typecheck / format:check / test:unit` pass locally
  before each commit.
- Push `feature/commit-10-ci-cd` branch and open a PR against `main`.
- Verify all three workflows trigger correctly (ci unconditionally,
  contracts only if a contracts commit lands in this PR, terraform
  only if a terraform-touching commit lands). For this PR all three
  should run because t2 touches `infra/terraform/`.
- All three workflows green on first PR run (any yaml typo or cache
  miss is the first thing to fix).
- After merge, configure branch protection rules per D10 in the
  GitHub Settings UI.

Follow-ups tracked in `docs/03-status.md`:

- **Phase 1**: write first Playwright E2E covering the homepage →
  `/status` page flow. Adds `e2e.yml` workflow.
- **Phase 1**: first business contract (`ReviewRegistry.sol`) lands
  with `solhint:recommended` extension and solhint flipped from
  warn-only to error-level (per ADR-0015 D5). `contracts.yml` gains
  a Slither static-analysis step.
- **Phase 1**: introduce Vitest unit tests for `apps/api`; replace
  the `echo 'no tests yet' && exit 0` placeholders. Adds Postgres
  service container to `ci.yml`'s `test` job.
- **Phase 4+** (ADR-0019): GitHub OIDC role in `opentrade-dev`;
  `terraform.yml` gains `plan` + PR comment integration;
  `deploy.yml` builds + pushes `apps/api` to ECR, runs `aws ecs
update-service`; static-site deploy for `apps/web` + `apps/console`
  to CloudFront-fronted S3.
- **Phase 4+**: Enable Snyk + license check + bundle size check per
  rule 70 eventual list.

## References

- [ADR-0002](./0002-aws-stack.md) — AWS as sole cloud; CI never touches
  any other cloud
- [ADR-0013](./0013-pin-prisma-6-not-7.md) — Prisma 6 pin encoded in
  `.github/dependabot.yml` ignore rules
- [ADR-0014](./0014-api-runtime-architecture.md) — `apps/api` typecheck
  and test scope
- [ADR-0015](./0015-contracts-toolchain-setup.md) — Foundry 1.7.1 pin,
  solhint warning-only, OZ submodules
- [ADR-0016](./0016-aws-account-architecture.md) — Why no IAM user / no
  long-lived access keys in CI
- [ADR-0017](./0017-terraform-iac-and-phase0-apply-scope.md) — CI runs
  `validate`; `plan` and `apply` are out of CI scope until Phase 4+
- [`.cursor/rules/70-commit-pr.mdc`](../../.cursor/rules/70-commit-pr.mdc)
  — Commit / PR / CI baseline rules
- [`.cursor/rules/80-aws-accounts.mdc`](../../.cursor/rules/80-aws-accounts.mdc)
  — "CI 不可 apply" red line
- [`.cursor/rules/81-terraform-iac.mdc`](../../.cursor/rules/81-terraform-iac.mdc)
  — Same red line, codified for IaC
- [GitHub Actions: actions/setup-node](https://github.com/actions/setup-node)
- [GitHub Actions: foundry-rs/foundry-toolchain](https://github.com/foundry-rs/foundry-toolchain)
- [GitHub Actions: hashicorp/setup-terraform](https://github.com/hashicorp/setup-terraform)
- [Dependabot configuration reference](https://docs.github.com/en/code-security/dependabot/dependabot-version-updates/configuration-options-for-the-dependabot.yml-file)
