# ADR-0016: AWS account architecture (Organizations, Identity Center, SSO profiles)

## Status

Accepted

## Date

2026-05-20

## Context

Commit number-eight closed Phase 0's last package (`packages/contracts`).
Commit number-nine is the first commit that materially provisions cloud
infrastructure (VPC, RDS, ECS Fargate, S3, CloudFront, Secrets Manager via
Terraform). Before any `terraform apply` can run, OpenTrade needs an AWS
account architecture that:

1. **Holds for the project's full lifetime.** Account-level decisions
   (which Organization, which home Region for IAM Identity Center, which
   email is root) cost weeks to undo. We must not pick a shape that is
   right for Phase 0 but wrong for Phase 4+.
2. **Survives the founder transitioning to a company entity.** When
   OpenTrade incorporates and brings on co-founders or investors, the
   AWS estate must transfer cleanly without "first un-mix the personal
   side projects".
3. **Honours ADR-0002's "Phase 0/1: single account, Phase 4+: split"
   intent**, but does so in a way that does not require a painful split
   later. ADR-0002 was written in May 2026 before the Organizations
   tooling matured to where adding sub-accounts on day one is trivial.
4. **Keeps the project owner's pre-existing AWS account untouched.**
   The owner already has an AWS account used for unrelated projects;
   merging would inherit that account's IAM debt and audit trail.
5. **Defaults to Identity Center / SSO** rather than long-lived IAM user
   access keys, per rule 50 (security) and AWS's own published guidance.
6. **Can be operated through the Cursor agent and `aws-cli` from the
   founder's laptop**, with profile names that are obvious from
   `~/.aws/config` and that do not collide with the legacy account.

The competing pulls are: minimum operational overhead now, vs. a
structure that does not need to be re-architected when the project
matures, vs. preservation of a clean audit narrative for SFC / SOC 2 /
investor diligence work that begins in Phase 4.

This ADR resolves all six concerns in one go so that Commit number-nine
and every subsequent infra commit have an explicit, written-down account
boundary to apply Terraform against.

## Decision

Nine coordinated decisions, ratified at the start of Commit number-nine:

### D1. Two AWS accounts on day one, both inside a brand new AWS Organization

- **`opentrade-root` / `skyyuch627` / `774126906499`** — management
  account. Holds AWS Organizations, IAM Identity Center, consolidated
  billing, and zero workload resources.
- **`opentrade-dev` / `371637912734`** — first member account. Holds all
  Phase 0–3 development resources (VPC, RDS, ECS, S3, CloudFront, etc.).

`staging` and `prod` member accounts are **not** created in Phase 0.
They will be added in Phase 4+ before public launch. Adding a fourth or
fifth account is a 5-minute operation thanks to Organizations being live
from day one.

The owner's pre-existing AWS account is **deliberately left outside this
Organization**. It remains a standalone account managed independently.

### D2. Production region is `ap-southeast-1` (Singapore)

Both accounts default to `ap-southeast-1`. Reasoning:

- Hong Kong-to-Singapore RTT is 30 ms — invisible to humans, identical
  to "in-region" UX.
- `ap-southeast-1` is the asia-pacific fintech default; SOC 2 / ISO
  narratives there are well-trodden.
- `ap-east-1` (Hong Kong) costs ~10–15 % more, ships new services later,
  and AWS's own engineering presence in HK is thinner.
- PDPO does not require Hong Kong residency for personal data; "AWS
  Asia Pacific (Singapore) Region" is a fully compliant data location
  story.

`us-east-1` will be enabled later in Phase 4 only because some global
services (CloudFront ACM certificates, Route 53) require it. No
production workload runs there.

### D3. IAM Identity Center is the only auth source; no IAM users

The management account has IAM Identity Center enabled with home region
`ap-southeast-1`. The Organization has a single SSO user (`skyyu`)
assigned the `OpenTradeAdmin` permission set on both accounts. Phase 4+
will add per-role permission sets (e.g., `OpenTradeReadOnly`,
`OpenTradeBilling`).

Concretely, this means:

- ❌ No IAM users created in either account.
- ❌ No long-lived IAM access keys for humans.
- ✅ All `aws-cli` access goes through SSO + 8-hour session tokens.
- ✅ All console access goes through `https://opentrade...awsapps.com/start`.
- ✅ The legacy AWS account's pre-existing IAM users / access keys are
  unchanged; they live in a different trust domain.

The root user of each account has MFA enabled, no access keys, and is
used only for break-glass operations (changing root MFA, adding
sub-accounts, modifying SCPs). Daily work is done as the SSO user.

