/**
 * M7.7: broker detail complaints-tab read-path e2e.
 *
 * Covers the user-visible ADR-0029 D4 contract end-to-end in a real
 * browser, using the same `apps/web/e2e/fixtures/api-stub.ts` that
 * already backs `broker-detail-read-path.spec.ts`. The stub fixture
 * was extended with a 3-row `complaints` array (one VERIFIED, one
 * REJECTED, one OPEN) so this spec asserts every status badge a
 * reader can see on the third tab.
 *
 * Why Playwright and not Vitest: the third-tab gating + summary card
 * + per-row badge composition is a server-render + client-toggle
 * dance, and the M7.6b tab bar / red pill / adminNote block live in
 * the dense `BrokerDetailTabs.tsx` surface. A real chromium pass
 * gives us actual SSR proof in one round-trip. The write-path (the
 * /complaints/new form) stays in `ComplaintForm.test.tsx` (Vitest +
 * RTL) per the M6.3 split — Privy OAuth would force a brittle
 * fixture.
 *
 * Per cursor rule 60 § E2E rules: no real on-chain interaction, all
 * external services stubbed (Pinata / Privy / chain never touched);
 * single happy-path covered.
 */

import { expect, test } from '@playwright/test';

import { SEED } from './fixtures/api-stub';

test.describe('Broker detail — complaints tab read-path', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/en/brokers/${SEED.brokerSlug}`);
    await expect(page.getByRole('heading', { name: 'Sentiment Test Securities' })).toBeVisible();
  });

  test('shows the verifiedComplaintCount red pill in the tab bar and lets the user open the tab', async ({
    page,
  }) => {
    // The complaints tab carries a pill that goes red when > 0
    // verified complaints exist. The fixture seeds 1 VERIFIED row so
    // the pill should render text="1" with the danger variant
    // (red text + red border). Per M7.6b the pill's `title` carries
    // the localised tooltip — we grab it via role=button to ensure
    // we're matching the actual tab control, not the headline number.
    const tab = page.getByRole('button', { name: /Complaints/ });
    await expect(tab).toBeVisible();
    // The pill is a child <span> with the count text "1".
    const pill = tab.locator('span').filter({ hasText: String(SEED.verifiedComplaintCount) });
    await expect(pill).toBeVisible();
    // Click into the tab — the summary headline + first card should
    // become visible.
    await tab.click();
    await expect(page.getByText('Verified Complaints')).toBeVisible();
  });

  test('renders all three status badges and inlines the adminNote on the rejected row', async ({
    page,
  }) => {
    // Open the third tab first (default is Reviews).
    await page.getByRole('button', { name: /Complaints/ }).click();

    // Every fixture row shows up.
    await expect(page.getByText('Phantom trades on July statement')).toBeVisible();
    await expect(page.getByText('Withdrawal fees too high')).toBeVisible();
    await expect(page.getByText('Order rejected without reason')).toBeVisible();

    // Status badges — one of each. Per M7.6b the badge labels come
    // straight from `complaintCard.status*` so they are stable copy
    // we can assert against.
    await expect(page.getByText('Verified by Platform').first()).toBeVisible();
    await expect(page.getByText('Reviewed — Not Substantiated').first()).toBeVisible();
    await expect(page.getByText('Under Review').first()).toBeVisible();

    // Per ADR-0029 D4 the rejected row carries the platform's
    // explanation inline. The fixture seeds a long adminNote so we
    // assert a substring rather than the entire blob.
    await expect(page.getByText('Platform note on rejection')).toBeVisible();
    await expect(page.getByText(/disclosed in the broker tariff schedule/)).toBeVisible();

    // Per rule 00 «reject != delete»: even the rejected row's body
    // stays visible — only the verdict badge differs.
    await expect(page.getByText('Broker charged 2% withdrawal fee')).toBeVisible();
  });

  test('"File a complaint" CTA links to the new-complaint page for this broker', async ({
    page,
  }) => {
    await page.getByRole('button', { name: /Complaints/ }).click();
    // The CTA inside the summary card is an <a> rendered via the
    // locale-aware <Link>. It must point at /en/brokers/:slug/complaints/new
    // (the en locale prefix gets prepended by next-intl).
    const cta = page.getByRole('link', { name: /File a complaint/ });
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute('href', `/en/brokers/${SEED.brokerSlug}/complaints/new`);
  });
});
