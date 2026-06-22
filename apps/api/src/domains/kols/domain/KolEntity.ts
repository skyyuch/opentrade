/**
 * Domain types for the KOL bounded context.
 *
 * Per ADR-0036 D1: any L1+ user can apply to become a KOL. KOL profiles
 * can also be pre-seeded by admin (UNCLAIMED status, per D9).
 *
 * The domain layer keeps zero infrastructure imports (rule 10).
 */

export type KolStatusValue = 'UNCLAIMED' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';

export const KOL_STATUS_VALUES = [
  'UNCLAIMED',
  'PENDING',
  'APPROVED',
  'REJECTED',
  'SUSPENDED',
] as const satisfies readonly KolStatusValue[];

/**
 * First category dimension per ADR-0053 (the kind of KOL). Mirrors the
 * `KolType` Prisma enum as a hand-written domain union so the domain layer
 * keeps zero runtime infrastructure imports (rule 10), the same pattern as
 * `KolStatusValue`.
 *   - FINANCIAL_KOL    財演 — publicly calls buy/sell.
 *   - INDICATOR_VENDOR 技術指標賣家 — sells self-built trading-signal indicators.
 */
export type KolTypeValue = 'FINANCIAL_KOL' | 'INDICATOR_VENDOR';

export const KOL_TYPE_VALUES = [
  'FINANCIAL_KOL',
  'INDICATOR_VENDOR',
] as const satisfies readonly KolTypeValue[];

/**
 * Second category dimension per ADR-0053 (asset focus). A deliberately coarse,
 * profile-level descriptor distinct from the per-signal `AssetClass` (ADR-0053
 * D4). Mirrors the `KolFocus` Prisma enum.
 *   - EQUITY 股票 / CRYPTO 加密 / FOREX 外匯
 */
export type KolFocusValue = 'EQUITY' | 'CRYPTO' | 'FOREX';

export const KOL_FOCUS_VALUES = [
  'EQUITY',
  'CRYPTO',
  'FOREX',
] as const satisfies readonly KolFocusValue[];

export type CredentialEntry = {
  type: string;
  verified: boolean;
  verifiedAt?: string;
};

export type SocialLinks = {
  youtube?: string;
  instagram?: string;
  twitter?: string;
};

export type ApplyKolInput = {
  userId: string;
  tenantId: string;
  displayName: string;
  bio?: string;
  socialLinks?: SocialLinks;
  credentials?: CredentialEntry[];
  /**
   * Per ADR-0053 §3: an applicant may self-declare their category dimensions
   * during onboarding. Optional — omitting leaves the column null ("未分類")
   * for an admin to assign later. Admin can still override post-application
   * via `updateCategory`.
   */
  type?: KolTypeValue;
  focus?: KolFocusValue;
};

export type ClaimKolInput = {
  userId: string;
  kolId: string;
};

/**
 * Per ADR-0053 Implementation Notes §3: the per-row category assignment an
 * admin makes (set or override) on the console KOL management screen. Both
 * dimensions are independently settable and explicitly nullable so an admin
 * can clear a previously-assigned value back to the "未分類" state. A field
 * left `undefined` is not touched; an explicit `null` clears it.
 */
export type UpdateKolCategoryInput = {
  type?: KolTypeValue | null;
  focus?: KolFocusValue | null;
};

export type KolRecord = {
  id: string;
  tenantId: string;
  userId: string | null;
  slug: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  status: KolStatusValue;
  /**
   * Category dimensions per ADR-0053. Nullable with no default: a KOL has no
   * inherent type/focus, so `null` is a first-class "uncategorised / not yet
   * assigned" state (set later by onboarding/admin). Surfaced read-only on the
   * list + detail responses so the directory can filter and label.
   */
  type: KolTypeValue | null;
  focus: KolFocusValue | null;
  socialLinks: SocialLinks | null;
  credentials: CredentialEntry[] | null;
  iamSmartVerified: boolean;
  kolSbtTokenId: number | null;
  kolSbtMintTxHash: string | null;
  /**
   * Admin-supplied moderation note. Populated when admin rejects a PENDING
   * application (per ADR-0036 D1.1) — shown back to the applicant on
   * `/become-a-kol` and `/kol/onboarding` so the user understands why and
   * can resubmit. Null for non-REJECTED rows or pre-existing REJECTED rows
   * that predate this column. NEVER a place for PII (rule 50).
   */
  adminNote: string | null;
  createdAt: Date;
  updatedAt: Date;
};
