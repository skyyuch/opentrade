# ADR-0046: UAT deployment topology on ECS Fargate + PRD environment design

## Status

Accepted

## Date

2026-06-12

## Context

Phase 0 provisioned real infrastructure in `opentrade-dev` (per
[ADR-0017](./0017-terraform-iac-and-phase0-apply-scope.md)): VPC, single-AZ
RDS Postgres, an **empty** ECS Fargate cluster, ECR, two S3-origin
CloudFront distributions, and Secrets Manager slots (~$54/month). No
application has ever been deployed to AWS — `apps/web`, `apps/console`,
`apps/api`, and the outbox worker all run locally only.

The project owner now wants a deployed environment before further feature
work, with these stated requirements:

1. Front end and back end separated ("one server each").
2. UAT may combine front/back ends; PRD must separate them.
3. PRD database should be redundant ("two parallel DBs") so a network
   incident cannot lose data.

Three architectural facts constrain the answer:

- **The compute model is already decided.** ADR-0002 + ADR-0017 chose ECS
  Fargate containers behind CloudFront, not EC2 servers. "One server each"
  must be translated into the container model, not implemented literally.
- **`apps/web` and `apps/console` are Next.js 16 App Router SSR apps**
  (server-side fetches, dynamic routes). The existing `frontend-cdn`
  Terraform module assumes a static S3 origin, which cannot serve SSR.
  Only `apps/api` has a Dockerfile today.
- **Rule 80 / [ADR-0016](./0016-aws-account-architecture.md)** fix the
  account boundary: Phase 0–3 resources live exclusively in
  `opentrade-dev`; `opentrade-staging` / `opentrade-prod` sub-accounts are
  Phase 4+ and adding them requires a successor ADR. The dev monthly cost
  hard cap is $200 (ADR-0002).

There is no registered domain yet; UAT must work on default
`*.cloudfront.net` URLs (which carry the default CloudFront TLS
certificate).

## Decision

Ten coordinated decisions. D1–D8 govern the UAT environment built now;
D9 records the PRD design that will be built in Phase 4+; D10 fixes the
work decomposition.

### D1: UAT lives in `opentrade-dev`; no new account, no new ADR-0016 amendment

UAT is the existing dev environment promoted to "deployed and usable",
not a new environment tier. It reuses the existing VPC, RDS instance,
ECS cluster, and Secrets Manager slots. The account boundary of ADR-0016
is untouched.

### D2: Four ECS Fargate services, not "servers"

The owner's "front end one server / back end one server" requirement is
satisfied at the **service** level on the shared Fargate cluster:

| Service         | Image                  | Inbound | Notes                                          |
| --------------- | ---------------------- | ------- | ---------------------------------------------- |
| `web`           | `opentrade-web`        | ALB     | Next.js SSR, public retail surface             |
| `console`       | `opentrade-console`    | ALB     | Next.js SSR, merchant/admin, robots-disallowed |
| `api`           | `opentrade-api`        | ALB     | Hono, existing Dockerfile                      |
| `outbox-worker` | `opentrade-api` (same) | none    | `node dist/tasks/outbox-worker.js`, 1 task     |

Each service deploys, scales, and fails independently — the isolation the
owner wants from "separate servers" — while UAT cost-tunes by running one
minimal task (0.25 vCPU / 0.5 GB) per service. We do **not** co-locate
front end + back end into one task for UAT: Fargate bills per task size,
so merging saves nothing and forfeits independent deploys (A3).

The outbox worker is a first-class fourth service because on-chain
anchoring (reviews, signals, notes, SBT mints) is a long-running loop, not
a request handler. It reuses the `opentrade-api` image with a different
command, so one ECR repo and one build pipeline cover both.

### D3: Single ALB; CloudFront-injected custom header routes to three target groups

One internet-facing ALB fronts all three HTTP services. Because there is
no custom domain, all CloudFront distributions reach the ALB under the
same Host header (the ALB DNS name), so host-based routing cannot
discriminate. Instead each CloudFront distribution injects a custom
origin header:

```
X-Opentrade-App: web | console | api
```

ALB listener rules match on that header and forward to the matching
target group. The header doubles as a coarse origin lock: the ALB
security group only admits traffic from the CloudFront origin-facing
managed prefix list, and requests lacking the header hit a fixed-response
403 default action — direct-to-ALB traffic is rejected even from
CloudFront IP space.

