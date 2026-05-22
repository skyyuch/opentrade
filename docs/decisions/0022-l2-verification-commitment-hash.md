# ADR-0022: L2 Identity Verification via Commitment-Hash (Phase 1)

## Status

Accepted

## Date

2026-05-22

## Context

To achieve L2 identity ("verified investor"), a user must prove they hold a brokerage account. This raises a conflict:

1. **Privacy requirement**: The platform must never store raw PII (account numbers, statements) — per rule 50 (PDPO compliance) and the "不可在 server log 寫入 PII" red line.
2. **Verification requirement**: An admin must be able to confirm the proof is legitimate.
3. **Non-repudiation**: Once verified, neither the user nor the platform can deny the verification occurred.

The challenge is designing a flow where the server can facilitate verification without ever seeing or storing the raw sensitive data.

## Decision

### D1: Client-side commitment hash

The user computes a **keccak256 commitment hash** on the client before submitting:

```
commitment = keccak256(abi.encodePacked(walletAddress, brokerSlug, evidenceHash, salt))
```

The server stores only the commitment (a 32-byte hex string). The raw inputs are never sent to or stored by the server.

### D2: Evidence on IPFS (encrypted)

The user uploads their broker account evidence (e.g., a screenshot or PDF of a statement) to IPFS. The evidence can be encrypted client-side before upload (Phase 2 enhancement). The `evidenceIpfsCid` is stored in the verification request so admins can retrieve and review it.

### D3: Server stores commitment + CID, never raw data

The `SbtVerificationRequest` model stores:

| Field             | Purpose                                            |
| ----------------- | -------------------------------------------------- |
| `commitment`      | keccak256 hash — proves what the user committed to |
| `evidenceIpfsCid` | IPFS pointer to the evidence document              |
| `brokerSlug`      | Which broker the user claims an account with       |
| `status`          | PENDING → APPROVED / REJECTED                      |

The server cannot reconstruct the raw evidence from the commitment alone.

### D4: Admin review + approve triggers SBT mint

Flow:

1. User submits `POST /v1/auth/verify-broker` with `{ brokerSlug, commitment, evidenceIpfsCid }`
2. Server validates format and creates a `PENDING` request (one pending per user)
3. Admin reviews evidence (retrieves IPFS CID content)
4. Admin calls `POST /v1/auth/admin/verifications/:id/approve`
5. Within a DB transaction:
   - Request status → `APPROVED`
   - User `sbtTier` → `L2`, `role` → `REVIEWER`
   - OutboxEvent created: `sbt.mint_requested`
6. Outbox worker picks up event → calls `ReviewerSBT.mint(walletAddress, tokenURI)`

### D5: Review submission gated behind `reviewer` role

Once `role` is upgraded to `REVIEWER`, the user can submit reviews via `POST /v1/reviews`. Users with only `USER` role cannot submit reviews — this ensures every reviewer has been verified.

### D6: One pending request per user

To prevent spam, the API rejects with HTTP 409 CONFLICT if a user already has a `PENDING` verification request. They must wait for resolution before submitting again.

## Alternatives Considered

- **Full zk-proof (zk-SNARK / zk-STARK)**: Ideal for Phase 2+ — user proves "I have an account at broker X with balance > $Y" without revealing anything. Too complex for Phase 1 MVP (circuit design, trusted setup, verification gas costs). The commitment-hash scheme is a pragmatic stepping stone.
- **Server-side KYC service (Jumio, Onfido)**: Traditional approach where the server sees all PII. Violates our PDPO principles and creates a honeypot. Also expensive ($2-5 per verification).
- **No verification (trust users)**: Allows fake reviews from non-customers. Defeats the platform's credibility proposition.
- **OAuth with broker API**: No broker in Hong Kong exposes user-facing OAuth APIs for account verification.

## Consequences

### Positive

- Server never stores raw PII — PDPO compliant by design
- Commitment hash is non-repudiable: user cannot later deny what they committed to
- Natural upgrade path to full zk-proofs in Phase 2 (commitment scheme is a subset)
- Admin workflow is simple and auditable
- SBT mint is triggered automatically on approval — no manual on-chain action needed

### Negative / Trade-offs

- Phase 1 relies on admin judgment (human review of IPFS evidence) — not fully decentralized
- Evidence on IPFS is accessible to anyone with the CID (encrypted upload is Phase 2)
- No automated broker account verification — manual process doesn't scale past ~100 verifications/week
- Commitment without full zk-proof means the commitment alone doesn't prove account ownership (it proves the user committed to specific data)

## Implementation Notes

- Prisma model: `SbtVerificationRequest` in `packages/db/prisma/schema.prisma`
- Enum: `VerificationStatus` (PENDING / APPROVED / REJECTED)
- API endpoints (in `apps/api/src/domains/identity/presentation/routes.ts`):
  - `POST /v1/auth/verify-broker` — user submits verification
  - `GET /v1/auth/verification-status` — user checks their requests
  - `GET /v1/auth/admin/verifications` — admin lists pending
  - `POST /v1/auth/admin/verifications/:id/approve` — triggers SBT mint
  - `POST /v1/auth/admin/verifications/:id/reject`
- Outbox event type: `sbt.mint_requested` (processed by outbox worker → `ReviewerSBT.mint()`)

## References

- ADR-0021: ReviewerSBT contract design
- ADR-0019: ReviewRegistry contract design (outbox pattern reference)
- Rule 50: Security & Privacy Standards (PII protection)
- `docs/01-architecture.md` §6: 身份分層 (L0–L4 tier model)
- PDPO (Hong Kong Personal Data Privacy Ordinance)