### D4. Single permission set in Phase 0: `OpenTradeAdmin`

`OpenTradeAdmin` = AWS-managed `AdministratorAccess` policy,
session duration 8 hours, no relay state, no tags. One human, one
project, one role — splitting permissions before there are roles to
split is premature.

Phase 4+ will introduce role separation when:

- A second human joins the project (security advisor, contractor),
- A read-only auditor needs access for SOC 2 prep,
- CI / CD bots get their own IAM Roles Anywhere principals.

### D5. SSO profile naming convention: `opentrade-{account-suffix}`

`~/.aws/config` profile names follow the pattern:

| Profile                | Account ID   | Account name                             | Used by                                |
| ---------------------- | ------------ | ---------------------------------------- | -------------------------------------- |
| `opentrade-dev`        | 371637912734 | `opentrade-dev`                          | All daily development, Terraform apply |
| `opentrade-management` | 774126906499 | `opentrade-root` (display: `skyyuch627`) | Org admin, billing inspection only     |

The profile name does NOT match the account name verbatim because:

- The management account's user-facing name is `skyyuch627` (a leftover
  from the AWS sign-up flow); calling the profile that would be confusing.
- A `opentrade-` prefix on every profile makes the legacy account's
  pre-existing `[default]` profile visually distinct in `~/.aws/config`.
- `{env}` suffix scales naturally to `opentrade-staging` and
  `opentrade-prod` in Phase 4+.

The pre-existing `[default]` profile in `~/.aws/config` is left alone.
Daily OpenTrade work uses `--profile opentrade-dev` (or `export
AWS_PROFILE=opentrade-dev`); legacy account work continues to use the
default. SSO and access-key auth do not interfere with each other.

### D6. Sub-account email uses the Gmail `+alias` trick

The management account's root email is the founder's primary Gmail. The
`opentrade-dev` sub-account uses `<gmail-localpart>+dev@gmail.com`,
which Gmail delivers to the same inbox while AWS treats it as unique.

Future sub-accounts will follow the same pattern:
`<gmail-localpart>+staging@gmail.com`,
`<gmail-localpart>+prod@gmail.com`.

This is documented as a deliberate decision rather than a happy accident
because:

- A future migration to a corporate domain (e.g.,
  `aws-{env}@opentrade.{tld}`) is a clean swap of the root email, but
  only if we are already doing the multi-email-per-account thing on
  purpose.
- Outlook / iCloud users do **not** support `+alias`; if the founder
  ever moves the root mailbox off Gmail, the alias trick breaks and
  this ADR has to evolve.

### D7. Service Control Policies (SCPs) and Resource Control Policies (RCPs) stay disabled in Phase 0

AWS Organizations supports nine policy types (SCP, RCP, Tag, EC2, S3,
Inspector, Network Security Director, Security Hub, Chat applications,
Upgrade rollout). All are left **disabled** in Phase 0.

Reason: with one account doing one thing for one human, lockdown is
solving a problem we do not have. The cost of accidental SCP
mis-configuration ("why is my Terraform `aws_vpc` failing with
`AccessDenied` even though I'm Admin?") far exceeds the benefit.

Phase 4+ will turn on at minimum:

- A region-allow-list SCP (`ap-southeast-1` + `us-east-1` only) — the
  single highest-leverage SCP; prevents the entire class of "I left a
  GPU instance running in eu-west-2 for two weeks" incidents.
- A `DenyRootUserActions` SCP — prevents sub-account root from doing
  anything except changing its own password / MFA.
- A `DenyMFADisable` SCP — prevents users from undoing their own MFA.

These will land as Terraform code in `infra/terraform/modules/scp/`
during Phase 4 and will be ratified by their own ADR.

### D8. Phase 0 cost guardrails live in the management account

Three guardrails configured during the same session as this ADR:

- **`phase-0-soft-cap`**: $50 USD / month budget; alert at 80 % actual
  and 100 % forecast.
- **`phase-0-hard-cap`**: $200 USD / month budget; alert at 50 % and
  100 % forecast.
- **`opentrade-anomaly-alerts`**: Cost Anomaly Detection subscription on
  the AWS-default `AWS services` monitor; threshold $25 OR 40 % over
  expected; daily summaries to the founder's daily email (not the root
  email).

All three live in the management account because consolidated billing
sees both accounts' spend. When `staging` / `prod` accounts arrive in
Phase 4+, per-account budgets will be added on top of the org-wide caps.

ADR-0002 sets `< $50 USD / month` for Phase 0 and `< $200 USD / month`
hard ceiling. These two budgets enforce that ADR mechanically.

