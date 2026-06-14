# ADR-0049: UAT reference-data enrichment via in-VPC run-task overrides on the migrate image

## Status

Accepted (amends ADR-0048; relates ADR-0020, ADR-0038, ADR-0045)

## Date

2026-06-14

## Context

ADR-0048 made schema migration + core seed (`prisma migrate deploy &&
tsx scripts/seed.ts`) a repeatable in-VPC one-off ECS task against the
private RDS. The owner-driven interactive E2E session on UAT exposed
that `seed.ts` is **not** the whole reference-data story:

- **Instruments are empty.** `seed.ts` seeds tenants, brokers, licenses,
  KOLs, and moderation terms, but the instrument catalog (ADR-0038) is
  populated by a **separate** script `scripts/sync-instruments.ts`
  (curated indices/commodities + HKEX equities + SEC US equities +
  CoinGecko crypto, ~13.7k rows). It was never run on UAT, so
  `GET /v1/instruments` returned `[]` — blocking the KOL signal/note
  target picker.
- **Broker SFC detail tabs are empty.** The "responsible officers /
  licensed representatives / disciplinary actions" tabs read
  `Broker.sfcDetailJson`, which is filled by `scripts/fetch-sfc-details.ts`
  — a **live scraper** of the SFC public register (~350 ms/broker across
  sub-pages, ~3482 brokers, 3–4 h). It is not part of `seed.ts` and the
  full dataset (~13 MB) exceeds the repo's 1 MB commit guideline, so a
  committed JSON snapshot is not an option.

The same constraints that motivated ADR-0048 apply: RDS is private
(`publicly_accessible = false`, SG admits only named client SGs), so an
operator laptop cannot reach it; and a "scrape locally then dump into
UAT" path would tie up the owner's machine for hours and still require a
data-transfer step into the VPC.

## Decision

### D1. Enrichment scripts run as in-VPC one-off tasks by **overriding the migrate task's container command**

Both `sync-instruments.ts` and `fetch-sfc-details.ts` already live in
`packages/db/scripts` and are therefore baked into the `:migrate` image
(it is `FROM builder`, carrying the full workspace + `tsx` + generated
client). No new image stage, ECR repo, or Terraform task definition is
introduced. Enrichment is run by reusing the existing
`opentrade-dev-migrate` task definition and **overriding its command** at
launch:

```
aws ecs run-task \
  --profile opentrade-dev \
  --cluster opentrade-dev-cluster \
  --task-definition opentrade-dev-migrate \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[<private-a>,<private-b>],securityGroups=[<migrate-sg>],assignPublicIp=DISABLED}" \
  --overrides '{"containerOverrides":[{"name":"migrate","command":["sh","-c","pnpm exec tsx scripts/<script>.ts"]}]}'
```

The image WORKDIR (`/workspace/packages/db`) and the `DATABASE_URL`
secret injection are inherited from the task definition; the migrate
SG's egress-all rule + private-subnet NAT route give the scrapers their
outbound internet (HKEX / SEC / CoinGecko / SFC register). This is the
same owner-local privileged invocation posture as ADR-0048 D2 — **not**
CI — so ADR-0047 D2's minimal deploy-role surface is untouched.

### D2. Enrichment is a separate on-demand step, never folded into migrate/seed CMD

`fetch-sfc-details.ts` is a 3–4 h live scrape; making it part of the
migrate task's default CMD would couple every schema migration to a
multi-hour scrape and re-hammer the SFC register. Enrichment stays an
explicit, independently-invoked operation. `sync-instruments.ts` is
likewise run on its own (minutes) and re-runnable as market data drifts.

### D3. `fetch-sfc-details.ts` gains an optional `--limit=N` flag

The script already supported incremental mode (only brokers with
`sfcDetailJson IS NULL`) and `--force`. A `--limit=N` flag is added so a
small demo subset can be populated in minutes for quick verification
before committing to the full 3–4 h run, and so a partial run can be
resumed cheaply. Default (no flag) processes all matching brokers.

## Alternatives Considered

