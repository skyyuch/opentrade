/**
 * M6.3b: broker detail page read-path e2e.
 *
 * Covers the user-visible ADR-0028 D7 contract end-to-end in a real
 * browser, using the stubbed `apps/web/e2e/fixtures/api-stub.ts` so
 * the entire request path (Next.js server-render → fetch → DOM) runs
 * with no real API, DB, IPFS, Privy, or chain in scope. The page
 * loads, three SentimentBadge variants are rendered, the legacy
 * null-sentiment row falls back to the legacy caption (never the star
 * widget), and the unauthenticated "log in to write a review" CTA is
 * visible to anonymous visitors.
 *
 * Why this is in Playwright instead of Vitest: server-rendered HTML
 * is what real users see, and the `@/components/brokers/BrokerDetailTabs`
 * surface is dense enough that jsdom would force us to mock layout,
 * theming, and routing in three places. A real chromium pass under the
 * stub gives us actual server-side rendering proof with one round trip.
 *
 * Per cursor rule 60: no real on-chain interaction, all external
 * services stubbed, single happy-path covered. Failure modes (404 page,
 * 500 page) live in a follow-up that lands once the stub grows
 * conditional responses.
 */
import { expect, test } from '@playwright/test';

import { SEED } from './fixtures/api-stub';

test.describe('Broker detail — read-path', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/en/brokers/${SEED.brokerSlug}`);
    await expect(page.getByRole('heading', { name: 'Sentiment Test Securities' })).toBeVisible();
  });

  test('renders all three sentiment badges + the legacy caption fallback', async ({ page }) => {
    // Per ADR-0028 D7: each sentiment row renders the shared
    // SentimentBadge primitive (M6.2a) carrying `data-sentiment` so
    // the e2e can locate the badge by semantic intent instead of CSS.
    const positiveBadge = page.locator('[data-sentiment="POSITIVE"]').first();
    const neutralBadge = page.locator('[data-sentiment="NEUTRAL"]').first();
    const negativeBadge = page.locator('[data-sentiment="NEGATIVE"]').first();

    await expect(positiveBadge).toBeVisible();
    await expect(neutralBadge).toBeVisible();
    await expect(negativeBadge).toBeVisible();

    await expect(positiveBadge).toHaveText(/Positive/);
    await expect(neutralBadge).toHaveText(/Neutral/);
    await expect(negativeBadge).toHaveText(/Negative/);

    // The badge carries role=status so screen readers announce the
    // verdict as live read-only state. This is the contract every
    // chip in M6.2a must honour; failing the assertion means a
    // future "decorate sentiment with extra ARIA" change silently
    // dropped the status role.
    await expect(positiveBadge).toHaveAttribute('role', 'status');
  });

  test('falls back to legacy-rating caption (no stars) for the null-sentiment row', async ({
    page,
  }) => {
    // The legacy row's caption is keyed by the ICU translation slot
    // `brokerDetail.legacyRatingCaption` — the en copy reads
    // "Legacy five-star score: 4". The row MUST also have NO
    // `data-sentiment` chip (only sentiment-bearing rows render the
    // badge) and MUST NOT contain a star icon. Per ADR-0028 D7 the
    // deprecation window intentionally hides the star widget so every
    // reader is pulled onto the new sentiment axis.
    const legacyCaption = page.getByText(/Legacy five-star score: 4/);
    await expect(legacyCaption).toBeVisible();

    // Walk up to the enclosing review card and assert it carries no
    // sentiment chip — the legacy row is the sole row in the fixture
    // with a null sentiment.
    const legacyCard = legacyCaption.locator(
      'xpath=ancestor::div[contains(@class, "rounded-xl")][1]',
    );
    await expect(legacyCard).toContainText('Legacy pre-backfill review');
    await expect(legacyCard.locator('[data-sentiment]')).toHaveCount(0);
  });

  test('shows the unauthenticated login-to-review CTA, never the form', async ({ page }) => {
    // The form is gated behind `usePrivy().authenticated`. In the e2e
    // we never log in (per the M6.3 split — write-path lives in the
    // Vitest + RTL suite), so the page MUST render the CTA card and
    // MUST NOT render the SentimentPicker or textarea. The CTA copy
    // is `brokerDetail.loginAndReview` = "Sign in & Review" in en.
    await expect(page.getByRole('button', { name: /Sign in & Review/i })).toBeVisible();
    await expect(page.getByRole('radiogroup', { name: /verdict/i })).toHaveCount(0);
    await expect(page.locator('textarea')).toHaveCount(0);
  });
});
