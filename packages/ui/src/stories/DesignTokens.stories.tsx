import { palette, type PaletteScale } from '../design-tokens';

import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  title: 'Foundations / Design Tokens',
  parameters: {
    layout: 'fullscreen',
    a11y: { disable: true },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const SCALES: PaletteScale[] = ['sapphire', 'gilded', 'emerald', 'vermilion', 'amber', 'neutral'];

const Swatch = ({
  scale,
  shade,
  hslTriplet,
}: {
  scale: PaletteScale;
  shade: string;
  hslTriplet: string;
}) => (
  <div className="flex flex-col gap-1">
    <div
      className="h-16 w-full rounded-md border border-border"
      style={{ backgroundColor: `hsl(${hslTriplet})` }}
      aria-label={`${scale}-${shade}`}
    />
    <div className="flex items-baseline justify-between font-mono text-xs">
      <span className="text-muted-foreground">{shade}</span>
      <span className="text-foreground/70">hsl({hslTriplet})</span>
    </div>
  </div>
);

const Scale = ({ scale }: { scale: PaletteScale }) => {
  const stops = palette[scale];
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h3 className="text-lg font-semibold capitalize text-foreground">{scale}</h3>
        <p className="font-mono text-xs text-muted-foreground">11 stops · HSL triplets</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-11">
        {Object.entries(stops).map(([shade, value]) => (
          <Swatch key={shade} scale={scale} shade={shade} hslTriplet={value} />
        ))}
      </div>
    </section>
  );
};

export const Palette: Story = {
  render: () => (
    <div className="min-h-screen bg-background p-8 text-foreground">
      <header className="mb-8 max-w-2xl space-y-2">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Palette</h1>
        <p className="text-muted-foreground">
          OpenTrade&apos;s raw colour palette. Components consume{' '}
          <span className="font-mono text-foreground">semantic</span> tokens (e.g.{' '}
          <span className="font-mono text-primary">bg-primary</span>) — never raw palette utilities
          — so brand changes stay in one layer.
        </p>
      </header>
      <div className="space-y-10">
        {SCALES.map((scale) => (
          <Scale key={scale} scale={scale} />
        ))}
      </div>
    </div>
  ),
};

export const SemanticRoles: Story = {
  render: () => {
    const roles = [
      { name: 'background / foreground', bg: 'bg-background', fg: 'text-foreground' },
      { name: 'card / card-foreground', bg: 'bg-card', fg: 'text-card-foreground' },
      { name: 'primary / primary-foreground', bg: 'bg-primary', fg: 'text-primary-foreground' },
      {
        name: 'secondary / secondary-foreground',
        bg: 'bg-secondary',
        fg: 'text-secondary-foreground',
      },
      {
        name: 'accent / accent-foreground (Gilded)',
        bg: 'bg-accent',
        fg: 'text-accent-foreground',
      },
      { name: 'muted / muted-foreground', bg: 'bg-muted', fg: 'text-muted-foreground' },
      { name: 'success / success-foreground', bg: 'bg-success', fg: 'text-success-foreground' },
      { name: 'danger / danger-foreground', bg: 'bg-danger', fg: 'text-danger-foreground' },
      { name: 'warning / warning-foreground', bg: 'bg-warning', fg: 'text-warning-foreground' },
      { name: 'chain-bg / chain-ink (on-chain data)', bg: 'bg-chain-bg', fg: 'text-chain-ink' },
    ];
    return (
      <div className="min-h-screen bg-background p-8">
        <header className="mb-6 max-w-2xl space-y-2 text-foreground">
          <h1 className="font-display text-3xl font-semibold tracking-tight">Semantic Roles</h1>
          <p className="text-muted-foreground">
            Toggle the theme switcher in the toolbar to verify each role in light and dark mode.
          </p>
        </header>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {roles.map((r) => (
            <div
              key={r.name}
              className={`${r.bg} ${r.fg} rounded-md border border-border p-4 shadow-sm`}
            >
              <p className="font-mono text-xs opacity-80">{r.name}</p>
              <p className="mt-2 text-base font-medium">Aa 123,456.78</p>
            </div>
          ))}
        </div>
      </div>
    );
  },
};

export const Typography: Story = {
  render: () => (
    <div className="min-h-screen bg-background p-8 text-foreground">
      <header className="mb-6 max-w-2xl space-y-2">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Typography</h1>
        <p className="text-muted-foreground">
          Inter + system CJK fallback in Phase 0; Source Han will be self-hosted from Phase 0.5.
        </p>
      </header>
      <div className="space-y-6">
        <div>
          <p className="font-mono text-xs uppercase text-muted-foreground">display 4xl · serif</p>
          <p className="font-serif text-4xl font-semibold">公平、公開、不可篡改</p>
        </div>
        <div>
          <p className="font-mono text-xs uppercase text-muted-foreground">display 3xl</p>
          <p className="font-display text-3xl font-semibold tracking-tight">OpenTrade</p>
        </div>
        <div>
          <p className="font-mono text-xs uppercase text-muted-foreground">2xl</p>
          <p className="text-2xl font-semibold">香港持牌證券商評論</p>
        </div>
        <div>
          <p className="font-mono text-xs uppercase text-muted-foreground">base body</p>
          <p className="max-w-prose text-base leading-relaxed text-foreground/80">
            OpenTrade 是 Web 3.0 去中心化金融服務評論平台。所有評論寫入區塊鏈後不可被刪除，
            為散戶與商戶提供公平、公開、不可篡改的信任基礎設施。
          </p>
        </div>
        <div>
          <p className="font-mono text-xs uppercase text-muted-foreground">mono · chain data</p>
          <p className="font-mono text-sm text-chain-ink">
            block #14,728,392 · 0x3f9a...c8b2 · gas 124,500 wei
          </p>
        </div>
        <div>
          <p className="font-mono text-xs uppercase text-muted-foreground">numeric · tabular</p>
          <table className="font-numeric text-sm">
            <tbody>
              <tr>
                <td className="pr-6 text-muted-foreground">L1 SBT holders</td>
                <td className="text-right">123,456</td>
              </tr>
              <tr>
                <td className="pr-6 text-muted-foreground">L2 verified users</td>
                <td className="text-right">12,840</td>
              </tr>
              <tr>
                <td className="pr-6 text-muted-foreground">Reviews on-chain</td>
                <td className="text-right">87,201</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  ),
};
