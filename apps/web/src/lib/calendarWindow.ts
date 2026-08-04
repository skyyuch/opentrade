/**
 * Hong-Kong-time week/month window computation for the /calendar page
 * (ADR-0058 D7: events are stored UTC and displayed in Asia/Hong_Kong).
 *
 * Hong Kong is UTC+8 with no DST, so the HK wall clock can be derived by
 * shifting the UTC epoch by a constant offset — no date library needed (the
 * monorepo deliberately has none, ADR-0058 D7). The trick: shift `now` by
 * +8h, read the shifted date via the UTC getters (which then represent the
 * HK wall-clock date), compute the boundary in that shifted frame, and shift
 * back to real UTC.
 */

export type CalendarTimeframe = 'week' | 'month';

const HK_OFFSET_MS = 8 * 60 * 60 * 1000;

export type CalendarWindow = {
  /** Inclusive ISO-8601 UTC lower bound. */
  from: string;
  /** Inclusive ISO-8601 UTC upper bound. */
  to: string;
};

/**
 * Returns the UTC window covering the current HK week (Monday 00:00 through
 * Sunday 23:59:59.999) or the current HK calendar month, for the given `now`.
 */
export function calendarWindow(timeframe: CalendarTimeframe, now: Date): CalendarWindow {
  const hk = new Date(now.getTime() + HK_OFFSET_MS);

  if (timeframe === 'week') {
    // getUTCDay on the shifted date = HK weekday; 0 = Sunday.
    const daysSinceMonday = (hk.getUTCDay() + 6) % 7;
    const mondayHkMidnight =
      Date.UTC(hk.getUTCFullYear(), hk.getUTCMonth(), hk.getUTCDate() - daysSinceMonday) -
      HK_OFFSET_MS;
    const nextMondayHkMidnight = mondayHkMidnight + 7 * 24 * 60 * 60 * 1000;
    return {
      from: new Date(mondayHkMidnight).toISOString(),
      to: new Date(nextMondayHkMidnight - 1).toISOString(),
    };
  }

  const firstHkMidnight = Date.UTC(hk.getUTCFullYear(), hk.getUTCMonth(), 1) - HK_OFFSET_MS;
  const nextFirstHkMidnight = Date.UTC(hk.getUTCFullYear(), hk.getUTCMonth() + 1, 1) - HK_OFFSET_MS;
  return {
    from: new Date(firstHkMidnight).toISOString(),
    to: new Date(nextFirstHkMidnight - 1).toISOString(),
  };
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Like {@link calendarWindow}, but shifted by `offset` whole periods so the UI
 * can page into the past / future (offset 0 = current period, -1 = previous,
 * +1 = next). All boundary math stays anchored to the HK wall clock (D7):
 *
 *  - week: shift the anchor by `offset * 7` days, then snap to that week's
 *    Monday..Sunday (adding whole weeks never crosses a DST edge — HK has none —
 *    so the resulting week is exact regardless of the current weekday).
 *  - month: shift the HK calendar month by `offset`, anchoring mid-month/mid-day
 *    so `Date.UTC` month-overflow rolls the year correctly and the +8h HK shift
 *    can never bleed into an adjacent month.
 */
export function calendarWindowAt(
  timeframe: CalendarTimeframe,
  offset: number,
  now: Date,
): CalendarWindow {
  if (timeframe === 'week') {
    return calendarWindow('week', new Date(now.getTime() + offset * WEEK_MS));
  }
  const hk = new Date(now.getTime() + HK_OFFSET_MS);
  const anchor = new Date(Date.UTC(hk.getUTCFullYear(), hk.getUTCMonth() + offset, 15, 12));
  return calendarWindow('month', anchor);
}
