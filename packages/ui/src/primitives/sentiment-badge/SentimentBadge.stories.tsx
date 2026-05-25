import { expect, within } from '@storybook/test';

import { SentimentBadge } from './SentimentBadge';

import type { Meta, StoryObj } from '@storybook/react';

const zhHantLabels = { POSITIVE: '讚', NEUTRAL: '普通', NEGATIVE: '不好' } as const;
const zhHansLabels = { POSITIVE: '赞', NEUTRAL: '普通', NEGATIVE: '不好' } as const;
const enLabels = { POSITIVE: 'Positive', NEUTRAL: 'Neutral', NEGATIVE: 'Negative' } as const;

const meta = {
  title: 'Primitives / SentimentBadge',
  component: SentimentBadge,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Static read-only verdict chip — the read-surface counterpart to ' +
          '`SentimentPicker` (per ADR-0028 D7). Ships two palettes: `semantic` ' +
          'uses light/dark tokens (preferred for new surfaces), `neon` keeps the ' +
          'existing dark-neon look used by `apps/web` and the dark console screens.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    sentiment: { control: 'inline-radio', options: ['POSITIVE', 'NEUTRAL', 'NEGATIVE'] },
    theme: { control: 'inline-radio', options: ['semantic', 'neon'] },
    size: { control: 'inline-radio', options: ['xs', 'sm', 'md', 'lg'] },
    label: { control: 'text' },
    ariaLabel: { control: 'text' },
  },
  args: {
    sentiment: 'POSITIVE',
    theme: 'semantic',
    size: 'md',
    label: 'Positive',
  },
} satisfies Meta<typeof SentimentBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Positive: Story = {
  args: { sentiment: 'POSITIVE', label: enLabels.POSITIVE },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const badge = canvas.getByRole('status');
    await expect(badge).toHaveAccessibleName(enLabels.POSITIVE);
    await expect(badge).toHaveAttribute('data-sentiment', 'POSITIVE');
  },
};
export const Neutral: Story = {
  args: { sentiment: 'NEUTRAL', label: enLabels.NEUTRAL },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const badge = canvas.getByRole('status');
    await expect(badge).toHaveAccessibleName(enLabels.NEUTRAL);
    await expect(badge).toHaveAttribute('data-sentiment', 'NEUTRAL');
  },
};
export const Negative: Story = {
  args: { sentiment: 'NEGATIVE', label: enLabels.NEGATIVE },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const badge = canvas.getByRole('status');
    await expect(badge).toHaveAccessibleName(enLabels.NEGATIVE);
    await expect(badge).toHaveAttribute('data-sentiment', 'NEGATIVE');
  },
};

export const AllSizes: Story = {
  parameters: { layout: 'padded', controls: { disable: true } },
  render: () => (
    <div className="flex flex-col gap-6">
      {(['xs', 'sm', 'md', 'lg'] as const).map((size) => (
        <div key={size} className="flex items-center gap-4">
          <p className="w-12 font-mono text-xs uppercase text-muted-foreground">{size}</p>
          <SentimentBadge sentiment="POSITIVE" label={enLabels.POSITIVE} size={size} />
          <SentimentBadge sentiment="NEUTRAL" label={enLabels.NEUTRAL} size={size} />
          <SentimentBadge sentiment="NEGATIVE" label={enLabels.NEGATIVE} size={size} />
        </div>
      ))}
    </div>
  ),
};

export const AllThemes: Story = {
  parameters: { layout: 'padded', controls: { disable: true } },
  render: () => (
    <div className="flex flex-col gap-6">
      {(['semantic', 'neon'] as const).map((theme) => (
        <div key={theme} className="flex items-center gap-4">
          <p className="w-20 font-mono text-xs uppercase text-muted-foreground">{theme}</p>
          <SentimentBadge sentiment="POSITIVE" label={enLabels.POSITIVE} theme={theme} />
          <SentimentBadge sentiment="NEUTRAL" label={enLabels.NEUTRAL} theme={theme} />
          <SentimentBadge sentiment="NEGATIVE" label={enLabels.NEGATIVE} theme={theme} />
        </div>
      ))}
    </div>
  ),
};

