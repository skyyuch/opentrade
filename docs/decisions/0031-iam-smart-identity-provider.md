# ADR-0031: iAM Smart Identity Provider Interface (Phase 2)

## Status

Accepted

## Date

2026-05-26

## Context

OpenTrade's KOL signal tracking (per [ADR-0036](./0036-kol-signal-architecture.md)) requires Sybil prevention stronger than social-OAuth-only binding. Without civil-identity-level uniqueness, a single person can create multiple wallets, register multiple KOL identities, emit contradicting signals from each, and cherry-pick the winning wallet as their "real" track record — defeating the platform's core promise of immutable, verifiable signal history.

Hong Kong's iAM Smart (智方便) digital identity system provides government-grade one-person-one-identity guarantees tied to HKID. It is the strongest Sybil prevention mechanism available in the Phase 2 target market (HK).

This ADR was originally staged as STAGING.md S2 with a Phase 3 jury trigger. The 2026-05-26 KOL planning discussion promoted it to Phase 2 because KOL Sybil prevention is a prerequisite for credible signal tracking, not just jury selection.

### Relationship with ADR-0005 (Privy)

[ADR-0005](./0005-privy-aa-wallet.md) covers wallet authentication and account abstraction. iAM Smart covers civil identity verification. They are complementary layers:

- **Privy**: "Which wallet does this user control?" (auth + AA)
- **iAM Smart**: "Is this a unique real person?" (Sybil prevention)

A user completes Privy login first (L1), then optionally completes iAM Smart verification for KOL identity. Neither replaces the other.

## Decision

### D1: `IIdentityProvider` interface for pluggable identity verification

`packages/shared/src/identity/IIdentityProvider.ts` defines a provider-agnostic interface:

```typescript
interface IdentityVerificationResult {
  verified: boolean;
  identityHash: string; // salted hash of civil ID (never raw)
  provider: string; // "iam_smart" | "tw_fido" | "sg_singpass" | ...
  verifiedAt: Date;
  metadata?: Record<string, unknown>;
}

interface IIdentityProvider {
  readonly providerId: string;
  readonly regionCode: string; // ISO 3166-1 alpha-2
  startVerification(
    userId: string,
    redirectUrl: string,
  ): Promise<{ authorizationUrl: string }>;
  completeVerification(
    userId: string,
    callbackData: unknown,
  ): Promise<IdentityVerificationResult>;
  revokeVerification(userId: string): Promise<void>;
}
```

Phase 2 ships one adapter: `IamSmartProvider` (HK, `providerId: "iam_smart"`, `regionCode: "HK"`). The interface reserves slots for future adapters without code changes to the core verification flow.

### D2: iAM Smart integration path

iAM Smart uses an OAuth 2.0 / OIDC flow managed by HKSAR's OGCIO (Office of the Government Chief Information Officer).

**Integration steps** (government-side):

1. Register as a "Relying Party" with OGCIO
2. Complete Privacy Impact Assessment (PIA)
3. Receive client credentials for the iAM Smart sandbox
4. Pass integration testing with OGCIO
5. Receive production credentials

**Estimated timeline**: 3-6 months from application submission.

**Technical flow**:

1. User clicks "Verify with iAM Smart" in console
2. API calls `IamSmartProvider.startVerification()` → returns OGCIO authorization URL
3. User completes iAM Smart authentication on their phone (QR code or app redirect)
4. OGCIO redirects back to OpenTrade callback URL with authorization code
5. API exchanges code for identity token (HKID + name)
6. API computes `identityHash = SHA-256(HKID + per-user-salt)`, discards raw HKID
7. API stores `identityHash` in `User.identityHash` column; checks uniqueness (same hash = same person = Sybil blocked)
8. KOL application proceeds

### D3: Transition-period soft verification

Until iAM Smart production credentials are obtained, KOL identity uses a soft-verification fallback:

| Layer   | Mechanism                                                                                       | Sybil strength                       |
| ------- | ----------------------------------------------------------------------------------------------- | ------------------------------------ |
| Phone   | SMS OTP → SHA-256(phone + salt) stored; same hash blocks duplicate                              | Medium (phone numbers can be bought) |
| Social  | OAuth unique binding: one YouTube/Twitter/IG account cannot be bound to multiple KolSbt holders | Medium (accounts can be created)     |
| CAPTCHA | On application submission                                                                       | Low (prevents bots only)             |

Soft-verified KOLs display a "Soft-verified (transition period)" badge. Once iAM Smart goes live, all soft-verified KOLs have 90 days to upgrade. After the grace period, soft-verified KOL status is revoked (KolSbt burned, KOL profile reverts to UNCLAIMED). The 90-day countdown is configurable via `packages/config`.

### D4: PII handling — hash-only storage

Per rule 50 (Security) and Hong Kong PDPO:

- **Never store**: raw HKID number, real name, date of birth, or any other PII returned by iAM Smart
- **Store only**: `identityHash = SHA-256(HKID + per-user-salt)` in `User.identityHash`
- **Per-user salt**: generated at verification time, stored alongside the hash in a separate column `User.identitySalt`
- **Log policy**: identity verification events log `userId` only, never PII
- **Data retention**: if a user requests account deletion, `identityHash` and `identitySalt` are zeroed (the KolSbt on-chain record remains per rule 00, but the civil identity link is severed)