This saves two ALBs (~$40/month) versus one-ALB-per-app and keeps the
routing rule in Terraform, not in app code.

### D4: CloudFront origin switches from S3 to ALB; a third distribution fronts the API

- The two existing `frontend-cdn` distributions (web, console) switch
  their origin from S3 buckets to the ALB (HTTP-only origin; TLS
  terminates at CloudFront's default certificate). The per-app
  `X-Robots-Tag` posture from [ADR-0010](./0010-split-web-and-console.md)
  is preserved.
- A **third distribution** fronts the API so browsers reach it over
  HTTPS without a domain (the ALB alone cannot serve HTTPS without an
  ACM certificate, which requires a domain). Caching is disabled for the
  API behaviour (`CachingDisabled` managed policy) and all headers,
  query strings, and cookies are forwarded.
- SSR-appropriate cache behaviour for web/console: default behaviour
  forwards cookies + `Accept-Language` (next-intl locale negotiation)
  with caching effectively disabled; `/_next/static/*` gets a long-TTL
  cached behaviour (immutable hashed assets).

When a domain is acquired, distributions gain `aliases` + an ACM cert in
`us-east-1` (the rule 80 Phase 4+ unlock); the topology does not change.

### D5: Next.js standalone Docker images; `NEXT_PUBLIC_*` baked as build args

`apps/web` and `apps/console` gain `output: 'standalone'` in
`next.config.mjs` and multi-stage Dockerfiles mirroring the
`apps/api/Dockerfile` conventions (Debian slim, pnpm workspace-aware,
non-root user). `NEXT_PUBLIC_*` values are compile-time constants in
Next.js, so they enter as Docker build args — meaning **infrastructure
must be applied first** (to learn the API distribution URL) and images
built second. The deploy order is: `terraform apply` → read outputs →
build/push images → force new deployment.

### D6: Database — UAT keeps single-AZ RDS; PRD uses Multi-AZ, explicitly NOT dual-write parallel DBs

The owner's "two parallel DBs in PRD" requirement is ratified as **RDS
Multi-AZ**, not application-level dual-write:

- Multi-AZ keeps a synchronous standby replica in a second availability
  zone. Committed writes exist in two AZs before acknowledgement
  (**RPO = 0**), and instance/AZ/network failure triggers automatic
  failover (~1–2 min) with an unchanged endpoint. This is precisely the
  managed implementation of "two parallel DBs so a network problem cannot
  lose data".
- Application-managed dual-write to two independent databases is
  **rejected** (A2): two writes cannot be made atomic, so every failure
  window diverges the copies; a network partition — the exact scenario
  the owner fears — produces conflicting truths with no arbiter.
- Layered on top: automated backups + point-in-time recovery (already
  enabled), and OpenTrade's own trust anchor — review/signal/note
  `contentHash` on Base + full content on IPFS — which makes the core
  immutable data reconstructable even after total DB loss.
- UAT keeps the existing single-AZ `db.t4g.micro` (ADR-0017 D5 cost
  tuning). The `rds-postgres` module already exposes `multi_az`; PRD
  flips a variable, not a module.

A read replica is noted as a PRD scaling option, not provisioned.

### D7: PRD topology (designed now, built in Phase 4+)

PRD is **not built in this workstream**. Its design is fixed here so UAT
choices stay forward-compatible:

- Separate `opentrade-prod` member account (requires the ADR-0016
  amendment when built, per rule 80), plus `opentrade-staging` if a
  pre-prod gate is wanted.
- Same module set, prod variable values: RDS `multi_az = true` +
  `deletion_protection = true` + 30-day secret recovery window, NAT
  gateway per AZ, WAF in front of CloudFront, `PriceClass_All`,
  Performance Insights on, larger instance classes, ≥2 tasks per service
  across AZs.
- Custom domain + ACM in `us-east-1`, Route 53 hosted zone in the prod
  account.
- Estimated steady-state ~$200–250/month — requires a budget-revision ADR
  against ADR-0002/ADR-0016 guardrails at build time.

### D8: UAT cost envelope ~$115–135/month, inside the $200 hard cap

| Increment over current $54     | Estimate (USD/mo) |
| ------------------------------ | ----------------- |
| ALB (+ LCU at UAT traffic)     | ~$20              |
| 4 × Fargate task (0.25/0.5 GB) | ~$36              |
| Third CloudFront + logs        | ~$5               |
| New ECR repos + image storage  | ~$2               |
| **New total**                  | **~$115–135**     |

The $50 `phase-0-soft-cap` budget alert already fires at the current $54
and will continue to — known and accepted (ADR-0017 D6). The $200 hard
cap is respected with margin. Raising the soft cap is deliberately
deferred to the next phase-boundary budget review (rule 80).

### D9: Secrets — extend the slot list; values stay outside Terraform

The current slot list (`jwt-secret`, `privy-app-secret`, `deepl-api-key`)
predates the real `apps/api` env schema. The slot list grows to cover
what `apps/api/src/shared/env.ts` actually requires at runtime
(Privy app ID/secret/verification key, ES256 JWT keypair, Pinata JWT,
relayer private key, default tenant ID, contract addresses). Values are
written via `aws secretsmanager put-secret-value` per ADR-0017 D10 —
never through Terraform. The deprecated `deepl-api-key` slot is kept
(ADR-0027 may rewire it).

### D10: Work decomposition + hand-off discipline (per rules 96 + 98)

Implementation is decomposed into independent sessions, each ending in a
hand-off (status update + commit + next-session start point), mirroring
the ADR-0045 D8 precedent. See Implementation Notes.

## Alternatives Considered

- **A1: Two EC2 instances ("one server front, one server back").**
  - Pros: matches the owner's literal mental model; simple to reason about.
  - Cons: OS patching, AMI lifecycle, no rolling deploys, single-point
    failure per box; contradicts the standing ADR-0002/0017 Fargate
    decision (changing compute model would itself need an ADR).
  - Rejected: ECS services provide the intended isolation with less
    operational surface.
- **A2: Two parallel databases with application dual-write.**
  - Pros: superficially matches "two DB sets in parallel".
  - Cons: dual-write is a consistency anti-pattern — non-atomic writes
    diverge on any partial failure; a network partition creates two
    conflicting truths with no arbiter; reconciliation tooling would
    dwarf the feature itself.
  - Rejected in favour of RDS Multi-AZ (synchronous, managed, RPO = 0).
- **A3: Combine front end + back end into one task/container for UAT.**
  - Pros: fewer moving parts; matches "UAT can be one server".
  - Cons: Fargate bills per task size, so merging saves ~nothing; loses
    independent deploy/restart; diverges UAT from PRD topology, hiding
    integration bugs UAT exists to catch.
  - Rejected: UAT economises via minimal task sizes, not co-location.
- **A4: One ALB per app (3 ALBs), or host-based routing on one ALB.**
  - Pros: simplest listener rules.
  - Cons: 3 ALBs add ~$40/month for zero isolation benefit at UAT scale;
    host-based routing is impossible without a custom domain (all
    distributions present the same ALB DNS Host header).
  - Rejected: single ALB + injected `X-Opentrade-App` header routing.
- **A5: Static-export the Next.js apps to S3 (keep existing S3 origins).**
  - Pros: no front-end containers at all; cheapest possible.
  - Cons: `output: 'export'` forbids SSR/server fetches/dynamic
    rendering, which web + console rely on throughout (server-side data
    fetching, locale negotiation, auth-gated pages).
  - Rejected: incompatible with the app architecture.
- **A6: Build staging/prod accounts now (owner's PRD ask, immediately).**
  - Pros: PRD exists from day one.
  - Cons: violates rule 80's Phase 4+ account boundary without need;
    PRD-grade cost (~$200–250/mo) plus UAT breaches the $200 hard cap,
    forcing an immediate budget ADR; no users exist to serve.
  - Deferred: PRD is designed (D7) and built at Phase 4+ behind its own
    ADR.
- **A7: API Gateway + Lambda instead of ALB + Fargate.**
  - Pros: scale-to-zero pricing.
  - Cons: contradicts the standing ECS decision (ADR-0014/0017); Prisma +
    long-lived Postgres connections and the always-on outbox loop fit
    containers, not request-scoped lambdas.
  - Rejected.

## Consequences

### Positive

- UAT becomes a real, externally reachable environment on the
  already-paid-for foundation; front/back separation matches PRD
  topology, so UAT genuinely rehearses production.
- The data-loss requirement is answered with RPO = 0 synchronous
  replication (PRD) instead of a homegrown dual-write that would have
  _created_ data-integrity risk.
- PRD later is a variables-plus-account exercise: same modules, flipped
  knobs, one amending ADR — no redesign.
- No domain dependency: everything works on `*.cloudfront.net` with
  valid TLS; a future domain is additive.

### Negative / Trade-offs

- Monthly burn roughly doubles ($54 → ~$115–135); soft-cap alert noise
  continues by design.
- `NEXT_PUBLIC_*` baking makes image builds environment-specific; PRD
  will need its own image builds (acceptable — environments differ in
  Privy app and API URL anyway).
- Custom-header ALB routing is unconventional versus host-based routing;
  it must be replaced (or kept harmlessly) once a domain exists.
- The CloudFront→ALB origin leg is HTTP (no domain → no ACM cert for the
  origin). Traffic stays on the AWS backbone and the SG pins ingress to
  CloudFront's origin-facing ranges; still, origin TLS should be enabled
  when a domain lands (tracked as a PRD/domain follow-up).
- SSR behind CloudFront forwards cookies/locale headers with caching
  mostly disabled, so CloudFront adds little caching value for HTML at
  UAT scale (static assets still cache). Acceptable; revisit with real
  traffic.

### Neutral

- The S3 buckets created by `frontend-cdn` become unused by the CDN path
  (retained for now; removal is a cleanup follow-up).
- The `sfc-sync-task` module (ADR-0020, currently `enabled = false`) can
  be enabled once the API image is pushed — unchanged by this ADR.
- Smart-contract layer untouched; the worker simply runs in AWS instead
  of a laptop.

## Implementation Notes

Sessions (each an independent hand-off point per rule 98):

1. **ADR + index** — this document; `docs/decisions/README.md` row.
2. **Front-end images** — `output: 'standalone'` + Dockerfiles for
   web/console + local smoke test.
3. **Terraform modules** — new `alb` module (SG pinned to CloudFront
   prefix list, header-match listener rules, 403 default) + new
   `ecs-service` module (task definition, service, optional target
   group, secrets injection from Secrets Manager ARNs); two ECR repos.
4. **Dev environment wiring** — four services on the existing cluster;
   `frontend-cdn` origin swap to ALB + third API distribution; RDS SG
   admits the api/worker service SG; extended secret slot list (D9).
5. **Secrets + DB preparation** — operator session: put secret values via
   CLI; run `prisma migrate deploy` (one-off ECS task or local run
   against RDS); seed SFC + CGSE + instruments; enable `sfc-sync-task`.
6. **CI/CD** — GitHub Actions OIDC role → build/push images → force ECS
   deployments. Terraform CI stays plan-only (rule 80); applies are run
   by the owner locally.
7. **Apply + end-to-end validation** — apply, push, walk
   login → review → on-chain confirmation across the three CloudFront
   URLs; update `docs/03-status.md`.

Chicken-and-egg note (D5): infra apply must precede front-end image
builds because the API CloudFront URL is a build arg.

## References

- [ADR-0002](./0002-aws-stack.md) — AWS as sole cloud + cost ceiling
- [ADR-0010](./0010-split-web-and-console.md) — two front-end apps, robots posture
- [ADR-0014](./0014-api-runtime-architecture.md) — api Dockerfile contract
- [ADR-0016](./0016-aws-account-architecture.md) — account boundary (D1, D7)
- [ADR-0017](./0017-terraform-iac-and-phase0-apply-scope.md) — module layout, cost knobs, secrets posture
- [ADR-0018](./0018-ci-cd-github-actions.md) — CI baseline this extends
- [ADR-0020](./0020-scheduled-sfc-broker-sync.md) — sfc-sync task enablement
- `.cursor/rules/80-aws-accounts.mdc` — account/region/budget red lines
- `.cursor/rules/81-terraform-iac.mdc` — Terraform code standards
- [AWS: RDS Multi-AZ deployments](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZ.html)
- [Next.js standalone output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)
- [CloudFront managed prefix list](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/LocationsOfEdgeServers.html#managed-prefix-list)