/**
 * Side-by-side locales so designers can verify CJK punctuation,
 * line-length, and ascender / descender clearance against the three
 * locales OpenTrade ships (zh-Hant default, zh-Hans, en).
 */
export const Localised: Story = {
  parameters: { layout: 'padded', controls: { disable: true } },
  render: () => (
    <div className="flex flex-col gap-6">
      {(
        [
          ['zh-Hant', zhHantLabels],
          ['zh-Hans', zhHansLabels],
          ['en', enLabels],
        ] as const
      ).map(([locale, labels]) => (
        <div key={locale} className="flex items-center gap-4">
          <p className="w-20 font-mono text-xs uppercase text-muted-foreground">{locale}</p>
          <SentimentBadge sentiment="POSITIVE" label={labels.POSITIVE} />
          <SentimentBadge sentiment="NEUTRAL" label={labels.NEUTRAL} />
          <SentimentBadge sentiment="NEGATIVE" label={labels.NEGATIVE} />
        </div>
      ))}
    </div>
  ),
};

/**
 * Neon theme on the merchant-console dark card surface — the palette is
 * not token-driven so it won't react to a global `dark` class. This
 * story confirms the hardcoded neon hues stay legible against the
 * intended dark backdrop.
 */
export const NeonOnDarkSurface: Story = {
  parameters: { layout: 'padded', controls: { disable: true } },
  decorators: [
    (StoryComp) => (
      <div className="dark rounded-lg bg-background p-8">
        <StoryComp />
      </div>
    ),
  ],
  render: () => (
    <div className="flex items-center gap-4">
      <SentimentBadge sentiment="POSITIVE" label={enLabels.POSITIVE} theme="neon" />
      <SentimentBadge sentiment="NEUTRAL" label={enLabels.NEUTRAL} theme="neon" />
      <SentimentBadge sentiment="NEGATIVE" label={enLabels.NEGATIVE} theme="neon" />
    </div>
  ),
};

/**
 * Semantic theme on the dark card surface — verifies the success /
 * danger / muted tokens flip correctly so the badge stays legible
 * after the consumer toggles dark mode (important for `apps/console`).
 */
export const SemanticOnDarkSurface: Story = {
  parameters: { layout: 'padded', controls: { disable: true } },
  decorators: [
    (StoryComp) => (
      <div className="dark rounded-lg bg-background p-8">
        <StoryComp />
      </div>
    ),
  ],
  render: () => (
    <div className="flex items-center gap-4">
      <SentimentBadge sentiment="POSITIVE" label={enLabels.POSITIVE} theme="semantic" />
      <SentimentBadge sentiment="NEUTRAL" label={enLabels.NEUTRAL} theme="semantic" />
      <SentimentBadge sentiment="NEGATIVE" label={enLabels.NEGATIVE} theme="semantic" />
    </div>
  ),
};

/**
 * In-context demo — the badge as it appears inside a `<ReviewCard>`
 * shell, plus the surface-local legacy-rating caption for the
 * pre-backfill null-sentiment case (per ADR-0028 D7). Acts as both a
 * design reference and a copy-paste template for how callers should
 * guard `review.sentiment === null`.
 */
export const InContext: Story = {
  parameters: { layout: 'centered', controls: { disable: true } },
  render: () => (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold">Alice Wong</p>
          <p className="text-xs text-muted-foreground">2026-05-25</p>
        </div>
        <SentimentBadge
          sentiment="POSITIVE"
          label={enLabels.POSITIVE}
          ariaLabel="Verdict: Positive"
        />
      </div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold">Bob Lam</p>
          <p className="text-xs text-muted-foreground">2025-09-12 (pre-backfill)</p>
        </div>
        <span
          className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground"
          title="This review was submitted before the five-star axis was retired; the legacy score is shown for reference only."
        >
          Legacy rating: 4
        </span>
      </div>
    </div>
  ),
};
