/**
 * ADR-0045 §6: bullion-dealer (CGSE) list → detail → tab-switch read-path
 * e2e. The single main flow per cursor rule 60 ("only core flows in e2e"):
 * a visitor browses the bullion directory, opens a dealer, and moves through
 * the slim 會籍 / 評論 / 投訴 tab set the Google-swapped UI ships for bullion.
 *
 * Runs fully air-gapped against `e2e/fixtures/api-stub.ts` (no real API, DB,
 * IPFS, Privy, or chain) — the stub serves the `?category=BULLION` list, the
 * `cgse-009` detail, its reviews, and an empty complaint list. The flow
 * proves the bullion vertical wires end-to-end through Next.js server render:
 * the category-pinned grid, the namespaced `/bullion-dealers/:slug` route,
 * the CGSE membership header pill, and the bullion-only tab variant.
 */
import { expect, test } from '@playwright/test';

import { SEED } from './fixtures/api-stub';

test.describe('Bullion dealer — read-path', () => {
  test('lists CGSE members on the bullion directory', async ({ page }) => {
    await page.goto('/en/bullion-dealers');

    await expect(page.getByRole('heading', { name: /Bullion Dealers/ })).toBeVisible();
    // The card renders the CGSE 行員 number as its headline trust badge and
    // links to the namespaced bullion route (never the securities /brokers/).
    await expect(page.getByText('CGSE Member 009')).toBeVisible();
    const card = page.getByRole('link', { name: /Heng Fung Bullion/ });
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute('href', `/en/bullion-dealers/${SEED.bullionSlug}`);
  });

  test('navigates to the dealer detail and shows the CGSE membership header', async ({ page }) => {
    await page.goto('/en/bullion-dealers');
    await page.getByRole('link', { name: /Heng Fung Bullion/ }).click();

    await expect(page).toHaveURL(new RegExp(`/en/bullion-dealers/${SEED.bullionSlug}$`));
    await expect(page.getByRole('link', { name: /Back to bullion dealers/ })).toBeVisible();
    // The header carries the CGSE membership pill (number from the license).
    await expect(page.getByText(`CGSE Member ${SEED.bullionMemberNumber}`)).toBeVisible();
  });

  test('renders the bullion-only tab set (no SFC licence tab)', async ({ page }) => {
    await page.goto(`/en/bullion-dealers/${SEED.bullionSlug}`);

    await expect(page.getByRole('button', { name: 'Membership' })).toBeVisible();
    await expect(page.getByRole('button', { name: /On-chain Reviews \(1\)/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Complaints/ })).toBeVisible();
    // CGSE carries no regulated-activity detail, so the SFC licence tab,
    // related-KOL tab, and arbitration tab are absent for bullion.
    await expect(page.getByRole('button', { name: 'SFC Licence Data' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Related KOLs' })).toHaveCount(0);
  });

  test('switches between Membership and Complaints tabs', async ({ page }) => {
    await page.goto(`/en/bullion-dealers/${SEED.bullionSlug}`);

    await page.getByRole('button', { name: 'Membership' }).click();
    await expect(page.getByText('CGSE Membership Record')).toBeVisible();
    await expect(page.getByText(SEED.bullionMemberNumber, { exact: true })).toBeVisible();
    await expect(page.getByText('Active member')).toBeVisible();
    // Per rule 00 red line: the self-regulatory disclaimer is always present.
    await expect(page.getByText('Investment risk & disclaimer')).toBeVisible();

    await page.getByRole('button', { name: /Complaints/ }).click();
    await expect(page.getByText('No complaints yet')).toBeVisible();
  });
});
