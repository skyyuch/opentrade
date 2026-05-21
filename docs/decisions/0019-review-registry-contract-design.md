# ADR-0019: ReviewRegistry Contract Design

**Status**: Accepted
**Date**: 2026-05-21
**Deciders**: Project Lead + AI Agent

## Context

Phase 1 MVP-A requires an on-chain review registry — the first business smart contract for OpenTrade. Users submit reviews about Hong Kong SFC-licensed brokers, and these reviews must be immutable once on-chain (core project principle per `docs/00-vision.md`).

Key design decisions:

1. How to store reviews on-chain (full content vs hash)
2. Whether to gate review submission with on-chain SBT checks
3. Storage layout for upgradeability
4. Admin capabilities and their limits

## Decision

### D1: Content hash on-chain, full content on IPFS

The contract stores only a `bytes32 contentHash` (keccak256 of the IPFS JSON) and the `string ipfsCid`. The full review text lives on IPFS. This keeps gas costs low while maintaining verifiability — anyone can fetch the IPFS content and verify `keccak256(content) == contentHash`.

### D2: API-side SBT gate (not on-chain)

The contract does NOT enforce SBT tier checks (`require(sbt.balanceOf(msg.sender) > 0)`). Instead, the API layer verifies the user has L2+ SBT tier before constructing and submitting the transaction.

Rationale:

- Simpler contract (no cross-contract calls, no SBT dependency)
- Lower gas costs (no external call)
- Easier to upgrade gate logic without contract upgrade
- Phase 1 does not have an SBT contract yet; gating would require deploying one first
- The API already requires authentication; adding a contract-level gate is defense-in-depth that can be added later via upgrade

Trade-off: The contract can technically be called by anyone directly. In practice, the Paymaster only sponsors transactions from the OpenTrade app, and the gas cost on Base L2 without sponsorship is a natural deterrent.

### D3: UUPS upgradeable with AccessControl

Per rule 41 and ADR-0015, the contract inherits:

- `Initializable` — proxy-safe constructor
- `UUPSUpgradeable` — upgrade mechanism
- `AccessControlUpgradeable` — role-based admin
- `PausableUpgradeable` — emergency stop

Roles:

- `DEFAULT_ADMIN_ROLE` — can grant/revoke roles
- `PAUSER_ROLE` — can pause/unpause
- `UPGRADER_ROLE` — can authorise upgrades

### D4: Review struct and storage

```solidity
struct Review {
    address author;
    bytes32 brokerId;
    bytes32 contentHash;
    string ipfsCid;
    uint64 timestamp;
}

mapping(uint256 => Review) public reviews;
uint256 public reviewCount;
uint256[48] private __gap;
```

- `brokerId` is `bytes32` (keccak256 of the broker UUID) to avoid storing strings
- `timestamp` is `uint64` (sufficient until year 584,554,049,253)
- `__gap[48]` reserves 48 storage slots for future upgrades

### D5: No deletion, no modification

Per the core project red line: **no function may delete or modify a submitted review**. The contract has no `deleteReview`, `editReview`, or admin override function. Admin can only pause the contract to prevent new submissions.

## Alternatives Considered

1. **On-chain SBT gate**: More decentralised but requires deploying SBT contract first and costs more gas per review. Deferred to Phase 2+.
2. **Full review content on-chain**: Prohibitively expensive. A 500-character review would cost ~$5-10 even on L2.
3. **Ownable2Step instead of AccessControl**: Simpler but doesn't support role separation (pauser vs upgrader).

## Consequences

### Positive

- Simple, gas-efficient first contract
- Clear separation: content on IPFS, proof on-chain
- Upgradeable for future SBT gate addition
- No admin backdoor for data modification

### Negative

- No on-chain SBT gate means contract can be called directly (mitigated by Paymaster policy)
- `bytes32 brokerId` requires off-chain mapping back to broker UUID

## Implementation Notes

- Contract: `packages/contracts/src/reviews/ReviewRegistry.sol`
- Tests: `packages/contracts/test/reviews/ReviewRegistry.t.sol`
- Deploy script: `packages/contracts/script/DeployReviewRegistry.s.sol`
- After deploy, update `packages/config/src/contracts.ts` with proxy address

## References

- ADR-0001 (Base L2)
- ADR-0015 (Contracts toolchain setup)
- Rule 41 (Solidity standards)
- `docs/01-architecture.md` §4 data flow
