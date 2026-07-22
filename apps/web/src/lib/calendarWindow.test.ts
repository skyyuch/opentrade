/**
 * `calendarWindow` unit tests (ADR-0058 D7).
 *
 * The /calendar week/month filters must be computed on the HONG KONG wall
 * clock, not the machine's local timezone or raw UTC — an event at Monday
 * 02:00 HK time is Sunday 18:00 UTC, so a naive UTC week boundary would put
 * it in the wrong week. These tests pin the boundary math with fixed instants.
 */

import { describe, expect, it } from 'vitest';

import { calendarWindow } from './calendarWindow';

describe('calendarWindow — week (HK Monday through Sunday)', () => {
  it('starts the week on HK Monday 00:00 (= Sunday 16:00 UTC)', () => {
    // Wed 2026-07-22 12:00 HK = Wed 04:00 UTC. HK week = Mon 07-20 .. Sun 07-26.
    const window = calendarWindow('week', new Date('2026-07-22T04:00:00.000Z'));
    expect(window.from).toBe('2026-07-19T16:00:00.000Z'); // Mon 07-20 00:00 HK
    expect(window.to).toBe('2026-07-26T15:59:59.999Z'); // Sun 07-26 23:59:59.999 HK
  });

  it('uses the HK date, not the UTC date, at the day boundary', () => {
    // Mon 2026-07-20 02:00 HK = Sun 2026-07-19 18:00 UTC. UTC still says
    // Sunday, but the HK week has already rolled over to Mon 07-20.
    const window = calendarWindow('week', new Date('2026-07-19T18:00:00.000Z'));
    expect(window.from).toBe('2026-07-19T16:00:00.000Z'); // Mon 07-20 00:00 HK
  });

  it('treats HK Sunday as the last day of the week, not the first', () => {
    // Sun 2026-07-26 12:00 HK = Sun 04:00 UTC → still the Mon 07-20 week.
    const window = calendarWindow('week', new Date('2026-07-26T04:00:00.000Z'));
    expect(window.from).toBe('2026-07-19T16:00:00.000Z');
    expect(window.to).toBe('2026-07-26T15:59:59.999Z');
  });
});

describe('calendarWindow — month (HK calendar month)', () => {
  it('covers HK 1st 00:00 through last day 23:59:59.999', () => {
    const window = calendarWindow('month', new Date('2026-07-22T04:00:00.000Z'));
    expect(window.from).toBe('2026-06-30T16:00:00.000Z'); // 07-01 00:00 HK
    expect(window.to).toBe('2026-07-31T15:59:59.999Z'); // 07-31 23:59:59.999 HK
  });

  it('rolls the month on the HK boundary, not the UTC one', () => {
    // 2026-08-01 04:00 HK = 2026-07-31 20:00 UTC — UTC still says July, but
    // the HK month is already August.
    const window = calendarWindow('month', new Date('2026-07-31T20:00:00.000Z'));
    expect(window.from).toBe('2026-07-31T16:00:00.000Z'); // 08-01 00:00 HK
    expect(window.to).toBe('2026-08-31T15:59:59.999Z');
  });

  it('handles the year boundary (HK January window)', () => {
    // 2027-01-01 08:00 HK = 2027-01-01 00:00 UTC.
    const window = calendarWindow('month', new Date('2027-01-01T00:00:00.000Z'));
    expect(window.from).toBe('2026-12-31T16:00:00.000Z'); // 01-01 00:00 HK
    expect(window.to).toBe('2027-01-31T15:59:59.999Z');
  });
});
