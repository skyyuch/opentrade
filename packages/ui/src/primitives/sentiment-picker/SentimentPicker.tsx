import { cva, type VariantProps } from 'class-variance-authority';
import { Minus, ThumbsDown, ThumbsUp } from 'lucide-react';
import { type ReactNode } from 'react';

import { cn } from '../../utils/cn';

/**
 * SentimentPicker — three-way verdict toggle group used in the review submit
 * form to replace the legacy five-star widget (per ADR-0028 D7).
 *
 * Visual language follows the existing semantic tokens so light + dark theme
 * switching keeps working: `success` (emerald) for POSITIVE, `muted` (slate)
 * for NEUTRAL, `danger` (vermilion) for NEGATIVE. Per cursor rule 22 we never
 * hard-code hex colours in component-layer code; the colour mapping is in the
 * cva variant table below.
 *
 * Behaviour:
 *   - Selected option is bordered + filled at low opacity to read as a single
 *     toggled chip rather than a button cluster.
 *   - Unselected options stay outline-only so the picker keeps a neutral
 *     resting state — important because reviewers MUST make an explicit
 *     verdict (no implicit default in ADR-0028 D4).
 *   - Keyboard: native focus order across the three buttons; Space / Enter
 *     fires onClick (browser default). Arrow-key navigation deliberately
 *     left to native focus since each option is its own button — same
 *     pattern used by shadcn's Toggle Group when not in `single` controlled
 *     mode.
 *
 * Accessibility: rendered as `role="radiogroup"` with `aria-label`; each
 * option is `role="radio"` + `aria-checked`. The visible label (icon + text)
 * doubles as the accessible name, no extra aria-labelledby needed.
 *
 * Labels are passed in (not read from next-intl) so packages/ui stays free
 * of framework dependencies — same pattern as `SbtBadge`. Callers in
 * `apps/web` / `apps/console` resolve the three strings via `useTranslations`
 * and pipe them through `labels`.
 */

export type Sentiment = 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';

const optionVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 rounded-full border font-medium',
    'transition-colors duration-fast ease-out',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    'disabled:cursor-not-allowed disabled:opacity-50',
    'select-none',
  ],
  {
    variants: {
      tone: {
        positive: '',
        neutral: '',
        negative: '',
      },
      selected: { true: '', false: '' },
      size: {
        sm: 'h-8 gap-1.5 px-3 text-xs',
        md: 'h-10 gap-2 px-4 text-sm',
        lg: 'h-12 gap-2.5 px-5 text-base',
      },
    },
    compoundVariants: [
      {
        tone: 'positive',
        selected: true,
        class: 'border-success/60 bg-success/15 text-success',
      },
      {
        tone: 'positive',
        selected: false,
        class:
          'border-border bg-transparent text-muted-foreground hover:border-success/40 hover:text-success',
      },
      {
        tone: 'neutral',
        selected: true,
        class: 'border-muted-foreground/50 bg-muted/60 text-foreground',
      },
      {
        tone: 'neutral',
        selected: false,
        class:
          'border-border bg-transparent text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground',
      },
      {
        tone: 'negative',
        selected: true,
        class: 'border-danger/60 bg-danger/15 text-danger',
      },
      {
        tone: 'negative',
        selected: false,
        class:
          'border-border bg-transparent text-muted-foreground hover:border-danger/40 hover:text-danger',
      },
    ],
    defaultVariants: {
      tone: 'neutral',
      selected: false,
      size: 'md',
    },
  },
);

const iconSize = { sm: 'size-3.5', md: 'size-4', lg: 'size-5' } as const;

export type SentimentPickerLabels = {
  positive: string;
  neutral: string;
  negative: string;
};

export type SentimentPickerProps = {
  /** Currently selected sentiment, or `null` for the "no verdict yet" state. */
  value: Sentiment | null;
  /** Called when the user picks an option. */
  onChange: (next: Sentiment) => void;
  /** Localised button labels — caller resolves via next-intl. */
  labels: SentimentPickerLabels;
  /** Accessible group label (e.g. "您的評價"). */
  groupLabel: string;
  /** Defaults to `md`. */
  size?: VariantProps<typeof optionVariants>['size'];
  /** Disable the entire group (e.g. while submitting). */
  disabled?: boolean;
  className?: string;
};

const OPTIONS: readonly {
  value: Sentiment;
  tone: 'positive' | 'neutral' | 'negative';
  Icon: typeof ThumbsUp;
  labelKey: keyof SentimentPickerLabels;
}[] = [
  { value: 'POSITIVE', tone: 'positive', Icon: ThumbsUp, labelKey: 'positive' },
  { value: 'NEUTRAL', tone: 'neutral', Icon: Minus, labelKey: 'neutral' },
  { value: 'NEGATIVE', tone: 'negative', Icon: ThumbsDown, labelKey: 'negative' },
];

export const SentimentPicker = ({
  value,
  onChange,
  labels,
  groupLabel,
  size = 'md',
  disabled = false,
  className,
}: SentimentPickerProps): ReactNode => {
  const iconClass = iconSize[size ?? 'md'];

  return (
    <div
      role="radiogroup"
      aria-label={groupLabel}
      className={cn('flex flex-wrap items-center gap-2', className)}
    >
      {OPTIONS.map(({ value: optionValue, tone, Icon, labelKey }) => {
        const isSelected = value === optionValue;
        const label = labels[labelKey];
        return (
          <button
            key={optionValue}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-label={label}
            disabled={disabled}
            onClick={() => onChange(optionValue)}
            className={cn(optionVariants({ tone, selected: isSelected, size }))}
            data-sentiment={optionValue}
          >
            <Icon className={iconClass} aria-hidden />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
};
