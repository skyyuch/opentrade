# ADR-0047: GitHub OIDC deploy pipeline for UAT (amends ADR-0018 D8)

## Status

Accepted (amends ADR-0018 D8)

## Date

2026-06-12

## Context

ADR-0018 D8 ruled that Phase-0 CI carries **zero AWS credentials** and
deferred GitHub OIDC to "Phase 4+ behind ADR-0019". That ruling assumed
nothing ran in AWS. ADR-0046 changed the premise: UAT stands up four
ECS Fargate services in `opentrade-dev`, and its Implementation Notes
stage 6 explicitly schedules "GitHub Actions OIDC role → build/push
images → force ECS deployments" now, before Phase 4.

Changing an existing mandatory behaviour (CI gains AWS credentials)
requires its own ADR per rule 97 — this document is that amendment. It
fixes the blast radius of the credential, how images flow, and how the
pipeline behaves before the infrastructure exists.

Hard constraints carried over unchanged:

- Rule 80: no IAM users, no long-lived access keys, CI never runs
  `terraform apply` (and we keep `plan` out of CI too — ADR-0018 D7's
  `validate`-only posture is untouched).
- ADR-0046 D5: `NEXT_PUBLIC_*` are compile-time build args; the API
  CloudFront URL must exist before front-end images can be built.
- ADR-0046 D2: the outbox worker reuses the `opentrade-api` image, so
  three images cover four services.

## Decision

### D1. One OIDC deploy role, trust pinned to repo + ref

New Terraform module `infra/terraform/modules/github-oidc-deploy/`
creates the account's GitHub OIDC identity provider and a single
`opentrade-dev-github-deploy` role. The trust policy requires both:

- `aud = sts.amazonaws.com`, and
- `sub = repo:skyyuch/opentrade:ref:refs/heads/main` (exact match).

Workflow runs from forks, PRs, or any non-main ref present a different
`sub` claim and are refused at `AssumeRoleWithWebIdentity` time. Session
duration stays at the 1-hour default.

### D2. Permissions are push-and-roll only — no task-definition surface

The role's inline policy grants exactly:

- `ecr:GetAuthorizationToken` (account-scoped; AWS requires `*`),
- ECR push/pull actions on the three repository ARNs
  (`opentrade-api`, `opentrade-web`, `opentrade-console`),
- `ecs:DescribeServices` + `ecs:UpdateService` on the four service ARNs.

Deliberately absent: `ecs:RegisterTaskDefinition` and `iam:PassRole`.
Task shape (command, environment, secrets wiring, task/execution roles)
stays Terraform-owned. A compromised workflow cannot change what runs —
worst case it re-rolls whatever bytes sit behind the pinned tag.

### D3. Deploy = mutable `:dev` tag + forced deployment, not new task definitions

Task definitions pin `<repo>:dev` (MUTABLE per ADR-0017 dev tuning).
The pipeline pushes each image as both `:dev` and `:<git sha>` (the SHA
tag is the audit/rollback handle), then runs `aws ecs update-service
--force-new-deployment`. The `ecs-service` module's deploy circuit
breaker auto-rolls-back bad images; the workflow's
`aws ecs wait services-stable` surfaces that as a red job instead of a
silent revert.

### D4. One `deploy.yml`, three matrix jobs, always build all three

Push to `main` (or manual `workflow_dispatch`) builds api, web, and
console in parallel matrix jobs; the api job force-deploys both the api
service and the outbox worker. No per-app path filtering: shared
packages (`packages/*`) affect every image, and a wrong filter ships
stale code — correctness over saved minutes. Buildx + the GitHub
Actions layer cache (`type=gha`, per-app scope) keep warm builds fast.

### D5. Configuration enters via GitHub repository variables, set after apply

The workflow reads `AWS_DEPLOY_ROLE_ARN`, `AWS_REGION`,
`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_PRIVY_APP_ID`, and optional
`NEXT_PUBLIC_CHAIN_ID` (default 84532) from repository **variables** —
all are non-secret by definition (`NEXT_PUBLIC_*` ships in client
bundles; the role ARN is not a credential). No GitHub **secrets** are
introduced. This resolves the ADR-0046 D5 chicken-and-egg cleanly: the
owner applies Terraform, reads `terraform output`, sets the variables,
and only then can front-end builds produce a correct bundle.

### D6. The pipeline is inert until stage 7 — guard, don't fail

`deploy.yml` carries `if: vars.AWS_DEPLOY_ROLE_ARN != ''` at the job
level: before the stage-7 apply (role does not exist, variables unset)
every run is **skipped**, keeping main green. Front-end jobs
additionally fail fast with an explicit error if `NEXT_PUBLIC_*`
variables are missing once the guard passes, rather than baking a
broken bundle and deploying it.

