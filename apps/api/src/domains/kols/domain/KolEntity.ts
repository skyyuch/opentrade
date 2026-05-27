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
};

export type ClaimKolInput = {
  userId: string;
  kolId: string;
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
