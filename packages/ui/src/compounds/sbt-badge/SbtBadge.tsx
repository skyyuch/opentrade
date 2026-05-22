import { cva, type VariantProps } from 'class-variance-authority';
import { Fingerprint, Scale, Shield, ShieldCheck } from 'lucide-react';
import { type ReactNode } from 'react';

import { cn } from '../../utils/cn';

/**
 * SBT Badge — displays a user's identity verification tier with a
 * distinctive Web3 aesthetic. Each tier has a unique visual treatment:
 *
 *   L1 (Visitor)   — minimal, monochrome outline
 *   L2 (Verified)  — sapphire border with subtle data-glow
 *   L3 (Juror)     — gilded accent, "oxidised gold" premium
 *   L4 (Merchant)  — full gilded frame with glow
 *
 * Per ADR-0011 §5.1 + ADR-0021: the badge is a visual marker of on-chain
 * identity proof. It MUST NOT be faked — only render when the backend
 * confirms the tier.
 */

const badgeVariants = cva(
  [
    'inline-flex items-center gap-1.5 rounded-md border font-medium',
    'transition-all duration-fast ease-out',
    'select-none',
  ],
  {
    variants: {
      tier: {
        L1: ['border-border bg-muted/50 text-muted-foreground'],
        L2: [
          'border-primary/30 bg-primary/5 text-primary',
          'shadow-[0_0_8px_-2px_hsl(var(--ring)/0.3)]',
        ],
        L3: [
          'border-accent/40 bg-accent/5 text-accent',
          'shadow-[0_0_12px_-3px_hsl(var(--accent)/0.4)]',
        ],
        L4: [
          'border-accent/60 bg-accent/10 text-accent',
          'shadow-[0_0_16px_-4px_hsl(var(--accent)/0.5)]',
        ],
      },
      size: {
        sm: 'h-6 px-1.5 text-[10px]',
        md: 'h-7 px-2 text-xs',
        lg: 'h-8 px-2.5 text-sm',
      },
    },
    defaultVariants: {
      tier: 'L1',
      size: 'md',
    },
  },
);

const TIER_CONFIG = {
  L1: { icon: Shield, label: 'L1' },
  L2: { icon: ShieldCheck, label: 'L2' },
  L3: { icon: Scale, label: 'L3' },
  L4: { icon: Fingerprint, label: 'L4' },
} as const;

const TIER_LABELS = {
  L1: { 'zh-Hant': '已登入', 'zh-Hans': '已登录', en: 'Signed in' },
  L2: { 'zh-Hant': '已驗證', 'zh-Hans': '已验证', en: 'Verified' },
  L3: { 'zh-Hant': '陪審員', 'zh-Hans': '陪审员', en: 'Juror' },
  L4: { 'zh-Hant': '商戶認證', 'zh-Hans': '商户认证', en: 'Merchant' },
} as const satisfies Record<SbtTier, Record<string, string>>;

export type SbtTier = 'L1' | 'L2' | 'L3' | 'L4';

export type SbtBadgeProps = Omit<VariantProps<typeof badgeVariants>, 'tier'> & {
  tier: SbtTier;
  /** Show the human-readable label alongside the tier code. */
  showLabel?: boolean;
  /** Locale for the label text. Defaults to `en`. */
  locale?: string;
  /** Show tier code (e.g. "L2"). Defaults to true. */
  showTierCode?: boolean;
  className?: string;
};

export const SbtBadge = ({
  tier,
  size,
  showLabel = false,
  showTierCode = true,
  locale = 'en',
  className,
}: SbtBadgeProps): ReactNode => {
  const config = TIER_CONFIG[tier];
  const Icon = config.icon;
  const label =
    TIER_LABELS[tier][locale as keyof (typeof TIER_LABELS)[typeof tier]] ?? TIER_LABELS[tier]['en'];

  const iconSize = size === 'sm' ? 'size-3' : size === 'lg' ? 'size-4' : 'size-3.5';

  return (
    <span
      className={cn(badgeVariants({ tier, size }), className)}
      title={`${tier} — ${label}`}
      role="status"
      aria-label={`Identity tier: ${tier} — ${label}`}
    >
      <Icon className={iconSize} aria-hidden />
      {showTierCode && <span className="font-mono tabular-nums">{config.label}</span>}
      {showLabel && <span className="font-sans">{label}</span>}
    </span>
  );
};
