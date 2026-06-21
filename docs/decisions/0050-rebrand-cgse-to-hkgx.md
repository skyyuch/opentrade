# ADR-0050: Rebrand the bullion registry from CGSE (金銀業貿易場) to HKGX (香港黃金交易所)

## Status

Accepted

## Date

2026-06-21

## Context

[ADR-0045](./0045-bullion-dealer-vertical-cgse.md) added the bullion-dealer
vertical, sourcing its authoritative roster from the **Chinese Gold & Silver
Exchange Society (CGSE / 金銀業貿易場)** — a self-regulatory bullion exchange
founded in 1910. That decision (D3/D5/D6) hard-coded the `CGSE` identity into:

- the `Regulator.HK_CGSE` and `LicenseType.HK_CGSE_MEMBER` enum values;
- the `packages/db/src/cgse/` offline scraper + `seed-data/cgse-members.json`
  (slugs `cgse-{memberCode}`, `source = 'cgse'`, scraping `cgse.com.hk`);
- the `brokerDetail` i18n keys (`cgseMember`, `cgseMembershipRecord`,
  `cgseRegistryLink`, `cgseDataNote`, …) and the user-facing「金銀業貿易場 / CGSE」
  copy across zh-Hant / zh-Hans / en.

### What changed in the real world

On **2024-12-31** the CGSE completed its "century-old historical mission". From
**2025-01-01** the corporatised **Hong Kong Gold Exchange (HKGX / 香港黃金交易所)**
officially took over as Hong Kong's sole spot gold & silver exchange, inheriting
all of CGSE's assets and operations. Existing CGSE member firms were directly
appointed as HKGX members. The restructuring was driven by a push for higher
transparency, stronger corporate governance, and the recruitment of
international members in support of the HK government's "international gold
trading centre" initiative — i.e. **HKGX is positioned with higher requirements
than its CGSE predecessor**.

Sources:

- HKGX「成立啟事」/ CGSE announcement (cgse.com.hk, hkgx.com.hk/en/about)
- 文匯報 2024-12-21、大公報、SCMP 2024-12-20「City's 114-year-old bullion bourse
  restructures to become Hong Kong Gold Exchange」

Because OpenTrade's bullion vertical surfaces "金商" to users as a public,
immutable trust signal, continuing to label the registry「金銀業貿易場 / CGSE」is
factually outdated. The platform must reflect **香港黃金交易所 (HKGX)**.

### The decisive fact

This is a **rebrand of the registry identity, not a change to the architecture**.
Per ADR-0045 a bullion dealer remains a `Broker` row with `category = BULLION`;
nothing about the reviewable-subject model, the review/complaint/verify/claim
pipeline, or the on-chain anchor changes. Only the **name, enum values, slugs,
provenance, scrape source, and copy** carry the stale `CGSE` identity and must
become `HKGX`.

The project red-line「所有方案必須是徹底長遠方案，不接受 hack / 臨時解」rules out a
display-label-only patch (user sees「香港黃金交易所」while every internal
identifier still says `CGSE`). The rebrand must go all the way down to the enum,
the code module, the data file, and the slug.

## Decision

### D1: Rename the registry enum values `HK_CGSE → HK_HKGX`

```prisma
enum Regulator {
  HK_SFC
  HK_HKGX   // Hong Kong Gold Exchange (香港黃金交易所) — formerly CGSE, per ADR-0050
}

enum LicenseType {
  // ... HK_SFC_TYPE_1..10 ...
  HK_HKGX_MEMBER   // HKGX membership; the 行員 member code → BrokerLicense.licenseNumber
}
```

Delivered as a **new migration** using Postgres `ALTER TYPE … RENAME VALUE`
(in-place, no data rewrite, no enum re-create). The existing
`20260605100849_add_bullion_dealer_category` migration is **never edited**
(per cursor rule 31 — applied migrations are immutable).

### D2: Rename the data pipeline `cgse → hkgx`

- `packages/db/src/cgse/` → `packages/db/src/hkgx/` (`scrape.ts`, `types.ts`,
  `sync-members.ts`); types `CgseMember*` → `HkgxMember*`; `syncCgseMembers` →
  `syncHkgxMembers`; `fetchCgseMembers` → `fetchHkgxMembers`.
- `seed-data/cgse-members.json` → `seed-data/hkgx-members.json`; every
  `source: 'cgse'` → `'hkgx'`.
- `scripts/fetch-cgse-members.ts` → `scripts/fetch-hkgx-members.ts`;
  `package.json` script `fetch:cgse` → `fetch:hkgx`.
- Scrape target repointed to the HKGX member list
  (`hkgx.com.hk/{en,hk}/member/memberlist`). The page is still
  server-rendered HTML, member code in cell 0 / company name in cell 1 — the
  selector is loosened from `table.trading-table` to `table` so it tolerates the
  new markup (the `isMemberCode` guard already filters non-data rows).

### D3: Rename broker slugs `cgse-{code} → hkgx-{code}`

