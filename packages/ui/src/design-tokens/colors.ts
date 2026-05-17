/**
 * OpenTrade colour palette — single source of truth.
 *
 * Per ADR-0011 OpenTrade uses a dual-tone main palette:
 *   - Sapphire (primary, Web3 tech feel, restrained)
 *   - Gilded   (accent, "oxidised gold", premium/SBT/verified — sparingly used)
 *
 * Functional colours (Emerald/Vermilion/Amber) follow a "sober finance" tone:
 * never neon, never Bootstrap red/green — these are user-trust signals not
 * marketing accents.
 *
 * Neutrals are intentionally cool (blue-tinted slate) to keep the overall
 * surface feeling like a modern Web3 product rather than a warm consumer app.
 *
 * Values are expressed as HSL **triplets** (no `hsl()` wrapper) so the same
 * source can feed both Tailwind config and CSS custom properties with
 * Tailwind's `<alpha-value>` placeholder.
 *
 *   bg-primary           => hsl(var(--primary))
 *   bg-primary/50        => hsl(var(--primary) / 0.5)
 */

export const palette = {
  sapphire: {
    50: '214 100% 97%',
    100: '214 95% 93%',
    200: '213 97% 87%',
    300: '212 96% 78%',
    400: '213 94% 68%',
    500: '217 91% 60%',
    600: '221 83% 53%',
    700: '224 76% 48%',
    800: '226 71% 40%',
    900: '224 64% 33%',
    950: '226 57% 21%',
  },
  gilded: {
    50: '40 60% 95%',
    100: '40 50% 88%',
    200: '38 50% 80%',
    300: '36 45% 70%',
    400: '35 45% 60%',
    500: '35 43% 50%',
    600: '34 43% 42%',
    700: '33 45% 35%',
    800: '32 45% 28%',
    900: '30 45% 20%',
    950: '28 45% 12%',
  },
  emerald: {
    50: '152 81% 96%',
    100: '149 80% 90%',
    200: '152 76% 80%',
    300: '156 72% 67%',
    400: '158 64% 52%',
    500: '160 84% 39%',
    600: '161 94% 30%',
    700: '163 94% 24%',
    800: '163 88% 20%',
    900: '164 86% 16%',
    950: '166 91% 9%',
  },
  vermilion: {
    50: '0 86% 97%',
    100: '0 93% 94%',
    200: '0 96% 89%',
    300: '0 94% 82%',
    400: '0 91% 71%',
    500: '0 84% 60%',
    600: '0 72% 51%',
    700: '0 74% 42%',
    800: '0 70% 35%',
    900: '0 63% 31%',
    950: '0 75% 15%',
  },
  amber: {
    50: '48 96% 95%',
    100: '48 96% 89%',
    200: '48 97% 77%',
    300: '46 97% 65%',
    400: '43 96% 56%',
    500: '38 92% 50%',
    600: '32 95% 44%',
    700: '26 90% 37%',
    800: '23 83% 31%',
    900: '22 78% 26%',
    950: '21 91% 14%',
  },
  /**
   * Neutrals — cool blue-tinted slate. 50 = white-ish, 950 = ink (#0B0F1A).
   * Used for backgrounds, surfaces, borders, text. Avoid "warm" greys which
   * make the UI feel like a consumer app rather than a finance / Web3 product.
   */
  neutral: {
    0: '0 0% 100%',
    50: '210 40% 98%',
    100: '210 40% 96%',
    200: '214 32% 91%',
    300: '213 27% 84%',
    400: '215 20% 65%',
    500: '215 16% 47%',
    600: '215 19% 35%',
    700: '215 25% 27%',
    800: '217 33% 17%',
    900: '222 47% 11%',
    950: '225 40% 7%',
  },
} as const;

export type PaletteScale = keyof typeof palette;
export type PaletteShade = keyof (typeof palette)[PaletteScale];

/**
 * Semantic role → palette mapping. Components MUST consume semantic names
 * (e.g. `bg-primary`, `text-muted-foreground`) rather than raw palette
 * (e.g. `bg-sapphire-700`). This keeps brand changes to a single layer.
 *
 * Light + dark sets are encoded separately; `globals.css` writes them into
 * `:root` and `.dark` CSS custom properties.
 */
export const semantic = {
  light: {
    background: palette.neutral[0],
    foreground: palette.neutral[900],
    card: palette.neutral[0],
    'card-foreground': palette.neutral[900],
    popover: palette.neutral[0],
    'popover-foreground': palette.neutral[900],

    primary: palette.sapphire[700],
    'primary-foreground': palette.neutral[0],

    secondary: palette.neutral[100],
    'secondary-foreground': palette.neutral[900],

    accent: palette.gilded[500],
    'accent-foreground': palette.neutral[0],

    muted: palette.neutral[100],
    'muted-foreground': palette.neutral[500],

    success: palette.emerald[700],
    'success-foreground': palette.neutral[0],

    danger: palette.vermilion[700],
    'danger-foreground': palette.neutral[0],

    warning: palette.amber[700],
    'warning-foreground': palette.neutral[0],

    border: palette.neutral[200],
    input: palette.neutral[200],
    ring: palette.sapphire[500],

    /** On-chain / verifiable data highlight — used by ImmutableMark, SBT badges. */
    'chain-ink': palette.neutral[700],
    'chain-bg': palette.neutral[50],
    'chain-border': palette.neutral[300],
  },
  dark: {
    background: palette.neutral[950],
    foreground: palette.neutral[50],
    card: palette.neutral[900],
    'card-foreground': palette.neutral[50],
    popover: palette.neutral[900],
    'popover-foreground': palette.neutral[50],

    primary: palette.sapphire[500],
    'primary-foreground': palette.neutral[950],

    secondary: palette.neutral[800],
    'secondary-foreground': palette.neutral[50],

    accent: palette.gilded[400],
    'accent-foreground': palette.neutral[950],

    muted: palette.neutral[800],
    'muted-foreground': palette.neutral[400],

    success: palette.emerald[500],
    'success-foreground': palette.neutral[950],

    danger: palette.vermilion[500],
    'danger-foreground': palette.neutral[950],

    warning: palette.amber[500],
    'warning-foreground': palette.neutral[950],

    border: palette.neutral[800],
    input: palette.neutral[800],
    ring: palette.sapphire[400],

    'chain-ink': palette.neutral[200],
    'chain-bg': palette.neutral[900],
    'chain-border': palette.neutral[700],
  },
} as const;

export type SemanticToken = keyof typeof semantic.light;
