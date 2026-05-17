# `@opentrade/contracts`

> Solidity smart contracts on Base L2 (OP Stack–generic).

## Purpose

The on-chain logic of OpenTrade:

- `ReviewRegistry` — append-only review hashes (rule: NO delete function ever)
- `JuryPool` + `DisputeArbitration` — decentralised jury system per [ADR-0008](../../docs/decisions/0008-jury-phased.md)
- `SignalLogger` — KOL trading signals timestamped by the chain
- `BrokerSBT` / `ReviewerSBT` — soulbound identity tokens

## Toolchain

- **Foundry** (forge / cast / anvil) — per [ADR-0001](../../docs/decisions/0001-base-l2.md)
- **OpenZeppelin Contracts (Upgradeable)** — never reinvent
- **UUPS Proxy** — every business contract is upgradeable behind a proxy with timelock + multisig
- **Chainlink VRF** — for jury random selection

## Critical rules (per cursor rule 41)

- ❌ NO `selfdestruct`, NO `tx.origin`-based auth, NO `block.difficulty`-based randomness
- ❌ NO admin function that mutates user content (no delete-review backdoor)
- ✅ All upgrades go through 2-of-3 multisig + 48h timelock
- ✅ 100% function coverage in Forge tests
- ✅ Mainnet deployments require a third-party audit (CertiK / Trail of Bits / Hacken)

## Status

Phase 0 stub — Foundry not yet initialised. Foundry init + first contract stubs land in Phase 1 (Commit #3+).

See [`docs/01-architecture.md`](../../docs/01-architecture.md) §4.5.
