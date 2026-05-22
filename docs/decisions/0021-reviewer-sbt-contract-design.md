# ADR-0021: ReviewerSBT Contract Design (Phase 1)

## Status

Accepted

## Date

2026-05-22

## Context

OpenTrade's identity system uses a tiered model (L0–L4, per `docs/01-architecture.md` §6). Progressing from L1 (Privy login) to L2 (verified investor) requires on-chain proof of identity verification. This proof must be:

1. **Non-transferable** — prevents buying/selling verified status
2. **One-per-address** — avoids Sybil attacks
3. **Revocable** — in case of fraud discovered post-issuance (Phase 2 dispute outcomes)
4. **Metadata-linked** — carries IPFS URI pointing to verification evidence hash

ERC-5192 (Minimal Soulbound Interface) was considered but adds complexity with no practical benefit for our single-contract use case. A simpler approach using ERC-721 with transfer blocking is sufficient and more auditable.

## Decision

### D1: ERC-721 with soulbound enforcement via `_update()` override

Use OZ v5's `ERC721Upgradeable._update()` hook to block all transfers where both `from != address(0)` (not a mint) and `to != address(0)` (not a burn). This is the canonical OZ v5 pattern for soulbound tokens — simpler than ERC-5192 and requires no additional interface support.

### D2: One mint per address

`mapping(address => bool) public hasMinted` enforces uniqueness at the contract level. Custom error `AlreadyMinted(address)` provides clear revert reason.

### D3: Four-role AccessControl

| Role                 | Holder (Phase 1)                          | Capability                               |
| -------------------- | ----------------------------------------- | ---------------------------------------- |
| `DEFAULT_ADMIN_ROLE` | Deployer/Relayer wallet                   | Grant/revoke other roles                 |
| `MINTER_ROLE`        | Deployer/Relayer wallet (= outbox worker) | Mint SBT on admin-approved verifications |
| `REVOKER_ROLE`       | Not granted in Phase 1                    | Burn SBT (Phase 2 dispute outcomes)      |
| `PAUSER_ROLE`        | Deployer/Relayer wallet                   | Emergency pause mint/revoke              |
| `UPGRADER_ROLE`      | Deployer/Relayer wallet                   | UUPS upgrade                             |

Phase 2+ will transfer `DEFAULT_ADMIN_ROLE` to a multisig and restrict `MINTER_ROLE` to a dedicated backend service identity.

### D4: UUPS upgradeable with 47-slot gap

Same pattern as `ReviewRegistry` (ADR-0019). `__gap` of 47 slots (storage starts at 3 custom slots: `tokenCount`, `hasMinted`, `_tokenURIs`; total 50 reserved) ensures future storage extension without collision.

### D5: IPFS tokenURI for verification metadata

Each minted token carries a `tokenURI` string pointing to IPFS. The JSON at that CID contains the commitment hash (per ADR-0022) but **never** raw PII. This makes verification auditable without exposing private data.

### D6: Revocation resets `hasMinted`

When `revoke(tokenId)` is called, `hasMinted[owner]` is set back to `false`, allowing re-minting after a re-verification process. This supports the flow: fraud discovered → SBT revoked → user re-applies → new SBT issued.

### D7: EVM version upgraded to Cancun

OZ v5.6.1 uses `mcopy` opcode (EIP-5656) which requires Cancun. `foundry.toml` `evm_version` changed from `paris` to `cancun`. Base Sepolia (and Base mainnet) already support Cancun.

## Alternatives Considered

- **ERC-5192 (Minimal Soulbound Interface)**: Adds `locked()` view + `Locked` event. Extra complexity with no practical consumer in Phase 1. Wallets don't widely support ERC-5192 UI yet.
- **ERC-4973 (Account Bound Token)**: Non-ERC-721 based. Breaks compatibility with existing NFT indexers, wallets, and block explorers.
- **Non-upgradeable**: Simpler, but locks us out of future bugfixes. Given the 4-role model and mainnet timeline, upgradeability is justified.
- **Separate `NonTransferableERC721` base contract**: Unnecessary abstraction for a single-contract system. The 4-line `_update()` override is trivially auditable.

## Consequences

### Positive

- Standard ERC-721 interface means block explorers (BaseScan), wallets (MetaMask), and indexers (Alchemy) recognize it immediately
- Soulbound enforcement is 4 lines — minimal attack surface
- One-mint-per-address prevents Sybil at contract level (not just application level)
- Revocation flow is clean and allows re-verification
- 17 tests (unit + fuzz) covering all branches

### Negative / Trade-offs

- ERC-721 `transferFrom` / `safeTransferFrom` still exist in the ABI (they just revert) — could confuse naive integrators
- `tokenCount` is a simple counter, not gap-safe for parallel minting (acceptable since only the single relayer wallet mints sequentially)
- No on-chain tier data — tier (L2/L3/L4) is tracked off-chain in the DB; on-chain only proves "verified" binary status

## Implementation Notes

- Contract: `packages/contracts/src/identity/ReviewerSBT.sol`
- Tests: `packages/contracts/test/identity/ReviewerSBT.t.sol` (17 tests)
- Deploy script: `packages/contracts/script/DeployReviewerSBT.s.sol`
- Config: `packages/config/src/contracts.ts` — `reviewerSbt` address entry
- Deployed (Base Sepolia): `0x31D8e863ce71c90d399Ff69eeACeC84226b3e61b` (ERC1967 Proxy)
- Deployer/Relayer: `0xD221cE091E364D24029B92bC89a3f9831e3e5d01`

## References

- ADR-0019: ReviewRegistry contract design
- ADR-0022: L2 identity verification via commitment-hash
- OpenZeppelin v5 ERC721 `_update()` hook: https://docs.openzeppelin.com/contracts/5.x/api/token/erc721#ERC721-_update-address-uint256-address-
- ERC-5192: https://eips.ethereum.org/EIPS/eip-5192
- `docs/01-architecture.md` §6: 身份分層
