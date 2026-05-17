import { ArrowRight, Download, Trash2 } from 'lucide-react';

import { Button } from './Button';

import type { Meta, StoryObj } from '@storybook/react';

const meta = {
  title: 'Primitives / Button',
  component: Button,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Primary interactive primitive. Five intents (primary / secondary / outline / ghost / danger), three sizes, and built-in loading / icon slots. Use `asChild` to render as a Next.js `<Link>` while preserving button styles.',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    intent: {
      control: 'select',
      options: ['primary', 'secondary', 'outline', 'ghost', 'danger'],
    },
    size: { control: 'inline-radio', options: ['sm', 'md', 'lg'] },
    fullWidth: { control: 'boolean' },
    loading: { control: 'boolean' },
    disabled: { control: 'boolean' },
    onClick: { action: 'clicked' },
  },
  args: {
    intent: 'primary',
    size: 'md',
    fullWidth: false,
    loading: false,
    disabled: false,
    children: 'Submit review',
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {};

export const Secondary: Story = { args: { intent: 'secondary' } };
export const Outline: Story = { args: { intent: 'outline' } };
export const Ghost: Story = { args: { intent: 'ghost' } };
export const Danger: Story = { args: { intent: 'danger', children: 'Delete account' } };

export const AllIntents: Story = {
  parameters: { layout: 'padded', controls: { disable: true } },
  render: () => (
    <div className="flex flex-col gap-6">
      {(['primary', 'secondary', 'outline', 'ghost', 'danger'] as const).map((intent) => (
        <div key={intent} className="flex items-center gap-3">
          <p className="w-24 font-mono text-xs uppercase text-muted-foreground">{intent}</p>
          <Button intent={intent} size="sm">
            Small
          </Button>
          <Button intent={intent} size="md">
            Medium
          </Button>
          <Button intent={intent} size="lg">
            Large
          </Button>
        </div>
      ))}
    </div>
  ),
};

export const States: Story = {
  parameters: { layout: 'padded', controls: { disable: true } },
  render: () => (
    <div className="grid grid-cols-2 gap-3">
      <Button>Default</Button>
      <Button loading>Loading</Button>
      <Button disabled>Disabled</Button>
      <Button fullWidth>Full width</Button>
    </div>
  ),
};

export const WithIcons: Story = {
  parameters: { layout: 'padded', controls: { disable: true } },
  render: () => (
    <div className="flex flex-col gap-3">
      <Button leadingIcon={<Download className="size-4" aria-hidden />}>Download report</Button>
      <Button intent="secondary" trailingIcon={<ArrowRight className="size-4" aria-hidden />}>
        View on Etherscan
      </Button>
      <Button intent="danger" leadingIcon={<Trash2 className="size-4" aria-hidden />}>
        Flag review
      </Button>
    </div>
  ),
};

/**
 * The button respects three locales — UI strings must come from `next-intl`,
 * never hard-coded (rule 51-i18n). These stories simulate the rendered output
 * after translation so the design system can verify line-length, ascender /
 * descender clearance, and CJK punctuation handling.
 */
export const Localised: Story = {
  parameters: { layout: 'padded', controls: { disable: true } },
  render: () => (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <p className="w-20 font-mono text-xs uppercase text-muted-foreground">zh-Hant</p>
        <Button>提交評論</Button>
        <Button intent="outline">取消</Button>
        <Button intent="danger">舉報評論</Button>
      </div>
      <div className="flex items-center gap-3">
        <p className="w-20 font-mono text-xs uppercase text-muted-foreground">zh-Hans</p>
        <Button>提交评论</Button>
        <Button intent="outline">取消</Button>
        <Button intent="danger">举报评论</Button>
      </div>
      <div className="flex items-center gap-3">
        <p className="w-20 font-mono text-xs uppercase text-muted-foreground">en</p>
        <Button>Submit review</Button>
        <Button intent="outline">Cancel</Button>
        <Button intent="danger">Flag review</Button>
      </div>
    </div>
  ),
};

/**
 * Renders on dark theme regardless of the global theme switcher so designers
 * can sanity-check the Web3-tech-feel focus ring side-by-side with light.
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
    <div className="flex flex-wrap items-center gap-3">
      <Button>Primary</Button>
      <Button intent="secondary">Secondary</Button>
      <Button intent="outline">Outline</Button>
      <Button intent="ghost">Ghost</Button>
      <Button intent="danger">Danger</Button>
    </div>
  ),
};
