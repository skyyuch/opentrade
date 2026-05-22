import { SbtBadge } from './SbtBadge';

import type { Meta, StoryObj } from '@storybook/react';

const meta = {
  title: 'Compounds/SbtBadge',
  component: SbtBadge,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'On-chain identity tier badge. Web3 aesthetic with tier-specific visual treatment: ' +
          'L1 (minimal), L2 (sapphire glow), L3 (gilded accent), L4 (full gilded frame).',
      },
    },
  },
  args: {
    tier: 'L2',
    size: 'md',
    showLabel: false,
    showTierCode: true,
    locale: 'en',
  },
  argTypes: {
    tier: {
      control: 'select',
      options: ['L1', 'L2', 'L3', 'L4'],
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
    },
    locale: {
      control: 'select',
      options: ['zh-Hant', 'zh-Hans', 'en'],
    },
  },
  tags: ['autodocs'],
} satisfies Meta<typeof SbtBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const AllTiers: Story = {
  args: { tier: 'L1' },
  render: () => (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <SbtBadge tier="L1" showLabel locale="en" />
        <SbtBadge tier="L2" showLabel locale="en" />
        <SbtBadge tier="L3" showLabel locale="en" />
        <SbtBadge tier="L4" showLabel locale="en" />
      </div>
      <div className="flex items-center gap-4">
        <SbtBadge tier="L1" showLabel locale="zh-Hant" />
        <SbtBadge tier="L2" showLabel locale="zh-Hant" />
        <SbtBadge tier="L3" showLabel locale="zh-Hant" />
        <SbtBadge tier="L4" showLabel locale="zh-Hant" />
      </div>
    </div>
  ),
};

export const Sizes: Story = {
  args: { tier: 'L2' },
  render: () => (
    <div className="flex items-center gap-4">
      <SbtBadge tier="L2" size="sm" showLabel locale="en" />
      <SbtBadge tier="L2" size="md" showLabel locale="en" />
      <SbtBadge tier="L2" size="lg" showLabel locale="en" />
    </div>
  ),
};

export const TierCodeOnly: Story = {
  args: { tier: 'L1' },
  render: () => (
    <div className="flex items-center gap-4">
      <SbtBadge tier="L1" />
      <SbtBadge tier="L2" />
      <SbtBadge tier="L3" />
      <SbtBadge tier="L4" />
    </div>
  ),
};

export const InContext: Story = {
  args: { tier: 'L2' },
  render: () => (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-6">
      <div className="flex items-center gap-3">
        <div className="size-10 rounded-full bg-muted" />
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">CryptoTrader_HK</span>
            <SbtBadge tier="L2" size="sm" />
          </div>
          <span className="text-xs text-muted-foreground">2026-05-22</span>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Best execution speed in HK. Verified my account with OpenTrade.
      </p>
    </div>
  ),
};

export const DarkBackground: Story = {
  args: { tier: 'L2' },
  render: () => (
    <div className="flex items-center gap-4 rounded-lg bg-neutral-900 p-6">
      <SbtBadge tier="L2" showLabel locale="en" />
      <SbtBadge tier="L3" showLabel locale="en" />
      <SbtBadge tier="L4" showLabel locale="en" />
    </div>
  ),
  parameters: {
    themes: { themeOverride: 'dark' },
  },
};