### D5: DB schema additions

```prisma
model User {
  // existing fields...
  identityHash      String?   @unique  // SHA-256(civil_id + salt); null if unverified
  identitySalt      String?            // per-user salt for identity hashing
  identityProvider  String?            // "iam_smart" | "phone_social" | null
  identityVerifiedAt DateTime?
}
```

The `@unique` constraint on `identityHash` is the Sybil prevention mechanism: if two users produce the same hash, the second verification is rejected.

### D6: Future regional adapters (not implemented in Phase 2)

| Region         | Provider                   | Status             |
| -------------- | -------------------------- | ------------------ |
| Hong Kong      | iAM Smart (智方便)         | Phase 2 (this ADR) |
| Taiwan         | TW FidO (台灣行動身分識別) | Reserved, Phase 6+ |
| Singapore      | SingPass (Myinfo)          | Reserved, Phase 6+ |
| United States  | ID.me / Login.gov          | Reserved, Phase 6+ |
| European Union | eIDAS 2.0                  | Reserved, Phase 6+ |

Each adapter implements `IIdentityProvider` with its region-specific OAuth flow. The core application layer is adapter-agnostic: it calls `provider.completeVerification()` and stores the resulting `identityHash` regardless of which civil ID system produced it.

## Alternatives Considered

### A1: No civil identity verification — social OAuth only

- Pros: Fast to implement; no government dependency; works globally
- Cons: Social accounts are trivially purchasable in bulk; fundamentally does not solve Sybil for KOL signal integrity
- Why rejected: KOL Sybil prevention is a critical-path requirement, not a nice-to-have

### A2: KYC via third-party provider (Onfido, Jumio)

- Pros: Commercial API, fast integration (days not months); works globally
- Cons: Stores PII (passport scans, selfies) with a third party; expensive per-verification ($1-5 USD); does not provide same-person-same-ID deterministic matching (two scans of the same passport may not produce the same hash)
- Why rejected: Cannot guarantee deterministic Sybil detection; PII handling risk; cost scales with KOL count

### A3: Phone number only

- Pros: Universal, fast, cheap
- Cons: Phone numbers can be bought in bulk (HK prepaid SIMs are ~$50 HKD each); provides weak Sybil resistance
- Why rejected: Used only as transition-period fallback, not primary mechanism

### A4: On-chain identity (WorldCoin, Gitcoin Passport)

- Pros: Maximally decentralized; on-chain composable
- Cons: WorldCoin's iris scanning raises severe privacy concerns; Gitcoin Passport relies on social graph scoring (gameable); neither has HK government-level trust
- Why rejected: Government digital identity aligns better with OpenTrade's "embrace regulation" positioning

## Consequences

### Positive

- Government-grade Sybil prevention (one HKID = one KOL identity, guaranteed by HKSAR)
- Aligns with "embrace regulation" strategic narrative for CCMF grant application
- `IIdentityProvider` interface future-proofs multi-region expansion
- Hash-only storage eliminates PII liability
- Transition-period fallback ensures Phase 2 launch is not blocked by government approval timeline

### Negative / Trade-offs

- iAM Smart approval takes 3-6 months (mitigated by transition-period fallback)
- HK-only in Phase 2 (mitigated by interface design for future adapters)
- Per-user salt means the platform cannot do cross-user deduplication analysis without iterating all users (acceptable at Phase 2 scale)
- Users outside HK cannot become KOLs in Phase 2 (acceptable per vision §三 Phase 1-2 focus on HK)

### Neutral

- Privy auth flow is unchanged — iAM Smart is an additional verification step, not a replacement
- Existing L1-L4 SBT tier system is unaffected — KolSbt is a parallel identity token

## Implementation Notes

- `IIdentityProvider` interface: `packages/shared/src/identity/IIdentityProvider.ts`
- iAM Smart adapter: `packages/shared/src/identity/IamSmartProvider.ts` (stub in M8; real implementation when OGCIO credentials obtained)
- Phone+social fallback adapter: `packages/shared/src/identity/PhoneSocialProvider.ts`
- DB migration: `User.identityHash` + `User.identitySalt` + `User.identityProvider` + `User.identityVerifiedAt` columns
- Config: `packages/config/src/identity.ts` — transition period grace days, supported providers per region
- Integration with KOL onboarding flow in M8.8 (API) and M9.3 (console UI)

## References

- Parent ADR: [ADR-0036](./0036-kol-signal-architecture.md) — KOL signal architecture (D2 references this ADR)
- Related ADR: [ADR-0005](./0005-privy-aa-wallet.md) — Privy auth (coexists, not replaced)
- Related ADR: [ADR-0022](./0022-l2-commitment-hash-verification.md) — commitment-hash pattern (similar hash-only storage)
- Cursor rule 50 — PII protection, encryption, log policy
- iAM Smart developer portal: https://www.iamsmart.gov.hk/en/developer.html
- Hong Kong PDPO: https://www.pcpd.org.hk/
- STAGING.md S2 (this row removed upon ADR acceptance)
