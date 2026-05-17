# `@opentrade/contracts`

> Solidity smart contracts on Base L2 (OP Stack–generic). The on-chain source
> of truth for every review hash, KOL signal, jury vote, and SBT in the
> OpenTrade protocol.

---

## Phase 0 status — toolchain ready, business contracts deferred

This package ships an end-to-end Solidity toolchain (Foundry + OpenZeppelin
v5 + solhint) but **no business contracts yet**. That is deliberate, not
unfinished: per [ADR-0015](../../docs/decisions/0015-contracts-toolchain-setup.md),
Phase 0 only lays the foundation. The real contracts (`ReviewRegistry`,
`JuryPool`, `DisputeArbitration`, `SignalLogger`, `BrokerSBT` /
`ReviewerSBT`) belong to Phases 1–3 and arrive with their own dedicated
ADRs, test suites, and audits.

What you can do today:

```bash
pnpm --filter @opentrade/contracts build   # forge build (compiles OZ + Sanity test)
pnpm --filter @opentrade/contracts test    # forge test (2 sanity tests pass)
pnpm --filter @opentrade/contracts lint    # solhint warning-only on test/
pnpm --filter @opentrade/contracts fmt     # forge fmt -- the canonical formatter
```

The single `test/Sanity.t.sol` exists to prove the toolchain is alive
end-to-end and that the OpenZeppelin remappings resolve. It is the canary,
not a template — every real contract gets its own test file.

---

## Toolchain

| Layer            | Tool                                                                                                       | Pinned at                       |
| ---------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Compiler         | `solc` via Foundry                                                                                         | `0.8.24`                        |
| Build / test     | [Foundry](https://book.getfoundry.sh/)                                                                     | `forge 1.7.1`                   |
| EVM target       | `paris` — lowest common denominator across OP Stack today                                                  | configurable in `foundry.toml`  |
| Base library     | [OpenZeppelin Contracts](https://github.com/OpenZeppelin/openzeppelin-contracts)                           | `v5.6.1`                        |
| Upgradeable base | [OpenZeppelin Contracts (Upgradeable)](https://github.com/OpenZeppelin/openzeppelin-contracts-upgradeable) | `v5.6.1`                        |
| Test helpers     | [forge-std](https://github.com/foundry-rs/forge-std)                                                       | submodule HEAD                  |
| Linter           | [solhint](https://github.com/protofire/solhint)                                                            | `^6.2.1` (warning-only Phase 0) |
| Formatter        | `forge fmt`                                                                                                | rules in `foundry.toml [fmt]`   |

Phase 1+ adds:

- **UUPS Proxy** — every business contract is upgradeable behind an
  OpenZeppelin UUPS proxy with 2-of-3 multisig + 48h timelock.
- **Chainlink VRF** — for the per-dispute jury random selection
  ([ADR-0008](../../docs/decisions/0008-jury-phased.md)).

Both land via `forge install` from the Phase that needs them, not now.

---

## Directory layout

```
packages/contracts/
├── foundry.toml            # Compiler + formatter config (the source of truth)
├── remappings.txt          # @openzeppelin/contracts/ and forge-std/ paths
├── .solhint.json           # Warning-only ruleset (see ADR-0015 §"Linting policy")
├── .solhintignore          # Excludes lib/, out/, cache/, broadcast/
├── turbo.json              # Per-package overrides for build inputs/outputs
├── src/                    # ← Business contracts live here from Phase 1 onward
├── script/                 # ← Foundry deploy / upgrade scripts (Phase 1+)
├── test/
│   └── Sanity.t.sol        # Toolchain smoke test (NOT a template)
└── lib/                    # git submodules (do not edit)
    ├── forge-std/
    ├── openzeppelin-contracts/
    └── openzeppelin-contracts-upgradeable/
```

---

## First-time setup

The `lib/` directory holds **git submodules**. A fresh `git clone` of the
monorepo does **not** pull them by default. Run this once after cloning:

```bash
# From the monorepo root
git submodule update --init --recursive
```

Then install Foundry locally (skip if `forge --version` already works):

```bash
curl -L https://foundry.paradigm.xyz | bash
~/.foundry/bin/foundryup --install stable
# Open a new terminal so ~/.zshenv (or ~/.bashrc) is sourced and forge is in PATH.
forge --version    # → forge Version: 1.7.x
```

Now the standard pnpm flows work:

```bash
pnpm install                                  # also generates Prisma types etc.
pnpm --filter @opentrade/contracts build      # forge build
pnpm --filter @opentrade/contracts test       # forge test
```

---

## Critical contract rules (enforced from Phase 1 by [rule 41](../../.cursor/rules/41-solidity-contracts.mdc))

- ❌ NO `selfdestruct`, NO `tx.origin`-based auth, NO `block.difficulty`-based
  randomness.
- ❌ NO admin function that mutates user content — even a paused / upgraded
  contract cannot delete a review (this is the protocol's whole reason for
  existing, per [`docs/00-vision.md`](../../docs/00-vision.md) §2).
- ❌ NO `require(... , "string")` — every revert path uses a custom error
  (gas, i18n).
- ✅ All upgrades go through 2-of-3 multisig + 48h timelock.
- ✅ 100% function coverage in Forge tests (unit + fuzz + invariant).
- ✅ Mainnet deployment requires a third-party audit (CertiK / Trail of Bits
  / Hacken) before the multisig signs the proxy upgrade.

---

## Why these specific decisions

See [ADR-0015](../../docs/decisions/0015-contracts-toolchain-setup.md) for
the rationale behind:

- OpenZeppelin v5 vs v4 (v5 reorganised `security/` → `utils/`; we follow
  upstream).
- Submodule install via raw `git submodule add` instead of `forge install`
  (the latter has a tag-resolution bug for recent v5 releases on this
  toolchain version).
- Solhint as warning-only in Phase 0, switching to error-level when the
  first business contract lands.
- `forge fmt` (not `prettier-plugin-solidity`) as the single formatter so
  the `[fmt]` block in `foundry.toml` is the only style source.

---

## Related docs

- [`docs/00-vision.md`](../../docs/00-vision.md) — why the contracts cannot
  delete user content
- [`docs/01-architecture.md`](../../docs/01-architecture.md) §4.5 —
  on-chain layer overview
- [ADR-0001](../../docs/decisions/0001-base-l2.md) — Base L2 as primary chain
- [ADR-0007](../../docs/decisions/0007-no-token-in-v1.md) — no token in V1
  (Points system instead)
- [ADR-0008](../../docs/decisions/0008-jury-phased.md) — jury phased rollout
- [ADR-0015](../../docs/decisions/0015-contracts-toolchain-setup.md) —
  contracts toolchain setup
- [`.cursor/rules/41-solidity-contracts.mdc`](../../.cursor/rules/41-solidity-contracts.mdc)
  — Solidity standards
