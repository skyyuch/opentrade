# ADR-0059: Derive fed-funds rate-decision events from FRED observation change-points (amends ADR-0058 D3 for high-frequency series)

## Status

Accepted (amends ADR-0058 D3's two-phase population for the daily
`RATE_DECISION` series; relates ADR-0058 D1 facts-only compliance). Owner
ratified 2026-07-23.

## Date

2026-07-23

## Context

After the FRED calendar provider (ADR-0058 D2/D3) went live in UAT and the
`FRED_API_KEY` was configured, the `/calendar` page showed the
`US_FED_FUNDS_RATE` (`RATE_DECISION`) indicator emitting **~31 events per
month** — one per business day — instead of the small handful of actual FOMC
rate moves users expect.

Root cause: the fed-funds target the calendar tracks is FRED series `DFEDTARU`,
a **daily** series. ADR-0058 D3 populates events two-phase from FRED's
**release schedule** (`/fred/release/dates`) for `scheduledAt` and its
**observations** for the actual value. But `DFEDTARU` belongs to a FRED release
that publishes **every business day**, so the release schedule is daily noise,
not decisions. The provider's high-frequency branch (`alignHighFrequency`)
faithfully turned each daily release date into a "rate decision" event, giving
one event per day.

The other indicators in the batch are monthly/quarterly (CPI, payrolls, GDP);
their release schedule genuinely equals their event cadence, so ADR-0058 D3's
release-schedule alignment is correct for them and only the daily class is
wrong. The owner asked for a formal fix (not a temporary disable of the
indicator).

## Decision

**For high-frequency (daily) series, derive events from observation
change-points instead of the release schedule.** A rate "decision" that matters
is a day the target value actually **moved**.

Concretely, `buildDrafts` dispatches by inferred frequency (unchanged for the
periodic path). For daily series (`inferFrequencyDays < 20`) a new
`alignRateChanges` replaces `alignHighFrequency`:

1. Walk observations oldest→newest. The first observation seeds a `baseline`
   (no event).
2. Emit one event per day the value **differs** from the running baseline,
   carrying the prior baseline as `previousValue` and the new value as
   `actualValue`; the change date is both `scheduledAt` and the (daily,
   collision-free) `periodLabel`.
3. Changes older than the display window (`now − LOOKBACK`) still advance the
   baseline but produce no draft, so the first in-window change keeps its true
   `previousValue`.

The release-schedule API is no longer consulted for daily series. Compliance is
unchanged (ADR-0058 D1): only the authority's own previous/actual figures are
produced — never a forecast, consensus, or impact rating.

## Alternatives Considered

- **A. Temporarily disable the `US_FED_FUNDS_RATE` indicator in config.**
  Removes the noise in one line. Rejected: it drops a genuinely useful,
  market-moving indicator to avoid fixing the real defect — the "臨時解" rule 00
  forbids.

- **B. Keep release-schedule alignment but de-duplicate consecutive equal
  values.** Smaller change. Rejected: the release schedule still drives
  `scheduledAt`, so events would land on arbitrary business days near a move
  rather than the actual change date; change-point detection is both simpler and
  more accurate.

- **C. Source FOMC meeting dates from the Fed's FOMC calendar page.** Would let
  the calendar show scheduled meetings ahead of time and mark holds. Rejected
  for MVP: it means scraping/ingesting a separate agency source, exactly the
  brittleness ADR-0058 chose FRED to avoid. Can be revisited as a dedicated
  future unit if forward-looking FOMC scheduling becomes a requirement.

## Consequences

### Positive

- The fed-funds indicator now shows only real rate moves (a few per year), each
  traceable to a FRED observation — accurate and facts-only.
- Periodic indicators are untouched; the fix is scoped to the daily class.
- No new data source, no scraping, no config change; the provider stays
  FRED-only.

### Negative

- **FOMC meetings that HOLD the rate produce no change-point and therefore no
  event.** The calendar shows rate _changes_, not every scheduled decision. This
  is a deliberate, documented limitation of the FRED-only approach (alternative
  C is the fix if forward-looking meetings are later required).
- **No upcoming/scheduled fed-funds event** appears (a future move is unknown
  until it happens), unlike the periodic indicators which show the next
  scheduled release with `actualValue = null`.
- The indicator's display name still reads "Rate Decision"; since only changes
  are surfaced, a future rename to "Rate Change" may be clearer. Left as-is for
  now (user-facing trilingual copy, owner's call) and noted here.

## Implementation Notes

- Files touched: `apps/api/src/tasks/calendar-fetcher/fred-provider.ts`
  (`buildDrafts` dispatch + `alignRateChanges` replacing `alignHighFrequency`;
  removed the now-unused `latestObservationOnOrBefore`) and its unit test.
- Unit tests cover: one event per actual move (not per release day), pre-window
  changes seeding the baseline, unchanged days skipped, and a flat series
  producing no events.
- **Post-deploy cleanup:** the two-phase upsert never deletes, so the ~31
  stale daily fed-funds rows already written to UAT must be pruned once this
  ships (delete `CalendarEvent` rows for `US_FED_FUNDS_RATE` whose `periodLabel`
  is a daily date with no real move), then let the fetcher re-populate.
- No infra change; ships independently of the `FRED_API_KEY` wiring PR.

## References

- ADR-0058 — economic calendar compliance & architecture (D1 facts-only, D2
  FRED source, D3 two-phase population) that this amends for the daily class.
- FRED `DFEDTARU` (daily fed-funds target, upper bound); `/fred/release/dates`
  vs `/fred/series/observations`.
