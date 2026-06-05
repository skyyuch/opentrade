import { Button } from '../../primitives/button/Button';

import { ImmutableMark } from './ImmutableMark';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  title: 'Compounds / ImmutableMark',
  component: ImmutableMark,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'OpenTrade signature visual. Every on-chain datum (review, KOL signal, jury verdict) MUST carry this stamp so users see "this cannot be tampered with" at a glance. Per ADR-0011 §5.1 this is the primary differentiator vs WikiFX-style platforms.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    txHash: { control: 'text' },
    blockNumber: { control: 'number' },
    chain: { control: 'inline-radio', options: ['base', 'base-sepolia', 'ethereum'] },
    size: { control: 'inline-radio', options: ['sm', 'md'] },
    asStatic: { control: 'boolean' },
  },
  args: {
    txHash: '0x3f9a8c2d4b6e1f7a9c8b2d4e6f8a0c2b4d6e8f0a2c4b6d8e0f2a4c6b8d0e2f4a',
    blockNumber: 14_728_392,
    chain: 'base',
    size: 'md',
    asStatic: false,
  },
} satisfies Meta<typeof ImmutableMark>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Small: Story = { args: { size: 'sm' } };

export const WithoutBlockNumber: Story = {
  render: () => (
    <ImmutableMark
      chain="base"
      txHash="0x3f9a8c2d4b6e1f7a9c8b2d4e6f8a0c2b4d6e8f0a2c4b6d8e0f2a4c6b8d0e2f4a"
    />
  ),
  parameters: {
    docs: {
      description: {
        story:
          'When the block number is unknown (e.g. tx still being indexed) the chain label takes its place. The full tx hash remains accessible via the link and screen-reader text.',
      },
    },
  },
};

export const Sepolia: Story = {
  args: {
    chain: 'base-sepolia',
    blockNumber: 9_842_001,
    txHash: '0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
  },
};

export const Static: Story = {
  args: { asStatic: true },
  parameters: {
    docs: {
      description: {
        story:
          'Render as a non-interactive span — useful for PDFs, server-side rendering snapshots, or contexts where the link would not work (email).',
      },
    },
  },
};

export const AllSizesAndChains: Story = {
  parameters: { layout: 'padded', controls: { disable: true } },
  render: () => (
    <div className="grid gap-4">
      <div className="flex flex-col gap-2">
        <p className="font-mono text-xs uppercase text-muted-foreground">size sm</p>
        <div className="flex flex-wrap gap-2">
          <ImmutableMark
            size="sm"
            chain="base"
            blockNumber={14_728_392}
            txHash="0x3f9a8c2d4b6e1f7a9c8b2d4e6f8a0c2b4d6e8f0a"
          />
          <ImmutableMark
            size="sm"
            chain="base-sepolia"
            blockNumber={9_842_001}
            txHash="0xabcdef0123456789abcdef01234567"
          />
          <ImmutableMark size="sm" chain="ethereum" txHash="0xdeadbeefcafebabe1234567890abcdef" />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <p className="font-mono text-xs uppercase text-muted-foreground">size md</p>
        <div className="flex flex-wrap gap-2">
          <ImmutableMark
            size="md"
            chain="base"
            blockNumber={14_728_392}
            txHash="0x3f9a8c2d4b6e1f7a9c8b2d4e6f8a0c2b4d6e8f0a"
          />
          <ImmutableMark
            size="md"
            chain="base-sepolia"
            blockNumber={9_842_001}
            txHash="0xabcdef0123456789abcdef01234567"
          />
          <ImmutableMark size="md" chain="ethereum" txHash="0xdeadbeefcafebabe1234567890abcdef" />
        </div>
      </div>
    </div>
  ),
};

/**
 * The intended use: stuck to the corner of any on-chain datum. This story
 * mocks a Phase-1 review card to demonstrate the "every record carries a
 * tamper-proof stamp" effect that is the brand's main visual asset.
 *
 * The card itself is intentionally rough — `ReviewCard` will be its own
 * compound when Phase 1 begins.
 */
export const InContextReviewCard: Story = {
  parameters: { layout: 'padded', controls: { disable: true } },
  render: () => (
    <article className="max-w-xl rounded-md border border-border bg-card p-5 text-card-foreground shadow-sm">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span
              className="inline-flex h-5 items-center rounded-full bg-success/15 px-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-success"
              aria-label="Positive sentiment"
            >
              Positive
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              by 0x4a91…a7c8 · L2 verified
            </span>
          </div>
          <h3 className="text-lg font-semibold tracking-tight">服務速度快，但手續費略高</h3>
        </div>
        <ImmutableMark
          size="sm"
          chain="base"
          blockNumber={14_728_392}
          txHash="0x3f9a8c2d4b6e1f7a9c8b2d4e6f8a0c2b4d6e8f0a"
        />
      </header>
      <p className="mt-4 text-sm leading-relaxed text-foreground/80">
        開戶體驗順暢，客服回覆 5 分鐘內。但港股交易手續費比 IB 高 0.05%，長線投資要計清楚。
      </p>
      <footer className="mt-5 flex items-center gap-2">
        <Button intent="ghost" size="sm">
          有用 · 12
        </Button>
        <Button intent="ghost" size="sm">
          回覆
        </Button>
      </footer>
    </article>
  ),
};

export const InContextKolSignal: Story = {
  parameters: { layout: 'padded', controls: { disable: true } },
  render: () => (
    <article className="grid max-w-md gap-3 rounded-md border border-border bg-card p-5 text-card-foreground shadow-sm">
      <div className="flex items-baseline justify-between">
        <h3 className="text-lg font-semibold tracking-tight">0700.HK · 騰訊控股</h3>
        <span className="font-mono text-xs uppercase tracking-wider text-success">BUY</span>
      </div>
      <dl className="grid grid-cols-3 gap-2 font-numeric text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Entry</dt>
          <dd className="font-medium">HK$ 408.20</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Target</dt>
          <dd className="font-medium text-success">HK$ 460.00</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Stop</dt>
          <dd className="font-medium text-danger">HK$ 388.00</dd>
        </div>
      </dl>
      <div className="flex items-center justify-between border-t border-border pt-3">
        <p className="font-mono text-xs text-muted-foreground">@cathy_finance · KOL L4</p>
        <ImmutableMark
          size="sm"
          chain="base"
          blockNumber={14_728_415}
          txHash="0x9c3a2b4d6e8f0a2c4b6d8e0f2a4c6b8d0e2f4a6b"
        />
      </div>
    </article>
  ),
};
