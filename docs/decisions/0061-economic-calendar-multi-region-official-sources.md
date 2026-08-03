# ADR-0061: Economic-calendar multi-region expansion via additional official sources (amends ADR-0058 D2)

## Status

Accepted (amends [ADR-0058](./0058-economic-calendar-compliance-and-architecture.md) D1/D2)

## Date

2026-08-03

## Context

[ADR-0058](./0058-economic-calendar-compliance-and-architecture.md) shipped the
economic calendar as an official-source, facts-only, chronological surface, with
a deliberately small first batch: **US only** (BLS / BEA / Federal Reserve
schedules + FRED for actuals). D2 explicitly staged HK (Census & Statistics
Department) as the second batch and CN as a later batch, and rejected a
third-party aggregated calendar API (Forex Factory / Marketaux / Finnhub / TE /
FMP) for the MVP.

In use, the owner found the calendar too sparse: on the default "this week"
view only the US employment releases show, and coverage is a single country.
The owner asked to expand to **most regions (US + EU + Asia + others)**, and
referenced Investing.com's presentation (country flags, date-grouped rows).

Two questions were resolved with the owner (2026-08-03 planning):

1. **Compliance boundary** — the owner confirmed we keep the ADR-0058 D1 red
   line intact: **no forecast/consensus, no impact/importance rating**. Those
   are exactly what makes Investing.com advice-adjacent and are OpenTrade's
   deliberate differentiator. Only country flags, more regions, release time,
   period, previous and actual (all official facts) are added.
2. **Data-source strategy** — the owner initially leaned toward a commercial
   aggregator (Trading Economics / FMP) for breadth-with-less-effort, on an
   assumed "many APIs = efficiency problem" concern. Analysis showed the concern
   does not apply: the calendar already decouples fetch from serving via the
   `economic_events` cache table (ADR-0058 D3), so the number of upstream
   sources affects only a 6-hour background job (with per-source failure
   isolation), never page latency. The commercial path's genuine advantage is
   breadth, but it (a) breaks the ADR-0058 D1 "primary source, never a
   third-party aggregator" provenance backbone, (b) is paid (recurring cost
   against the rule-80 budget), (c) carries redistribution/ToS risk, and (d) is
   built around forecast+impact, which the owner already ruled out — so its
   extra value is unusable. The owner chose the **official path, expanded to
   multiple regions**.

### What official multi-region sources actually expose (release schedules)

The calendar's hard part is the forward **release schedule** (a "calendar"), not
the data values. Machine-readable official release schedules verified:

- **US — FRED** `/fred/releases/dates` (already in use).
- **EU / euro area — Eurostat** official iCalendar feed
  `https://ec.europa.eu/eurostat/cache/RELEASE_CALENDAR/calendar_EN.ics`
  (indicator, reference period, release date **and time**, state, source link;
  a single fetch, no key).
- **UK — ONS** `https://api.beta.ons.gov.uk/v1/search/releases` (JSON, no key).
- **Canada — StatCan** `schedule-key_indicators-eng.json` (JSON incl. future
  release dates, no key).
- **Australia — ABS** Indicator API (SDMX; embargo release time known).
- **Japan — e-Stat** release-calendar (dates+times; API maturity to be confirmed
  at implementation).
- **Hong Kong — C&SD**: **no JSON release-schedule API** — only the official
  annual PDF schedule (126 items, fixed 16:30 HKT release). Encoded into config
  from the pre-announced official schedule (home market, stable, low-risk).
- **Singapore / Korea**: no ready forward-schedule API — deferred.

### Honesty note on Investing.com-style events

Several headline events on Investing.com (Manufacturing PMIs for EU / UK / South
Africa / Brazil) are produced by **private data vendors** (S&P Global / HCOB /
ISM), not government statistical authorities. Under the ADR-0058 D1
official-source rule these are **not eligible** and are excluded. The calendar
will therefore never look identical to Investing.com — by design.

## Decision

### D1: Expand the region enum beyond `US / HK / CN`

Add `EU` (European Union), `EA` (euro area), `GB` (United Kingdom), `CA`
(Canada), `AU` (Australia), `JP` (Japan) to the `EconomicRegion` enum
(DB + `packages/config` + web client). `HK` / `CN` retained (CN still deferred).
`region` remains a **filter/label only**, never a ranking (ADR-0058 D1
unchanged). Each region carries a flag emoji, rendered purely as a visual
region marker.

### D2: Generalise the source registry to multiple official providers (amends ADR-0058 D2)

`packages/config/src/calendar.ts` is generalised from a single US/FRED batch to
a **multi-provider registry**: each indicator records which official provider
serves it and the provider-specific identifier(s) it needs. The pluggable
`ICalendarProvider` port (ADR-0058 D3) is unchanged — each authority remains one
provider with isolated per-source failure. Providers land batch by batch:

