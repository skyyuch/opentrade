# ADR-0022: L2 Identity Verification via Commitment-Hash Scheme (Phase 1)

## Status

Accepted

## Date

2026-05-22

## Context

OpenTrade's L2 SBT tier requires users to prove they hold an account with a specific broker, without revealing their actual account number or personal details to the platform server. The full vision (docs/00-vision.md) calls for zk-proof verification, but implementing a complete SNARK circuit in Phase 1 is not feasible.

We need a pragmatic Phase 1 approach that:

1. Preserves user privacy (raw account data never reaches the server)
2. Provides a verifiable commitment that can be checked later
3. Allows manual admin review of encrypted evidence
4. Is upgradeable to full zk-proof in Phase 2+

## Decision

### Phase 1: Commitment-Hash Scheme

1. **Frontend** computes: `commitment = keccak256(abi.encodePacked(walletAddress, brokerSlug, accountNumber, salt))`
2. **Frontend** encrypts the broker statement screenshot and uploads to IPFS (only admin can decrypt to verify)
3. **API** receives `{ commitment, brokerSlug, evidenceIpfsCid }` — never the raw account number
4. **Admin** reviews the encrypted evidence, approves or rejects
5. On approval: API mints ReviewerSBT on-chain + updates User.sbtTier to L2 + User.role to REVIEWER

### Data Flow

```
User Browser                    API Server              Admin
─────────────                   ──────────              ─────
1. Enter broker + account no.
2. Compute commitment hash
3. Encrypt screenshot → IPFS
4. POST /v1/identity/verify     → Create SbtVerificationRequest
                                                        5. Review evidence
                                                        6. POST /admin/.../approve
                                ← Mint SBT on-chain
                                ← Update User (L2, REVIEWER)
```

### Privacy Guarantees

- The server never sees the raw account number (per rule 50, PII protection)
- The commitment can be verified against future disputes
- Evidence is encrypted (admin-only decryption key)
- Per ADR-0019, the commitment is not stored on-chain (only the SBT is)

## Alternatives Considered

- **Full SNARK circuit (circom/snarkjs)**: Maximum privacy but 4-6 weeks of circuit development. Deferred to Phase 2+.
- **Plain upload (no commitment)**: Server sees raw data. Violates privacy principles.
- **Third-party KYC provider (Onfido, Jumio)**: Expensive, complex integration, and still requires raw data to reach a server. Not suitable for Phase 1 budget.

## Consequences

### Positive

- User privacy preserved at API level
- Simple implementation (no circuit development)
- Admin can still verify legitimacy of claims
- Clean upgrade path to full zk-proof in Phase 2

### Negative / Trade-offs

- Requires admin manual review (does not scale beyond early adoption)
- Evidence encryption/decryption adds complexity
- Commitment alone cannot prove statement authenticity (admin trust required)

## Implementation Notes

- New Prisma model: `SbtVerificationRequest`
- New API endpoints under `/v1/identity/` and `/v1/admin/verifications/`
- Frontend: `/[locale]/verify/page.tsx` with commitment computation via viem
- Review submission gate: check `sbtTier >= L2` in authMiddleware

## References

- ADR-0021: ReviewerSBT contract design
- ADR-0019: ReviewRegistry contract design (D2: API-side SBT gate)
- docs/01-architecture.md §6: Identity tier system
- docs/00-vision.md: zk-proof vision