### D9. Identity Center home region is `ap-southeast-1` and is permanent

Re-homing IAM Identity Center requires deleting the entire instance,
re-creating, and re-onboarding every user. We chose `ap-southeast-1`
deliberately so no future move is needed even when staging / prod
accounts arrive (they will be in `ap-southeast-1` too, with `us-east-1`
opt-in for global services only).

The Identity Center instance ID `ssoins-82102c3fe7f6ab49` and the
Organization ID `o-o5wm740m1h` are recorded here so that Terraform
resources referencing them have a single source of truth.

## Alternatives Considered

### A. Single AWS account for everything (defer Organizations)

- Pros: simplest possible setup; one credit card; one console.
- Cons: re-splitting later means migrating every resource, IAM, Secret,
  and DNS record. ADR-0002 implies single-account is OK in Phase 0/1
  but the cost of doing it that way and then splitting is hours-to-days
  of busywork; doing it right on day one is 10 minutes of extra UI
  clicks.
- Conclusion: rejected. Day-1 Organizations is essentially free.

### B. Merge OpenTrade into the legacy AWS account

- Pros: zero additional setup, share billing.
- Cons: every reason to split listed in the session conversation —
  audit narrative, blast radius, IAM contamination, cost attribution,
  Service Quotas, future entity transfer.
- Conclusion: rejected unequivocally. Discussed at length in the
  pre-CP1 conversation.

### C. Make the legacy account the management account, OpenTrade as sub

- Pros: unified billing.
- Cons: management account is still mixed; transferring to a corporate
  entity later still requires un-mixing; every bit of the audit /
  diligence pain still applies, just one level deeper.
- Conclusion: rejected.

### D. Pick `ap-east-1` (Hong Kong) instead of `ap-southeast-1`

- Pros: stronger "Hong Kong fintech, data in Hong Kong" narrative.
- Cons: ~10–15 % higher cost on every line item; AWS engineering
  presence in HK is thin; some services arrive there months after SG;
  PDPO does not require HK residency.
- Conclusion: rejected for Phase 0–3. Could be revisited in Phase 5+
  when scale economics change and a regional argument can be re-evaluated
  with real numbers; would require a successor ADR to flip the default.

### E. Stand up four accounts on day one (mgmt + dev + staging + prod)

- Pros: future-staging / -prod can be exercised against from day one.
- Cons: four budgets, four CloudTrail trails, four sets of Terraform
  workspaces — overhead with no Phase 0 user.
- Conclusion: rejected. Phase 0–3 fits in `dev`. Add the others when
  the work that justifies them lands.

### F. Use IAM users + long-lived access keys for `aws-cli`

- Pros: simpler to set up than SSO; no token-refresh dance; some legacy
  Terraform tutorials assume access keys.
- Cons: violates rule 50 ("never long-lived secrets"); access keys are
  the #1 vector for AWS account compromise; no central session control;
  no MFA-enforced API access by default.
- Conclusion: rejected. SSO is the documented modern default for a
  reason.

### G. Use a third-party SSO IdP (Okta, Google Workspace, Auth0) instead of Identity Center directory

- Pros: ties OpenTrade to the future corporate IdP from day one.
- Cons: Phase 0 has one human; a corporate IdP costs $5–10 per user
  per month, plus a domain to wire up, plus an SSO provisioning flow.
- Conclusion: rejected. Use Identity Center's built-in directory now;
  swap to a corporate IdP in Phase 4+ when the headcount and the
  domain exist. This is a non-destructive migration (Identity Center
  supports IdP swap without rebuilding accounts).

### H. Open new dedicated Gmail accounts for each AWS sub-account email

- Pros: no `+alias` cleverness; each AWS account's mail is fully
  separated.
- Cons: every new sub-account needs a new Gmail; password management
  multiplies; adds a 5-minute Gmail signup to every "add sub-account"
  flow.
- Conclusion: rejected for Phase 0. May revisit in Phase 4+ if the
  founder migrates root mail to `aws-{env}@opentrade.{tld}` on a
  custom domain.

### I. Allow `[default]` profile in `~/.aws/config` to point at `opentrade-dev`

- Pros: shorter `aws ...` invocations; no `--profile` flag needed.
- Cons: hijacks the founder's legacy account's existing default. Tools
  that the legacy account uses (e.g., `aws s3 sync` in old scripts)
  would silently start hitting the wrong account.
- Conclusion: rejected. Keep `[default]` as the legacy account; require
  explicit `--profile opentrade-dev` (or per-shell `export
AWS_PROFILE=opentrade-dev`) for OpenTrade work.

