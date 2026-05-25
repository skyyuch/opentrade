import { expect, fn, userEvent, within } from '@storybook/test';
import { useState } from 'react';

import { SentimentPicker, type Sentiment } from './SentimentPicker';

import type { Meta, StoryObj } from '@storybook/react';

const enLabels = { positive: 'Positive', neutral: 'Neutral', negative: 'Negative' };
const zhHantLabels = { positive: '讚', neutral: '普通', negative: '不好' };
const zhHansLabels = { positive: '赞', neutral: '普通', negative: '不好' };

const noop = (_next: Sentiment): void => {
  return;
};

const meta = {
  title: 'Primitives / SentimentPicker',
  component: SentimentPicker,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Three-way verdict picker that replaces the legacy five-star widget (per ADR-0028 D7). ' +
          'POSITIVE / NEUTRAL / NEGATIVE map to the existing success / muted / danger semantic ' +
          'tokens so the picker theme-switches with the rest of the UI. Labels are caller-supplied ' +
          'so `packages/ui` stays free of i18n dependencies — apps resolve strings via next-intl ' +
          'and pipe them through the `labels` prop.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    value: {
      control: 'select',
      options: [null, 'POSITIVE', 'NEUTRAL', 'NEGATIVE'],
    },
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
    disabled: { control: 'boolean' },
    groupLabel: { control: 'text' },
    onChange: { action: 'changed' },
  },
  args: {
    value: null,
    onChange: noop,
    size: 'md',
    disabled: false,
    groupLabel: 'Your verdict',
    labels: enLabels,
  },
} satisfies Meta<typeof SentimentPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'No verdict yet — the ReviewForm submit button must stay disabled in this state ' +
          '(per ADR-0028 D4 sentiment is required at submit time).',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const group = canvas.getByRole('radiogroup');
    await expect(group).toHaveAccessibleName('Your verdict');
    for (const name of ['Positive', 'Neutral', 'Negative']) {
      await expect(canvas.getByRole('radio', { name })).toHaveAttribute('aria-checked', 'false');
    }
  },
};

export const Positive: Story = {
  args: { value: 'POSITIVE' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('radio', { name: 'Positive' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(canvas.getByRole('radio', { name: 'Neutral' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  },
};
export const Neutral: Story = {
  args: { value: 'NEUTRAL' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('radio', { name: 'Neutral' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  },
};
export const Negative: Story = {
  args: { value: 'NEGATIVE' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('radio', { name: 'Negative' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  },
};

/**
 * Click-through smoke test — clicks each radio in turn and asserts the
 * onChange spy receives the matching sentiment. This is the canonical
 * "the picker is wired correctly" story for designers + QA who want
 * proof without spinning up `apps/web`. The same expectations are
 * locked down in `SentimentPicker.test.tsx` as the CI gate.
 */
export const ClickEachOption: Story = {
  args: { value: null, onChange: fn() },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('radio', { name: 'Positive' }));
    await userEvent.click(canvas.getByRole('radio', { name: 'Neutral' }));
    await userEvent.click(canvas.getByRole('radio', { name: 'Negative' }));
    await expect(args.onChange).toHaveBeenNthCalledWith(1, 'POSITIVE');
    await expect(args.onChange).toHaveBeenNthCalledWith(2, 'NEUTRAL');
    await expect(args.onChange).toHaveBeenNthCalledWith(3, 'NEGATIVE');
  },
};

export const AllSizes: Story = {
  parameters: { layout: 'padded', controls: { disable: true } },
  render: () => (
    <div className="flex flex-col gap-6">
      {(['sm', 'md', 'lg'] as const).map((size) => (
        <div key={size} className="flex items-center gap-4">
          <p className="w-12 font-mono text-xs uppercase text-muted-foreground">{size}</p>
          <SentimentPicker
            value="POSITIVE"
            onChange={noop}
            labels={enLabels}
            groupLabel="Your verdict"
            size={size}
          />
        </div>
      ))}
    </div>
  ),
};

export const Disabled: Story = {
  args: { value: 'POSITIVE', disabled: true },
};

/**
 * Stories render the localised labels side-by-side so designers can verify
 * line-length, CJK punctuation and ascender / descender clearance against the
 * three locales OpenTrade ships (zh-Hant default, zh-Hans, en).
 */
export const Localised: Story = {
  parameters: { layout: 'padded', controls: { disable: true } },
  render: () => (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <p className="w-20 font-mono text-xs uppercase text-muted-foreground">zh-Hant</p>
        <SentimentPicker
          value="POSITIVE"
          onChange={noop}
          labels={zhHantLabels}
          groupLabel="您的評價"
        />
      </div>
      <div className="flex items-center gap-4">
        <p className="w-20 font-mono text-xs uppercase text-muted-foreground">zh-Hans</p>
        <SentimentPicker
          value="NEUTRAL"
          onChange={noop}
          labels={zhHansLabels}
          groupLabel="您的评价"
        />
      </div>
      <div className="flex items-center gap-4">
        <p className="w-20 font-mono text-xs uppercase text-muted-foreground">en</p>
        <SentimentPicker
          value="NEGATIVE"
          onChange={noop}
          labels={enLabels}
          groupLabel="Your verdict"
        />
      </div>
    </div>
  ),
};

/**
 * Renders on dark surface so designers can confirm the three semantic tones
 * keep enough contrast against the dark merchant console palette.
 */
export const DarkSurface: Story = {
  parameters: { layout: 'padded', controls: { disable: true } },
  decorators: [
    (StoryComp) => (
      <div className="dark rounded-lg bg-background p-8">
        <StoryComp />
      </div>
    ),
  ],
  render: () => (
    <div className="flex flex-col gap-6">
      {(['POSITIVE', 'NEUTRAL', 'NEGATIVE', null] as const).map((selected) => (
        <div key={String(selected)} className="flex items-center gap-4">
          <p className="w-20 font-mono text-xs uppercase text-muted-foreground">
            {selected ?? 'empty'}
          </p>
          <SentimentPicker
            value={selected}
            onChange={noop}
            labels={enLabels}
            groupLabel="Your verdict"
          />
        </div>
      ))}
    </div>
  ),
};

const InteractiveDemo = () => {
  const [value, setValue] = useState<Sentiment | null>(null);
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-6">
      <p className="text-sm font-medium">Your verdict</p>
      <SentimentPicker
        value={value}
        onChange={setValue}
        labels={enLabels}
        groupLabel="Your verdict"
      />
      <p className="font-mono text-xs text-muted-foreground">
        value: {value ?? 'null (submit disabled)'}
      </p>
    </div>
  );
};

/**
 * In-context demo — the picker as it appears inside the ReviewForm card, with
 * a live `value` readout so designers / QA can verify the controlled-state
 * behaviour without spinning up `apps/web`.
 */
export const InContext: Story = {
  parameters: { layout: 'centered', controls: { disable: true } },
  render: () => <InteractiveDemo />,
};