The project is still pre-production (no canonical bullion data has shipped), so
slugs are renamed for brand consistency. The `hkgx-` prefix keeps the same
collision-avoidance guarantee against name-based SFC slugs in the
`(tenantId, slug)` unique key. Existing dev/UAT databases must be reseeded
(`pnpm --filter @opentrade/db db:migrate:reset`) — the slug rename creates new
`Broker` rows, and the soft-retirement logic leaves any stale `cgse-*` rows in
place (never hard-deleted, per rule 31).

### D4: Rename i18n keys + copy `cgse* → hkgx*`

`brokerDetail.cgse{Member,MembershipRecord,MembershipPill,RegistryLink,
RegistryLinkDesc,DataNote,DataNoteTitle}` → `hkgx*`, plus all visible copy
「金銀業貿易場 (CGSE)」→「香港黃金交易所 (HKGX)」/「Chinese Gold & Silver Exchange
Society」→「Hong Kong Gold Exchange」across zh-Hant / zh-Hans / en. The registry
link points to `hkgx.com.hk`. The trilingual parity guard
(`bullionMessagesParity.test.ts`) is updated to assert the new key set.

The vertical name「金商 / 貴金屬交易商 / Bullion dealer」is **unchanged** — only
the _exchange_ identity is rebranded, not the product category.

### D5: Re-scrape of the live HKGX roster is a follow-up, not part of this ADR

We keep the existing committed member set (rebranding its identifiers/source)
and do **not** re-scrape `hkgx.com.hk` in this change. The HKGX member-list page
uses a new 6-column layout with PII-adjacent edge cases (individual members show
a principal name in the name column) that need careful handling. A full live
re-scrape is recorded as a **Phase 2 follow-up** — the same "revisit later"
posture ADR-0045 D5/A3 took for scheduled syncing.

## Alternatives Considered

- **A1: Display-label-only rebrand** (UI says 香港黃金交易所, internals stay
  `CGSE`). Rejected — violates the「徹底長遠方案」red-line; leaves a permanent
  name/identity mismatch in the schema, data, and code that misleads every
  future contributor.
- **A2: Keep `cgse-*` slugs, rebrand only the enum + copy.** Rejected for full
  brand consistency given we are pre-production; the slug rename cost is near
  zero now and irreversible-feeling later.
- **A3: Re-create the enum type instead of `ALTER TYPE … RENAME VALUE`.**
  Rejected — `RENAME VALUE` is an in-place, lossless, single-statement rename
  supported since Postgres 10; re-creating the type would force a column swap
  with downtime risk for zero benefit.
- **A4: Supersede ADR-0045 entirely.** Rejected — ADR-0045's architecture
  (bullion = `Broker` category) is unchanged and still correct. This ADR
  _amends_ the registry-identity decisions (D3/D5/D6), so ADR-0045 stays
  Accepted with an "Amended by ADR-0050" annotation.

## Consequences

### Positive

- The 金商 vertical reflects the current legal reality (香港黃金交易所 / HKGX).
- No architecture change: reviews / complaints / verification / claim / on-chain
  pipelines are untouched (bullion dealers are still `Broker` rows).
- Schema, code, data, and copy share one consistent `HKGX` identity — no
  misleading legacy `CGSE` references for future contributors.

### Negative / Trade-offs

- A one-off DB migration (enum value rename) + reseed for existing dev/UAT DBs.
- Renamed slugs orphan any previously-seeded `cgse-*` broker rows (left in place,
  never deleted) until a reset/reseed — acceptable in the pre-production phase.
- The offline scraper now points at the new HKGX page whose full 6-column /
  PII-edge-case parsing is deferred to the Phase 2 live re-scrape (D5).

### Neutral

- The「金商 / Bullion dealer」product category name is unchanged.
- On-chain contract layer and IPFS payload schema untouched.

## Implementation Notes

Decomposed (cursor rule 96) into CI-green units:

1. **Docs** — this ADR + `decisions/README.md` + the "Amended by ADR-0050" note
   on ADR-0045.
2. **Code rebrand (atomic)** — schema enum + migration, `db/src/hkgx/` module,
   `hkgx-members.json` (slug + source), fetch script + `package.json`,
   `seed.ts`, API `routes.ts`, the three web string comparisons
   (`'HK_CGSE'` → `'HK_HKGX'`), i18n key renames + copy, console comment, and all
   touched tests/fixtures — kept together because the enum value, the string
   literals that compare against it, the i18n keys, and the tests asserting them
   are tightly coupled and must move as one to keep typecheck + tests green.
3. **Narrative docs** — `00-vision.md`, `04-glossary.md`, `03-status.md`,
   `docs/ui-prompts/bullion-dealer-ui-prompt.md`.

## References

- Amends: [ADR-0045](./0045-bullion-dealer-vertical-cgse.md) D3 / D5 / D6
- HKGX official: `https://hkgx.com.hk/en/about/whatis`,
  `https://hkgx.com.hk/en/member/memberlist`
- CGSE handover announcement: `https://cgse.com.hk/chines/en/announcement/cgse`
- Cursor rule 00 (徹底長遠方案 red-line), rule 31 (immutable migrations / no hard
  delete), rule 51 (i18n), rule 96 (task decomposition)
