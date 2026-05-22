# ADR-0021: ReviewerSBT Contract Design (Phase 1)

## Status

Accepted

## Date

2026-05-22

## Context

OpenTrade's identity tier system (L0-L4, per `docs/01-architecture.md` §6) requires an on-chain Soulbound Token to represent verified reviewer status (L2+). The SBT serves as a tamper-proof credential that:

1. Proves a user has verified their brokerage relationship (L2)
2. Cannot be transferred or sold (soulbound property)
3. Is used by the API to gate review submission (per ADR-0019 D2)

Per the project's core principles, the token must be non-transferable and follow the same UUPS upgradeable pattern established in ReviewRegistry (ADR-0019).

## Decision

Deploy a **ReviewerSBT** contract with the following design:

### D1: One SBT per user (not per broker)

A single token represents the user's overall verified status. The token metadata (on IPFS) can list which brokers the user has verified with, but the on-chain token is singular per wallet.

### D2: ERC721 Soulbound via `_update()` override

Override OpenZeppelin v5's `_update()` to revert on any transfer where `from != address(0)` and `to != address(0)` (i.e., only mint and burn are allowed). This is the canonical OZ v5 pattern for soulbound tokens.

### D3: Role-based minting

- `MINTER_ROLE` — granted to the API relayer wallet. The API triggers mint after admin approves an L2 verification request.
- `REVOKER_ROLE` — reserved for future revocation flows (not used in Phase 1).
- `DEFAULT_ADMIN_ROLE` — multisig in production.

### D4: One mint per address

A `hasMinted` mapping prevents duplicate mints. A user can only hold one ReviewerSBT.

### D5: UUPS Upgradeable

Same pattern as ReviewRegistry: Initializable + UUPSUpgradeable + AccessControlUpgradeable + PausableUpgradeable.

## Alternatives Considered

- **ERC1155 multi-token**: More flexible but adds unnecessary complexity for a single-token-per-user model. We can migrate to ERC1155 in Phase 3+ if needed.
- **ERC5192 (Minimal Soulbound)**: Only adds a `locked()` view function. The `_update()` override is simpler and more widely understood.
- **No on-chain SBT (just DB flag)**: Defeats the purpose of decentralized identity. Users must be able to prove their status without trusting OpenTrade's database.

## Consequences

### Positive

- On-chain proof of verified reviewer status
- Cannot be transferred, preventing credential marketplace abuse
- Follows established UUPS pattern, reducing audit scope
- Future-proof: REVOKER_ROLE and metadata can be extended without contract replacement

### Negative / Trade-offs

- Gas cost per mint (mitigated by Base L2 low fees)
- Metadata is off-chain (IPFS) so not fully self-contained
- One SBT per user means tier upgrades (L2→L3) require metadata update, not a new token

## Implementation Notes

- Contract: `packages/contracts/src/identity/ReviewerSBT.sol`
- Tests: `packages/contracts/test/identity/ReviewerSBT.t.sol`
- Deploy script: `packages/contracts/script/DeployReviewerSBT.s.sol`
- Add `reviewerSbt` address to `packages/config/src/contracts.ts`

## References

- ADR-0019: ReviewRegistry contract design
- ADR-0015: packages/contracts toolchain setup
- `docs/01-architecture.md` §6: Identity tier system
- OpenZeppelin ERC721 v5 docs