## Consequences

### Positive

- Day-1 audit narrative is clean: "OpenTrade resources live exclusively
  in AWS Organization `o-o5wm740m1h`, accounts `774126906499` and
  `371637912734`, region `ap-southeast-1`."
- Budget caps enforce ADR-0002's cost ceiling mechanically; no manual
  vigilance required.
- Adding `staging` and `prod` accounts in Phase 4+ is a 10-minute
  operation: create account, add to existing Organization, assign SSO
  permission set, add Terraform workspace.
- Transferring the entire estate to a corporate entity at incorporation
  is a single AWS Organizations root-email change plus a billing-method
  update. No resource migration.
- Legacy AWS account stays fully isolated; no shared IAM, no shared
  audit trail, no shared blast radius.

### Negative / Trade-offs

- The founder must remember to use `--profile opentrade-dev` (or set
  `AWS_PROFILE`) for every `aws-cli` invocation. Forgetting it hits the
  legacy account's `[default]` profile silently.
- Two SSO directories to maintain in 1Password (`opentrade.awsapps.com`
  for OpenTrade work, plus whatever the legacy account uses).
- The Gmail `+alias` trick locks the founder's email provider as Gmail
  (or any provider that supports `+`). Migrating root mail to a
  non-supporting provider (Outlook, iCloud) requires re-issuing all
  sub-account emails first.
- `us-east-1` is not yet enabled in either account. CloudFront SSL
  certificates and global Route 53 work in Phase 4+ will require a
  one-time region opt-in before that work begins. Tracked in
  `docs/03-status.md` open decisions.

### Neutral

- The Identity Center instance ID (`ssoins-82102c3fe7f6ab49`) and
  Organization ID (`o-o5wm740m1h`) are recorded here permanently. Both
  are public (not secrets) and Terraform code may reference them.
- Account IDs are likewise non-secret and appear in
  `~/.aws/config`, in this ADR, and in `docs/03-status.md`.

## Implementation Notes

Already implemented during the same session that produced this ADR (CP1
through CP6 in the session conversation):

- Both accounts created.
- IAM Identity Center enabled in `ap-southeast-1`, instance
  `ssoins-82102c3fe7f6ab49`.
- SSO user `skyyu` created and assigned `OpenTradeAdmin` on both
  accounts.
- `~/.aws/config` updated with `[sso-session opentrade]`,
  `[profile opentrade-dev]`, `[profile opentrade-management]`. Existing
  `[default]` profile preserved untouched.
- Root MFA enabled on the management account; no root access keys.
- Three cost guardrails wired (two budgets + one anomaly subscription).

Operational rules now in force (codified separately in
[`.cursor/rules/80-aws-accounts.mdc`](../../.cursor/rules/80-aws-accounts.mdc)):

- Daily development uses `aws --profile opentrade-dev`.
- Account-level admin (Org changes, SCP, billing) uses
  `aws --profile opentrade-management`.
- Root login is reserved for break-glass operations only.
- All Terraform `apply` will run against `opentrade-dev` until Phase 4+
  introduces `staging` / `prod`.

Follow-up tracked in `docs/03-status.md`:

- Phase 4+: enable `us-east-1` in `opentrade-management` for CloudFront
  ACM and Route 53 work.
- Phase 4+: introduce SCPs (region allow-list, deny root, deny MFA
  disable) via Terraform.
- Phase 4+: split `OpenTradeAdmin` into role-specific permission sets.
- Phase 4+: add `opentrade-staging` and `opentrade-prod` member
  accounts under the same Organization.

## References

- [ADR-0002](./0002-aws-stack.md) — AWS as sole cloud provider
- [ADR-0010](./0010-split-web-and-console.md) — web vs console (both
  deploy into `opentrade-dev` in Phase 0)
- [ADR-0014](./0014-api-runtime-architecture.md) — apps/api Dockerfile
  copies Prisma engines (will be deployed to ECS in `opentrade-dev`)
- [`.cursor/rules/50-security.mdc`](../../.cursor/rules/50-security.mdc)
  — security baseline; SSO + MFA derives from this
- [`.cursor/rules/80-aws-accounts.mdc`](../../.cursor/rules/80-aws-accounts.mdc)
  — operational rules for AWS accounts (new in this ADR)
- [AWS IAM Identity Center user guide](https://docs.aws.amazon.com/singlesignon/latest/userguide/what-is.html)
- [AWS multi-account strategy whitepaper](https://docs.aws.amazon.com/whitepapers/latest/organizing-your-aws-environment/organizing-your-aws-environment.html)
