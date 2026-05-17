import { cva, type VariantProps } from 'class-variance-authority';
import { Stamp } from 'lucide-react';

import { cn } from '../../utils/cn';

/**
 * OpenTrade's signature visual artefact — a hairline "stamp" affixed to any
 * piece of data that has been written on-chain. Per ADR-0011 §5.1 this is
 * the brand's primary differentiator from WikiFX-style "edit-for-pay"
 * platforms: every review, signal, and verdict carries a visible mark saying
 * "this cannot be tampered with — verify it yourself".
 *
 * Compositional rules (rule 22 + ADR-0011):
 *   - This compound is **pure presentation**: it never fetches; the caller
 *     supplies hash / block number / explorer URL.
 *   - It MUST NOT be rendered for non-on-chain data (would mislead users).
 *   - The component truncates the hash for display but exposes the full
 *     value via the link, `title`, and a screen-reader-only span.
 */

const stampVariants = cva(
  [
    'group inline-flex items-center gap-1.5 rounded-md border font-mono font-medium',
    'border-chain-border bg-chain-bg text-chain-ink',
    'transition-colors duration-fast ease-out',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
  ],
  {
    variants: {
      size: {
        sm: 'h-6 px-1.5 text-[10px]',
        md: 'h-7 px-2 text-xs',
      },
      interactive: {
        true: 'cursor-pointer hover:border-primary/40 hover:text-foreground hover:bg-primary/5',
        false: '',
      },
    },
    defaultVariants: {
      size: 'md',
      interactive: false,
    },
  },
);

/** Supported chains for Phase 0. Will move to `@opentrade/config` in Commit #6. */
const CHAIN_EXPLORERS = {
  base: { label: 'Base', baseUrl: 'https://basescan.org/tx/' },
  'base-sepolia': { label: 'Base Sepolia', baseUrl: 'https://sepolia.basescan.org/tx/' },
  ethereum: { label: 'Ethereum', baseUrl: 'https://etherscan.io/tx/' },
} as const;

export type ImmutableMarkChain = keyof typeof CHAIN_EXPLORERS;

export type ImmutableMarkProps = Omit<VariantProps<typeof stampVariants>, 'interactive'> & {
  /** Transaction hash (with or without leading `0x`). */
  txHash: string;
  /** Block height the transaction was included in (optional). */
  blockNumber?: number;
  /** Chain identifier. Defaults to `base`. */
  chain?: ImmutableMarkChain;
  /** Override the computed explorer URL. */
  explorerUrl?: string;
  /** Render as plain text instead of a link (useful for export / print). */
  asStatic?: boolean;
  /** Locale used for grouping the block number. Defaults to `en-US`. */
  locale?: string;
  className?: string;
};

const truncateHash = (hash: string): string => {
  const cleaned = hash.startsWith('0x') ? hash : `0x${hash}`;
  if (cleaned.length <= 12) return cleaned;
  return `${cleaned.slice(0, 6)}…${cleaned.slice(-4)}`;
};

const formatBlock = (n: number, locale: string): string => {
  return `#${new Intl.NumberFormat(locale).format(n)}`;
};

const buildExplorerUrl = (chain: ImmutableMarkChain, txHash: string): string => {
  const cleaned = txHash.startsWith('0x') ? txHash : `0x${txHash}`;
  return `${CHAIN_EXPLORERS[chain].baseUrl}${cleaned}`;
};

export const ImmutableMark = ({
  txHash,
  blockNumber,
  chain = 'base',
  explorerUrl,
  size,
  asStatic = false,
  locale = 'en-US',
  className,
}: ImmutableMarkProps) => {
  const truncated = truncateHash(txHash);
  const blockLabel = blockNumber !== undefined ? formatBlock(blockNumber, locale) : undefined;
  const chainLabel = CHAIN_EXPLORERS[chain].label;
  const fullHash = txHash.startsWith('0x') ? txHash : `0x${txHash}`;
  const title = `${chainLabel}${blockLabel ? ` · ${blockLabel}` : ''} · ${fullHash}`;

  const inner = (
    <>
      <Stamp className="size-3" aria-hidden />
      {blockLabel ? (
        <span className="tabular-nums">{blockLabel}</span>
      ) : (
        <span className="tabular-nums">{chainLabel}</span>
      )}
      <span aria-hidden className="text-chain-border">
        ·
      </span>
      <span className="tabular-nums">{truncated}</span>
      <span className="sr-only">
        {chainLabel} transaction {fullHash}
        {blockLabel ? `, block ${blockLabel}` : ''}. Open block explorer in a new tab.
      </span>
    </>
  );

  if (asStatic) {
    return (
      <span
        className={cn(stampVariants({ size, interactive: false }), className)}
        title={title}
        role="note"
      >
        {inner}
      </span>
    );
  }

  const href = explorerUrl ?? buildExplorerUrl(chain, txHash);
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(stampVariants({ size, interactive: true }), className)}
      title={title}
    >
      {inner}
    </a>
  );
};
