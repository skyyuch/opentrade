/**
 * ADR-0053 §6: KOL directory category-filter read-path e2e. The single main
 * flow per cursor rule 60 ("only core flows in e2e"): a visitor browses the
 * KOL directory and narrows it by the two orthogonal category axes
 * (type / focus) plus the "未分類" (null) bucket.
 *
 * Runs fully air-gapped against `e2e/fixtures/api-stub.ts` (no real API, DB,
 * IPFS, Privy, or chain) — the stub serves a three-KOL roster (one
 * FINANCIAL_KOL/EQUITY, one INDICATOR_VENDOR/CRYPTO, one uncategorised). The
 * directory filters client-side over the server-rendered list, so the flow
 * proves the category chips render and each axis (incl. the null bucket)
 * narrows the grid end-to-end through Next.js server render.
 */
import { expect, test } from '@playwright/test';

import { SEED } from './fixtures/api-stub';

test.describe('KOL directory — category filter read-path', () => {
  test('lists every KOL with category chips on the directory', async ({ page }) => {
    await page.goto('/en/kols');

    await expect(page.getByRole('heading', { name: /KOL Directory/ })).toBeVisible();

    await expect(page.getByText(SEED.kolFinancialName)).toBeVisible();
    await expect(page.getByText(SEED.kolVendorName)).toBeVisible();
    await expect(page.getByText(SEED.kolUncategorisedName)).toBeVisible();

    // Category label chips are exhaustively pinned in KolDirectoryClient.test.tsx;
    // here the read-path proves the full roster + count render server-side.
    await expect(page.getByText(`${SEED.kolCount} KOL(s)`)).toBeVisible();
  });

  test('narrows to financial KOLs when the type filter is applied', async ({ page }) => {
    await page.goto('/en/kols');

    await page.getByRole('button', { name: 'Financial KOL' }).click();

    await expect(page.getByText(SEED.kolFinancialName)).toBeVisible();
    await expect(page.getByText(SEED.kolVendorName)).toHaveCount(0);
    await expect(page.getByText(SEED.kolUncategorisedName)).toHaveCount(0);
    await expect(page.getByText(`Showing 1 / ${SEED.kolCount} KOLs`)).toBeVisible();
  });

  test('narrows to crypto-focused KOLs when the focus filter is applied', async ({ page }) => {
    await page.goto('/en/kols');

    await page.getByRole('button', { name: 'Crypto' }).click();

    await expect(page.getByText(SEED.kolVendorName)).toBeVisible();
    await expect(page.getByText(SEED.kolFinancialName)).toHaveCount(0);
    await expect(page.getByText(SEED.kolUncategorisedName)).toHaveCount(0);
  });

  test('isolates the 未分類 (null) bucket when the type NONE filter is applied', async ({
    page,
  }) => {
    await page.goto('/en/kols');

    // "Uncategorised" labels both the type-row and focus-row NONE pills; the
    // type row renders first, so the first match is the type-axis bucket.
    await page.getByRole('button', { name: 'Uncategorised' }).first().click();

    await expect(page.getByText(SEED.kolUncategorisedName)).toBeVisible();
    await expect(page.getByText(SEED.kolFinancialName)).toHaveCount(0);
    await expect(page.getByText(SEED.kolVendorName)).toHaveCount(0);
  });
});
