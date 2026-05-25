import { cva, type VariantProps } from 'class-variance-authority';
import { Minus, ThumbsDown, ThumbsUp } from 'lucide-react';
import { type ReactNode } from 'react';

import { cn } from '../../utils/cn';
import { type Sentiment } from '../sentiment-picker/SentimentPicker';

/**
 * SentimentBadge — static, read-only chip for the three-way verdict (per
 * ADR-0028 D7). Mirrors the visual language of {@link SentimentPicker} so
 * the write surface (picker) and read surface (badge) feel like the same
 * axis to the end user.
 *
 * Why two themes ship together (`semantic` and `neon`):
 *   - `semantic` uses Tailwind semantic tokens (`success` / `danger` /
 *     `muted`) so the chip switches with the global light/dark theme. This
 *     is the **preferred** option for new surfaces, especially in
 *     `apps/console` where the merchant-management screens use the
 *     standard light/dark token set.
 *   - `neon` reproduces the hardcoded dark-neon palette already shipping
 *     across the散戶 surface (`apps/web`) and the dark-themed console
 *     surfaces that share its visual language (admin reviews table,
 *     merchant dashboard, broker-side reviews list). This theme exists
 *     **only to keep the M6.2a refactor behaviour-neutral**; the hex
 *     literals (`#00FF88`, `red-300`, `white/70`) deliberately bypass
 *     cursor rule 22's no-hardcoded-colours guidance because they already
 *     do so in the call sites this commit is consolidating. New surfaces
 *     must prefer `semantic`; an ADR is required before adding another
 *     neon-themed primitive.
 *
 * Why `sentiment` is non-null (versus `Sentiment | null` like the picker):
 * pre-backfill rows where the DB column is null are a *data* condition
 * that requires a different UI affordance — a small `rating`-derived
 * caption per ADR-0028 D7 — not a sentiment chip. Each call site keeps
 * its own legacy-caption JSX because copy + shape diverge by surface
 * (web uses "依五星評分回推為 X 星", console uses "舊評分：X", the
 * merchant dashboard renders a blue star + raw digit). Folding all those
 * into the badge would couple the chip to the `rating` column we are
 * trying to retire in Release N+2.
 *
 * Accessibility: `role="status"` so screen readers announce the verdict
 * as live read-only state (matching {@link SbtBadge}). The accessible
 * name defaults to the visible label; callers can override with
 * `ariaLabel` to prefix with "評價：" (the web surface does this via
 * `t('sentimentBadgeAria', { value })`).
 *
 * Labels are caller-supplied for the same reason the picker uses that
 * pattern — `packages/ui` stays free of next-intl coupling.
 */

const badgeVariants = cva(['inline-flex items-center font-bold', 'select-none'], {
  variants: {
    tone: {
      positive: '',
      neutral: '',
      negative: '',
    },
    theme: {
      semantic: '',
      neon: '',
    },
    size: {
      xs: 'gap-1 rounded-full px-2 py-0.5 text-[11px]',
      sm: 'gap-1 rounded-full px-2 py-0.5 text-xs',
      md: 'gap-1 rounded-full px-2 py-0.5 text-xs',
      lg: 'gap-1.5 rounded-full px-2.5 py-1 text-sm',
    },
  },
  compoundVariants: [
    {
      tone: 'positive',
      theme: 'semantic',
      class: 'bg-success/10 text-success',
    },
    {
      tone: 'neutral',
      theme: 'semantic',
      class: 'bg-muted text-muted-foreground',
    },
    {
      tone: 'negative',
      theme: 'semantic',
      class: 'bg-danger/10 text-danger',
    },
    {
      tone: 'positive',
      theme: 'neon',
      class: 'border border-[#00FF88]/40 bg-[#00FF88]/15 text-[#00FF88]',
    },
    {
      tone: 'neutral',
      theme: 'neon',
      class: 'border border-white/20 bg-white/10 text-white/70',
    },
    {
      tone: 'negative',
      theme: 'neon',
      class: 'border border-red-400/40 bg-red-500/15 text-red-300',
    },
  ],
  defaultVariants: {
    tone: 'neutral',
    theme: 'semantic',
    size: 'md',
  },
});

const iconSize = {
  xs: 'size-3',
  sm: 'size-3',
  md: 'size-3',
  lg: 'size-3.5',
} as const;

const TONE_BY_SENTIMENT: Record<Sentiment, 'positive' | 'neutral' | 'negative'> = {
  POSITIVE: 'positive',
  NEUTRAL: 'neutral',
  NEGATIVE: 'negative',
};

const ICON_BY_SENTIMENT: Record<Sentiment, typeof ThumbsUp> = {
  POSITIVE: ThumbsUp,
  NEUTRAL: Minus,
  NEGATIVE: ThumbsDown,
};

export type SentimentBadgeProps = Omit<VariantProps<typeof badgeVariants>, 'tone'> & {
  /**
   * Required non-null verdict. Pre-backfill rows where the DB column is
   * `null` must be guarded by the caller (render a legacy-rating caption
   * instead — see component JSDoc and ADR-0028 D7).
   */
  sentiment: Sentiment;
  /** Localised label, resolved via next-intl by the caller. */
  label: string;
  /**
   * Optional override for the accessible name. Defaults to `label`.
   * Sites that want to prefix the label (e.g. "評價：讚") pass a
   * pre-formatted string from `t('sentimentBadgeAria', { value: label })`.
   */
  ariaLabel?: string;
  className?: string;
};

export const SentimentBadge = ({
  sentiment,
  label,
  ariaLabel,
  theme,
  size,
  className,
}: SentimentBadgeProps): ReactNode => {
  const tone = TONE_BY_SENTIMENT[sentiment];
  const Icon = ICON_BY_SENTIMENT[sentiment];
  const resolvedSize = size ?? 'md';

  return (
    <span
      role="status"
      aria-label={ariaLabel ?? label}
      data-sentiment={sentiment}
      className={cn(badgeVariants({ tone, theme, size }), className)}
    >
      <Icon className={iconSize[resolvedSize]} aria-hidden />
      <span>{label}</span>
    </span>
  );
};
