/**
 * ADR-0058 §6: economic-calendar read-path e2e. The single main flow per
 * cursor rule 60 ("only core flows in e2e"): a visitor opens /calendar, sees
 * the chronological event list server-rendered for the current HK week
 * (released + upcoming rows with official facts only), narrows it with a
 * region filter chip, and can cross over to /news via the D8 link.
 *
 * Runs fully air-gapped against `e2e/fixtures/api-stub.ts` (no real API, DB,
 * or chain) — the stub serves one released (actualValue backfilled) and one
 * upcoming (actualValue null) event, generated relative to "now" so both
 * always fall inside the default week window, and honours the
 * region/category query filters so the chip refetch is observable.
 */
import { expect, test } from '@playwright/test';

import { SEED } from './fixtures/api-stub';

test.describe('Economic calendar — read-path', () => {
  test('server-renders the week view with released and upcoming events', async ({ page }) => {
    await page.goto('/en/calendar');

    await expect(page.getByRole('heading', { name: 'Economic Calendar' })).toBeVisible();

    await expect(page.getByText(SEED.calendarReleasedNameEn)).toBeVisible();
    await expect(page.getByText(SEED.calendarUpcomingNameEn)).toBeVisible();
    await expect(page.getByText(`Showing ${SEED.calendarEventCount} events`)).toBeVisible();

    // Upcoming vs released is keyed on the post-release actualValue backfill
    // (ADR-0058 D3) — both states must be visible on the seeded page.
    await expect(page.getByText('Released')).toBeVisible();
    await expect(page.getByText('Upcoming')).toBeVisible();

    // Compliance surface (D1): the per-page disclaimer renders on every view.
    await expect(page.getByText(/do not constitute investment advice/)).toBeVisible();
  });

  test('narrows the list when a region filter chip is applied', async ({ page }) => {
    await page.goto('/en/calendar');
    await expect(page.getByText(SEED.calendarReleasedNameEn)).toBeVisible();

    await page.getByRole('button', { name: 'Hong Kong' }).click();

    await expect(page.getByText(SEED.calendarUpcomingNameEn)).toBeVisible();
    await expect(page.getByText(SEED.calendarReleasedNameEn)).toHaveCount(0);
  });

  test('links out to /news via the calendar↔news cross-link (D8)', async ({ page }) => {
    await page.goto('/en/calendar');

    await page.getByRole('link', { name: 'Browse financial news' }).click();

    await expect(page).toHaveURL(/\/en\/news$/);
    await expect(page.getByRole('heading', { name: 'Financial News' })).toBeVisible();
  });

  test('is reachable from the header navigation', async ({ page }) => {
    await page.goto('/en/news');

    await page.getByRole('banner').getByRole('link', { name: 'Calendar' }).click();

    await expect(page).toHaveURL(/\/en\/calendar$/);
    await expect(page.getByRole('heading', { name: 'Economic Calendar' })).toBeVisible();
  });
});