- **Batch 1 (this ADR's implementation)**: keep **FRED (US)**; add **Eurostat
  (EU / EA)** via the official ICS feed; add **Hong Kong C&SD** via the
  config-encoded official annual schedule. Live coverage: US + EU + HK.
- **Batch 2 (fast-follow, separate commits)**: UK ONS, Canada StatCan, Australia
  ABS, Japan e-Stat — each an incremental provider + config entries, mostly
  key-less.

### D3: The ADR-0058 D1 compliance contract is reaffirmed, not relaxed

Still **facts only**: name / time / region / period / previous / actual +
official outbound link. Still **no forecast/consensus, no impact/importance
rating, no interpretation, chronological only, no paid placement**. Private-
vendor indicators (PMIs) are **out of scope**. Adding regions does not add any
new field type — only more rows from more official authorities.

### D4: Commercial aggregators remain rejected

Trading Economics / FMP / Finnhub etc. stay rejected for the same ADR-0058
reasons, now reinforced: they break official-source provenance, cost money,
carry ToS/redistribution risk, and bundle the forbidden forecast+impact. The
`ICalendarProvider` seam means a commercial source could be added later via a
new ADR (with legal + budget review) without re-architecting — but it is not
adopted now.

## Alternatives Considered

- **A (chosen): expand official sources, multi-region, batch by batch.**
  - Pros: preserves the official-source provenance backbone and D1 red line;
    free; no ToS/redistribution risk; each authority isolated; architecture
    already supports it (pluggable providers + cache table).
  - Cons: one parser per authority; coverage grows batch by batch, not instantly
    global; some authorities (HK, SG, KR) lack a forward-schedule API and need
    config-encoding or are deferred.
- **B: commercial aggregated calendar API (Trading Economics / FMP).**
  - Pros: near-global coverage from one integration.
  - Cons: breaks ADR-0058 D1 provenance ("TE said so" ≠ "the authority
    published"); recurring paid cost (rule 80 budget); redistribution/ToS risk;
    core value (forecast+impact) is exactly what D1 forbids, so mostly unusable.
  - Rejected (reinforces ADR-0058 Alternative B); revisitable later via a new
    ADR if official coverage proves too narrow.
- **C: keep US-only (status quo).**
  - Rejected: too sparse for the owner's due-diligence use case.

## Consequences

### Positive

- Meaningful coverage jump (US + EU + HK now; UK/CA/AU/JP fast-follow) while
  staying free and fully compliant.
- Country flags + date-grouped presentation improve UX toward the referenced
  design, without crossing the advice line.
- Strengthens the "we only show official facts, no advice" grant/investor story
  across more jurisdictions.

### Negative / Trade-offs

- More parsers to own (one per authority); mitigated by per-source isolation
  and the shared `ICalendarProvider` port.
- HK schedule is config-encoded from the annual PDF, so it needs a yearly
  refresh when C&SD publishes the next year's schedule (tracked in status).
- Still not as broad as a commercial 196-country feed — intentional.

### Neutral

- No new field types, no new date/time dependency (ADR-0058 D7 unchanged).
- No tenant dimension change (ADR-0058 D4 unchanged).
- No on-chain surface.

## Implementation Notes

Decomposed per rule 96 (each an independently commit-able unit):

1. This ADR + `decisions/README.md` registration.
2. `packages/db`: extend `EconomicRegion` enum (`EU/EA/GB/CA/AU/JP`) + additive
   migration + `prisma generate`.
3. `packages/config/src/calendar.ts`: generalise to per-provider metadata +
   region→flag; add EU/EA + HK indicators.
4. `apps/api`: Eurostat ICS provider (parse `calendar_EN.ics`, whitelist-map,
   facts-only) + unit test; HK C&SD config-encoded schedule provider + unit
   test; wire both (key-less) into `main.ts`.
5. `apps/web`: extend `ECONOMIC_REGIONS` + region flag map + trilingual region
   keys; refactor `CalendarList.tsx` to a date-grouped, flag-bearing list
   (time · flag · name · period · previous · actual); update tests.

### Implementation update (2026-08-03) — Eurostat endpoint correction

The `RELEASE_CALENDAR/calendar_EN.ics` feed referenced above (Context / D2 /
References) was **retired and returns 404**. The Eurostat provider instead
consumes the official JSON endpoint Eurostat's own release-calendar page uses,
`https://ec.europa.eu/eurostat/o/calendars/eventsJson` (key-less;
`isEuroindicator=true` filters to the euro-area/EU PEEIs; each entry carries a
stable `title`, `period`, UTC `start`, and `datasetCodes`). The decision is
unchanged — Eurostat remains the official EU/EA source, schedule-only, so
events stay `previous/actual = null`; only the transport (JSON not ICS) and the
match key (exact case-insensitive `title` against `eurostatTitle` in config)
differ. See
[docs/conversations/2026-08-03-calendar-multi-region-research.md](../conversations/2026-08-03-calendar-multi-region-research.md)
發現 1. HK GDP advance-estimate is intentionally deferred from batch 1: the
2026 C&SD PDF linearised ambiguously on its exact release months, and shipping a
wrong economic-release date would violate rule 00 (資料正確性) — CPI /
unemployment / external-trade are encoded now; GDP follows once the PDF table is
re-read precisely.

## References

- [ADR-0058](./0058-economic-calendar-compliance-and-architecture.md) — the base calendar ADR this amends (D1 contract, D2 source strategy, D3 cache+fetch, D6 upsert key, D7 time)
- [ADR-0059](./0059-fed-funds-rate-decision-change-points.md) — prior amendment to ADR-0058 (fed-funds change-points)
- [ADR-0057](./0057-news-aggregation-compliance-and-architecture.md) / [ADR-0060](./0060-news-thumbnail-from-publisher-feed.md) — sibling news vertical + its publisher-facts amendment (same official/facts-only philosophy)
- Sources: FRED `/fred/releases/dates`; Eurostat `calendar_EN.ics`; ONS `api.beta.ons.gov.uk/v1/search/releases`; StatCan `schedule-key_indicators-eng.json`; ABS Indicator API; Japan e-Stat release-calendar; HK C&SD annual press-release schedule (PDF)
- Cursor rule 00 (business/compliance red lines — no investment advice), rule 50 (no hard-coded secrets; FRED key in Secrets Manager), rule 80 (Phase-0 budget), rule 96 (task decomposition), rule 97 (ADR discipline)