- **A1: Scrape locally, then dump/restore into UAT.** Ties up the
  owner's laptop for 3–4 h, needs a private-RDS ingress path (the very
  thing ADR-0048 avoided) or a pg_dump→S3→pg_restore dance, and risks
  local/UAT drift. Rejected.
- **A2: Commit a JSON snapshot of instruments + SFC details and load it
  in `seed.ts`.** The SFC dataset is ~13 MB — well over the 1 MB commit
  guideline (rule 70) — and would go stale immediately. Rejected; the
  source registers are the source of truth, scraped in-VPC.
- **A3: Add dedicated `enrich-*` Terraform task definitions.** Cleaner
  separation but more IaC surface for what is a bootstrap-time owner
  operation against scripts already present in the `:migrate` image.
  Overriding the existing task definition's command is sufficient and
  keeps the module count down. Reconsider if enrichment ever needs its
  own schedule (then mirror `sfc-sync-task`, per ADR-0020).
- **A4: Fold enrichment into the migrate CMD.** Couples DDL to a
  multi-hour scrape and re-scrapes on every migration. Rejected (D2).

## Consequences

### Positive

- UAT reference data (13.7k instruments + 3482-broker SFC details) is
  populated entirely in-VPC with no new infra, no repo bloat, and no
  laptop tie-up; the owner's machine is free during the 3–4 h scrape.
- The pattern is reusable for any future `packages/db/scripts/*` task
  against the private RDS — just override the command.
- ADR-0047 D2's CI credential surface and ADR-0048's owner-local posture
  are both preserved unchanged.

### Negative / Trade-offs

- Enrichment is a manual, multi-step owner ritual (run instruments, run
  SFC, verify) with no scheduling — acceptable for a one-time UAT
  bootstrap; a Phase-4+ schedule (à la ADR-0020) can automate refresh if
  needed.
- The `:migrate` image must carry the scripts (it does, being
  `FROM builder`); a future slimming of that stage would have to keep
  `scripts/` for this to work.
- Long scrapes run untracked beyond CloudWatch logs; progress is checked
  by tailing the `migrate/migrate/<task-id>` stream and counting
  `sfcDetailJson` rows.

### Neutral

- Reuses the migrate task/execution roles, the `database-url` secret, and
  the migrate SG (already in the RDS client-SG map); no new IAM identity.
- `--limit` is additive and backward-compatible with the seed CMD and
  prior invocations.

## Implementation Notes

Executed in the owner E2E-prep session (2026-06-14), after instruments +
SFC gaps surfaced during interactive UAT testing:

1. `sync-instruments` run-task override → 13711 instruments created;
   verified `GET /v1/instruments?q=700` returns `00700 TENCENT 騰訊控股`
   and `q=tencent` resolves the Tencent family.
2. `fetch-sfc-details` full run-task override (no `--limit`) → background
   3–4 h scrape of all 3482 brokers (`mode: only missing`); progress
   polled via CloudWatch `migrate/migrate/<task-id>` and a periodic
   `COUNT(*) WHERE sfcDetailJson IS NOT NULL`.
3. `feat(db)` — add `--limit=N` to `fetch-sfc-details.ts` (D3).
4. ADR-0049 + `docs/decisions/README.md` index row (this document).

## References

- [ADR-0020](./0020-scheduled-sfc-broker-sync.md) — scheduled SFC broker
  sync; the one-off-ECS pattern and SFC scraping precedent
- [ADR-0038](./0038-instrument-catalog-and-asset-scope.md) —
  instrument catalog populated by `sync-instruments.ts`
- [ADR-0045](./0045-bullion-dealer-vertical-cgse.md) — CGSE
  bullion-dealer brokers (also enriched by SFC scrape where applicable)
- [ADR-0046](./0046-uat-deployment-topology-and-prd-design.md) — UAT
  topology
- [ADR-0047](./0047-github-oidc-deploy-pipeline.md) — CI credential
  surface preserved
- [ADR-0048](./0048-uat-migration-job-and-deterministic-tenant.md) —
  migrate image + one-off task pattern this extends
- `.cursor/rules/80-aws-accounts.mdc` — owner-local privileged ops