### D7. Terraform stays out of CI entirely

No `terraform plan` job is added (ADR-0018 D7 `validate`-only posture
unchanged), and the deploy role has zero Terraform-state or
infrastructure-mutation permissions. Plan/apply remain owner-local per
rule 80. A read-only plan role remains a Phase 4+ option.

## Alternatives Considered

- **A1: Wait for Phase 4+ / a full ADR-0019 deploy story (status quo).**
  Rejected: ADR-0046 stage 7 needs repeatable image delivery now;
  hand-built laptop pushes for every iteration are error-prone and
  leave no audit trail.
- **A2: Long-lived IAM access key in GitHub Secrets.** Rejected
  outright: rule 80 red line (no long-lived keys, no IAM users).
- **A3: CI registers new task definitions per deploy (immutable tags).**
  Pros: tag immutability, atomic rollback per revision. Cons: requires
  `RegisterTaskDefinition` + `iam:PassRole` for the task/execution
  roles, handing CI the power to change the container command,
  environment, and identity — exactly the surface D2 refuses; task
  definitions would drift from Terraform state on every deploy.
  Rejected for UAT; revisit for PRD hardening.
- **A4: Per-app path filters to skip unchanged images.** Rejected per
  D4: monorepo-shared packages make filters correctness-hazardous; the
  GHA layer cache already absorbs most of the cost of a no-op rebuild.
- **A5: Plain `docker build`/`push` without buildx cache.** Simpler and
  two fewer third-party actions, but every deploy pays a full cold
  `pnpm install` + `next build` (~10 min × 3 images). The Docker
  official actions are an acceptable supply-chain addition for that
  saving.

## Consequences

### Positive

- Push-to-main is now the single deploy path for UAT: auditable (SHA
  tags + Actions logs), repeatable, no laptop credentials involved.
- The credential CI holds cannot mutate infrastructure, secrets, task
  shape, or Terraform state — it can only refresh image bytes behind a
  tag and trigger a rollout.
- Skipped-not-failed guard means merging this workflow before the
  stage-7 apply costs nothing and breaks nothing.

### Negative / Trade-offs

- ADR-0018 D8's "CI has zero AWS credentials" no longer holds; the CI
  supply chain (Actions, runner images, Docker actions) is now part of
  the deploy threat model. Mitigated by D1's ref pinning and D2's
  minimal scope.
- Every main push rebuilds and redeploys all three images even for
  docs-only commits (~a few warm-cache minutes, negligible Fargate
  churn). Accepted per D4.
- Mutable `:dev` means "what is deployed" is answered by the latest
  pushed SHA tag, not by the task definition. PRD will want immutable
  tags + task-definition revisions (A3 revisit).

### Neutral

- ADR-0018's other ten decisions (workflow split, Corepack, Foundry
  pin, validate-only Terraform, Dependabot posture, branch protection)
  are untouched.
- The `GitHubActionsCIRole` sketch in ADR-0018 D8's Phase-4 list is
  superseded by this role for deploys; a separate read-only plan role
  remains a Phase 4+ follow-up.

## Implementation Notes

Landed in the UAT stage-6 session (commit sequence):

1. `feat(infra): grant ecs task role s3 write on assets bucket` —
   pre-stage gap closure (status 待決策 item; apps/api logo upload).
2. `feat(infra): add github oidc deploy module` — D1 + D2.
3. `feat(infra): wire github deploy role into dev environment` — dev
   composition + `github_deploy_role_arn` output.
4. `ci: add deploy workflow for image push and ecs rollout` — D3–D6.
5. This ADR + index row + status update.

Owner actions at stage 7 (after `terraform apply`):

- Set the five repository variables per D5 (`terraform output
github_deploy_role_arn` / `api_cdn_url` supply the two infra-derived
  values).
- First rollout can be triggered via `workflow_dispatch` once images
  matter (or simply by the next push to main).

## References

- [ADR-0016](./0016-aws-account-architecture.md) — no IAM users / no
  long-lived keys
- [ADR-0017](./0017-terraform-iac-and-phase0-apply-scope.md) — MUTABLE
  `:dev` tags, owner-local apply discipline
- [ADR-0018](./0018-ci-cd-github-actions.md) — CI baseline; D8 amended
  here
- [ADR-0046](./0046-uat-deployment-topology-and-prd-design.md) — UAT
  topology; stage 6 mandate
- `.cursor/rules/80-aws-accounts.mdc` — OIDC-only CI credential red line
- [GitHub: About security hardening with OpenID Connect](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect)
- [AWS: Creating OIDC identity providers](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_providers_create_oidc.html)
- [aws-actions/configure-aws-credentials](https://github.com/aws-actions/configure-aws-credentials)
