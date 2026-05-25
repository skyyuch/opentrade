/**
 * SentimentPicker component tests (M6.2b).
 *
 * Coverage is split across three describe blocks:
 *   1. Rendering — radio group + three options always present, ARIA
 *      checked state reflects the controlled `value` prop.
 *   2. Interaction — clicking + keyboard activation call `onChange`
 *      with the right sentiment; disabled state suppresses callbacks.
 *   3. A11y — axe-core runs against empty, selected, and disabled
 *      states. colour-contrast is left to Storybook (no paint layer
 *      under jsdom — see SentimentBadge.test.tsx for the same caveat).
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { describe, expect, it, vi } from 'vitest';

import { SentimentPicker, type Sentiment } from './SentimentPicker';

const LABELS = { positive: 'Positive', neutral: 'Neutral', negative: 'Negative' };

const expectNoAxeViolations = async (container: HTMLElement): Promise<void> => {
  const results = await axe.run(container, {
    rules: { 'color-contrast': { enabled: false } },
  });
  expect(results.violations).toEqual([]);
};

describe('SentimentPicker — rendering', () => {
  it('renders a radiogroup with three labelled options', () => {
    render(
      <SentimentPicker value={null} onChange={vi.fn()} labels={LABELS} groupLabel="Verdict" />,
    );
    const group = screen.getByRole('radiogroup', { name: 'Verdict' });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Positive' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Neutral' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Negative' })).toBeInTheDocument();
  });

  it.each([
    ['POSITIVE', 'Positive'],
    ['NEUTRAL', 'Neutral'],
    ['NEGATIVE', 'Negative'],
  ] as const)('marks %s as aria-checked when value=%s', (value, label) => {
    render(
      <SentimentPicker value={value} onChange={vi.fn()} labels={LABELS} groupLabel="Verdict" />,
    );
    expect(screen.getByRole('radio', { name: label })).toHaveAttribute('aria-checked', 'true');
    const others = (['Positive', 'Neutral', 'Negative'] as const).filter((l) => l !== label);
    for (const otherLabel of others) {
      expect(screen.getByRole('radio', { name: otherLabel })).toHaveAttribute(
        'aria-checked',
        'false',
      );
    }
  });

  it('marks all options as aria-checked=false when value is null (empty state)', () => {
    render(
      <SentimentPicker value={null} onChange={vi.fn()} labels={LABELS} groupLabel="Verdict" />,
    );
    for (const label of ['Positive', 'Neutral', 'Negative']) {
      expect(screen.getByRole('radio', { name: label })).toHaveAttribute('aria-checked', 'false');
    }
  });

  it('localises labels via the labels prop (zh-Hant)', () => {
    render(
      <SentimentPicker
        value={null}
        onChange={vi.fn()}
        labels={{ positive: '讚', neutral: '普通', negative: '不好' }}
        groupLabel="您的評價"
      />,
    );
    expect(screen.getByRole('radiogroup', { name: '您的評價' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '讚' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '普通' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '不好' })).toBeInTheDocument();
  });
});

describe('SentimentPicker — interaction', () => {
  it.each([
    ['Positive', 'POSITIVE'],
    ['Neutral', 'NEUTRAL'],
    ['Negative', 'NEGATIVE'],
  ] as const)('calls onChange("%s") when the user clicks %s', async (label, expected) => {
    const onChange = vi.fn<(next: Sentiment) => void>();
    render(
      <SentimentPicker value={null} onChange={onChange} labels={LABELS} groupLabel="Verdict" />,
    );
    await userEvent.click(screen.getByRole('radio', { name: label }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith(expected);
  });

  it('does not call onChange when the picker is disabled', async () => {
    const onChange = vi.fn<(next: Sentiment) => void>();
    render(
      <SentimentPicker
        value={null}
        onChange={onChange}
        labels={LABELS}
        groupLabel="Verdict"
        disabled
      />,
    );
    await userEvent.click(screen.getByRole('radio', { name: 'Positive' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('lets the user switch the selected option (controlled flow)', async () => {
    const onChange = vi.fn<(next: Sentiment) => void>();
    render(
      <SentimentPicker value="POSITIVE" onChange={onChange} labels={LABELS} groupLabel="Verdict" />,
    );
    await userEvent.click(screen.getByRole('radio', { name: 'Negative' }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith('NEGATIVE');
  });

  it('activates the focused option with Space (native button behaviour)', async () => {
    const onChange = vi.fn<(next: Sentiment) => void>();
    render(
      <SentimentPicker value={null} onChange={onChange} labels={LABELS} groupLabel="Verdict" />,
    );
    const neutral = screen.getByRole('radio', { name: 'Neutral' });
    neutral.focus();
    await userEvent.keyboard(' ');
    expect(onChange).toHaveBeenCalledExactlyOnceWith('NEUTRAL');
  });
});

describe('SentimentPicker — a11y gate', () => {
  it('passes axe in the empty state', async () => {
    const { container } = render(
      <SentimentPicker value={null} onChange={vi.fn()} labels={LABELS} groupLabel="Verdict" />,
    );
    await expectNoAxeViolations(container);
  });

  it.each(['POSITIVE', 'NEUTRAL', 'NEGATIVE'] as const)(
    'passes axe with %s selected',
    async (value) => {
      const { container } = render(
        <SentimentPicker value={value} onChange={vi.fn()} labels={LABELS} groupLabel="Verdict" />,
      );
      await expectNoAxeViolations(container);
    },
  );

  it('passes axe when disabled', async () => {
    const { container } = render(
      <SentimentPicker
        value="POSITIVE"
        onChange={vi.fn()}
        labels={LABELS}
        groupLabel="Verdict"
        disabled
      />,
    );
    await expectNoAxeViolations(container);
  });
});
