/**
 * SentimentBadge component tests (M6.2b).
 *
 * Two responsibilities split across describe blocks:
 *   1. Behaviour — the badge always exposes the three sentiments with
 *      consistent role + label semantics, regardless of theme or size.
 *   2. A11y — every theme + sentiment + size combination passes axe-core
 *      with the default ruleset (rule 60 §UI primitives a11y gate).
 *
 * Stories use the same `play` patterns, but the CI gate lives here so a
 * regression fails `pnpm test:unit` and blocks the PR per cursor rule 60.
 */

import { render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';

import { SentimentBadge } from './SentimentBadge';

const LABELS = {
  POSITIVE: 'Positive',
  NEUTRAL: 'Neutral',
  NEGATIVE: 'Negative',
} as const;

/**
 * Runs axe-core against the document and asserts zero violations.
 * The default ruleset matches Storybook's addon-a11y so failures
 * surface the same way in both surfaces.
 */
const expectNoAxeViolations = async (container: HTMLElement): Promise<void> => {
  const results = await axe.run(container, {
    rules: {
      // colour-contrast under jsdom is unreliable (no real layout / paint),
      // so it stays Storybook-gated. Everything else (role, name, ARIA
      // semantics, focus order) runs here.
      'color-contrast': { enabled: false },
    },
  });
  expect(results.violations).toEqual([]);
};

describe('SentimentBadge — behaviour', () => {
  it.each([
    ['POSITIVE', 'Positive'],
    ['NEUTRAL', 'Neutral'],
    ['NEGATIVE', 'Negative'],
  ] as const)('renders the %s sentiment with role="status"', (sentiment, label) => {
    render(<SentimentBadge sentiment={sentiment} label={LABELS[sentiment]} />);
    const badge = screen.getByRole('status');
    expect(badge).toHaveAttribute('data-sentiment', sentiment);
    expect(badge).toHaveAccessibleName(label);
    expect(badge).toHaveTextContent(label);
  });

  it('uses the visible label as the accessible name when ariaLabel is omitted', () => {
    render(<SentimentBadge sentiment="POSITIVE" label="讚" />);
    expect(screen.getByRole('status')).toHaveAccessibleName('讚');
  });

  it('lets callers override the accessible name via ariaLabel', () => {
    render(<SentimentBadge sentiment="POSITIVE" label="讚" ariaLabel="評價：讚" />);
    expect(screen.getByRole('status')).toHaveAccessibleName('評價：讚');
  });

  it('renders the icon as decorative (aria-hidden) so the label is the only ARIA name', () => {
    const { container } = render(<SentimentBadge sentiment="POSITIVE" label="Positive" />);
    const icon = container.querySelector('svg');
    expect(icon).not.toBeNull();
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });

  it.each(['semantic', 'neon'] as const)('applies %s-theme tone classes for POSITIVE', (theme) => {
    render(<SentimentBadge sentiment="POSITIVE" label="Positive" theme={theme} />);
    const badge = screen.getByRole('status');
    const className = badge.className;
    if (theme === 'semantic') {
      expect(className).toContain('bg-success/10');
      expect(className).toContain('text-success');
    } else {
      expect(className).toContain('bg-[#00FF88]/15');
      expect(className).toContain('text-[#00FF88]');
    }
  });

  it.each(['xs', 'sm', 'md', 'lg'] as const)('applies size-%s text-class for the chip', (size) => {
    render(<SentimentBadge sentiment="NEUTRAL" label="Neutral" size={size} />);
    const className = screen.getByRole('status').className;
    const expectedSizeFragment =
      size === 'xs'
        ? 'text-[11px]'
        : size === 'sm'
          ? 'text-xs'
          : size === 'md'
            ? 'text-xs'
            : 'text-sm';
    expect(className).toContain(expectedSizeFragment);
  });

  it('merges caller className without dropping primitive classes', () => {
    render(<SentimentBadge sentiment="POSITIVE" label="Positive" className="my-custom-class" />);
    const badge = screen.getByRole('status');
    expect(badge).toHaveClass('my-custom-class');
    expect(badge.className).toContain('inline-flex');
  });
});

describe('SentimentBadge — a11y gate', () => {
  it.each([
    ['semantic', 'POSITIVE'],
    ['semantic', 'NEUTRAL'],
    ['semantic', 'NEGATIVE'],
    ['neon', 'POSITIVE'],
    ['neon', 'NEUTRAL'],
    ['neon', 'NEGATIVE'],
  ] as const)('passes axe for theme=%s sentiment=%s', async (theme, sentiment) => {
    const { container } = render(
      <SentimentBadge sentiment={sentiment} label={LABELS[sentiment]} theme={theme} />,
    );
    await expectNoAxeViolations(container);
  });
});
