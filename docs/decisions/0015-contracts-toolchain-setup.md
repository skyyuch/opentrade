# ADR-0015: packages/contracts toolchain setup

## Status

Accepted

## Date

2026-05-17

## Context

Phase 0's last package to bootstrap is `packages/contracts`, the on-chain
source of truth for every review hash, KOL signal, jury vote, and SBT in
the OpenTrade protocol. Earlier ADRs already fix the strategic shape of
that package:

- [ADR-0001](./0001-base-l2.md) — Base L2 as primary chain, OP Stack-generic.
- [ADR-0006](./0006-ddd-modular-monolith.md) — apps/api domains talk to
  contracts through an adapter layer, so the contract package must export
  a stable ABI surface without dragging business code into the API.
- [ADR-0007](./0007-no-token-in-v1.md) — no native token in V1, which means
  no token contract, no staking contract, and no airdrop contract in
  Phase 1–3 even though their interfaces will eventually live here.
- [ADR-0008](./0008-jury-phased.md) — `JuryPool` + `DisputeArbitration`
  must be designed for the full Kleros flow even though V1 only ships
  the SBT-only subset.
- [`.cursor/rules/41-solidity-contracts.mdc`](../../.cursor/rules/41-solidity-contracts.mdc)
  — Foundry + OpenZeppelin + UUPS + solc ≥ 0.8.24.

What was still unresolved at the start of Commit number-eight:

1. Which OpenZeppelin major to pin (v4 still maintained vs v5 with
   reorganised paths)?
2. How to install OZ when `forge install` fails to resolve recent v5 tags
   on Foundry 1.7.1?
3. Which `evm_version` to compile against — `paris`, `shanghai`, or
   `cancun`?
4. Should solhint extend `solhint:recommended`, or curate a hand-picked
   ruleset?
5. Which formatter wins for `.sol` files — `forge fmt` or
   `prettier-plugin-solidity`?
6. How aggressive should Phase 0 be about writing real contracts versus
   only laying the toolchain?

Without an ADR these answers would slowly drift across PRs, future agents
would re-litigate them, and the "no `security/` vs `utils/` confusion in
Phase 1" risk would compound.

## Decision

Eight coordinated decisions, each one a deliberate Phase 0 commitment:

### D1. Phase 0 ships toolchain only, no business contracts

`packages/contracts/src/` and `packages/contracts/script/` stay empty in
Phase 0. Only `test/Sanity.t.sol` exists, and only to prove the toolchain
is wired end-to-end. `ReviewRegistry`, `JuryPool`, `DisputeArbitration`,
`SignalLogger`, `BrokerSBT`, and `ReviewerSBT` are explicitly deferred to
the Phase that owns each one (per ADR-0008 / ADR-0007 / vision §3.1).

This protects the project from a half-finished `ReviewRegistry` shipped
without its real audit and tests just to "show progress".

### D2. OpenZeppelin v5.6.1 (not v4.x), pinned via git submodule

- `lib/openzeppelin-contracts` at tag `v5.6.1` (commit `5fd1781b`).
- `lib/openzeppelin-contracts-upgradeable` at tag `v5.6.1`
  (commit `7bf4727a`).

v5 is the current major from OpenZeppelin (released early 2024, on patch
chain `v5.6.x` as of this ADR). It reorganises directories that v4 used
(notably `security/Pausable.sol` is now `utils/Pausable.sol`), so every
import path in the codebase from day one matches the version we will keep
upgrading inside the v5.x line.

Pinning is via `git submodule add` because `forge install OpenZeppelin/
openzeppelin-contracts@v5.5+` clones the repository but then fails to
resolve the tag on Foundry 1.7.1 — a known upstream issue. The raw
`git submodule add` + `git checkout v5.6.1` flow is one extra step but
yields the same result without depending on a Foundry patch.

### D3. solc 0.8.24, evm_version "paris", deterministic bytecode

- `solc_version = "0.8.24"` matches rule 41's pin and is OpenZeppelin
  v5's minimum.
- `evm_version = "paris"` is the lowest common denominator across every
  OP Stack rollup today. Cancun (with `PUSH0`, `TLOAD`, `TSTORE`) is
  supported on Base mainnet but not universally on every OP Stack chain
  we may target later; "paris" keeps every contract portable for free.
- `bytecode_hash = "none"` and `cbor_metadata = false` strip the metadata
  hash from compiled bytecode. This makes builds byte-identical across
  machines, which makes BaseScan verification from CI runners pass
  reliably even when local dev machines have slightly different solc
  caches.

All three flags can be flipped in a future ADR — none of them encode a
business decision, only a deploy ergonomics one.

### D4. `forge fmt` is the single Solidity style source

The `[fmt]` block in `foundry.toml` (line length 120, `uint256` long
form, double quotes, thousand-separator underscores, sorted imports,
params-first multiline) is the only place where Solidity style is
configured. Two competing alternatives explicitly rejected:

- **prettier-plugin-solidity**: brings prettier into the picture, but
  every prettier config conflict (`tabWidth`, `bracketSpacing`, …) becomes
  a race condition with `forge fmt`. The vendored OpenZeppelin submodule
  also ships its own `.prettierrc` referencing the plugin, so dragging
  the plugin into our root would create a hard-to-debug duplicate path.
- **solhint formatting rules**: solhint is a linter, not a formatter. We
  use it for semantic warnings, not whitespace.

The lint-staged hook routes staged `.sol` files through
`forge fmt --root packages/contracts <files>` so pre-commit honours the
exact same `[fmt]` block as a local invocation.

### D5. solhint warning-only in Phase 0, error-level in Phase 1

`packages/contracts/.solhint.json` is a hand-curated minimal ruleset
(compiler-version, func-visibility, private-vars-leading-underscore,
no-empty-blocks, no-global-import, no-console, max-line-length=120,
ordering, reason-string=off). Every rule is `warn`, not `error`.

`solhint:recommended` is intentionally not extended in Phase 0 because:

- It defaults the majority of rules to `error`, which would block the
  toolchain smoke test on stylistic preferences that have not yet been
  agreed for the codebase.
- Phase 0 has zero business contracts; an over-strict ruleset before any
  real code lands inverts the cost/benefit ratio.

When `ReviewRegistry` lands in Phase 1, the same ADR flow that introduces
it will flip the ruleset to error-level and (probably) extend
`solhint:recommended`. The current minimal ruleset stays in place until
that PR.

### D6. Lint glob scoped to `test/**/*.sol` in Phase 0

`pnpm --filter @opentrade/contracts lint` runs solhint over
`test/**/*.sol` only. Phase 0 has nothing under `src/` or `script/`, and
solhint exits 255 (rather than 0) when its glob matches zero files. When
real `src/*.sol` files arrive, that glob expands to
`{src,test,script}/**/*.sol`.

### D7. No `[rpc_endpoints]` / `[etherscan]` blocks in `foundry.toml`

Deploy-time endpoint and verification API key configuration belongs in
environment variables (Secrets Manager in prod, `.env` in dev) per
rule 50. Storing them in `foundry.toml` would either (a) commit secrets
or (b) require dummy values that confuse future agents. Phase 1 deploy
scripts will read these from env at run time.

### D8. Defer Chainlink VRF and other oracle libraries

Per ADR-0008, jury selection uses Chainlink VRF, but only from V1 (Phase
3). Adding `smartcontractkit/chainlink-brownie-contracts` as a submodule
in Phase 0 would balloon the toolchain footprint for code we cannot
write yet. Phase 2/3 ADRs will add this library at the time the first
contract needs it.

## Alternatives Considered

### A. Pin OpenZeppelin v4.9.x instead of v5

- Pros: v4 is still maintained; some library import paths in our
  `.cursor/rules/41-solidity-contracts.mdc` examples are v4-style.
- Cons: v5 is the active major, audit fixes flow there first, and v4
  will reach end-of-life within OpenTrade's MVP horizon. Choosing v4
  buys at most 6–12 months of familiarity before a forced rewrite.
- Decision: rejected. Adopt v5 now; update rule 41 examples in a
  follow-up self-review to match v5 paths.

### B. Use `forge install` exclusively (no raw `git submodule add`)

- Pros: matches Foundry-native documentation, one fewer flow for new
  contributors to learn.
- Cons: `forge install ...@v5.5+` reproducibly fails to checkout the
  requested tag on Foundry 1.7.1 even after a successful clone. Working
  around this would require pinning Foundry to an older version or
  waiting for an upstream fix, neither of which serves Phase 0's
  "unblock the toolchain" goal.
- Decision: rejected for OZ. Forge-std still uses `forge init` because
  that path works. Once Foundry resolves the v5 tag bug we may migrate
  the OZ submodules back to `forge install` (low priority — both flows
  produce identical git submodules).

### C. Adopt `prettier-plugin-solidity` for `.sol` files

- Pros: keeps `lint-staged` simple; no need for a functional
  `.lintstagedrc.mjs`.
- Cons: introduces a second formatter racing with `forge fmt`. Style
  drift between the two is inevitable (already documented in OZ's own
  `.prettierrc`).
- Decision: rejected. Single source of truth wins over convenience.

### D. Pin `evm_version` to `cancun`

- Pros: enables transient storage (`TLOAD` / `TSTORE`) — a real gas win
  for Pausable / ReentrancyGuard.
- Cons: not yet universally supported across every OP Stack rollup we
  may target as multi-chain ambitions grow.
- Decision: rejected for now. A future ADR will flip the flag once
  transient storage clearly outweighs OP Stack portability.

### E. Ship a draft `ReviewRegistry.sol` in Phase 0

- Pros: appears more "complete"; gives Phase 1 a head start.
- Cons: every business contract must arrive with its own ADR, audit
  plan, and test suite (rule 41). A "draft" contract violates that
  policy and risks being shipped half-baked.
- Decision: rejected. Phase 0 is toolchain, Phase 1 is contracts.

### F. Use Hardhat instead of Foundry

- Pros: largest npm ecosystem, easier integration with TypeScript
  scripts.
- Cons: contradicts ADR-0001 and rule 41, both of which standardise on
  Foundry.
- Decision: rejected by precedent.

## Consequences

### Positive

- `pnpm --filter @opentrade/contracts {build,test,lint,fmt}` work today
  on a fresh clone (after `git submodule update --init --recursive` and
  `foundryup --install stable`).
- Every Solidity style decision lives in one file (`foundry.toml`),
  enforced by one tool (`forge fmt`), invoked from one hook
  (`.lintstagedrc.mjs`).
- OpenZeppelin v5's audit fixes flow to OpenTrade with a single
  submodule pointer bump.
- Phase 1 can start `ReviewRegistry` without first arguing about
  formatter, linter, evm target, or library version.

### Negative / Trade-offs

- `forge install` for OZ submodules is currently broken on this Foundry
  version, forcing a two-step manual install. Documented in README and
  this ADR; future Foundry fix will let us simplify.
- `forge-std` is pinned at a submodule HEAD rather than a stable tag
  (upstream does not publish tags). A future release-tagged forge-std
  would let us pin to a named version.
- solhint's warning-only Phase 0 ruleset is permissive; a Phase 1 PR
  must tighten it before merging the first business contract.
- Two formatters are still live in the repo (`prettier` for everything
  else, `forge fmt` for `.sol`), bridged by `.lintstagedrc.mjs`. Worth
  watching when prettier adds native Solidity support or when a
  ts-based Solidity formatter appears.

### Neutral

- `evm_version = paris` is conservative now; flipping to `shanghai` or
  `cancun` later is a single-line ADR.
- `bytecode_hash = none` simplifies BaseScan verification at the cost of
  losing the metadata-hash signal — fine for a public, source-published
  contract.

## Implementation Notes

Already implemented in the Commit number-eight series (commits
`89b567d` → `ff7cddf`):

- `packages/contracts/foundry.toml` with the [profile.default] and
  [fmt] blocks described in D3 and D4.
- `packages/contracts/remappings.txt` with three remappings (forge-std,
  OZ, OZ-upgradeable).
- `packages/contracts/lib/` with three git submodules pinned per D2.
- `packages/contracts/.solhint.json` + `.solhintignore` per D5.
- `packages/contracts/test/Sanity.t.sol` per D1, verifying D2 paths.
- `packages/contracts/package.json` + `packages/contracts/turbo.json`
  wiring the scripts into pnpm + turbo per D6 and prior task
  declarations in root turbo.json.
- `.lintstagedrc.mjs` (root) wiring `.sol` through `forge fmt` per D4.
- `.prettierignore` (root) excluding `lib/` so vendored libraries do
  not break `pnpm format:check`.

Follow-up work tracked elsewhere:

- Update rule 41 example imports to v5 paths (self-review item for the
  same Commit number-eight series, see `docs/03-status.md`).
- Expand solhint glob to `{src,test,script}` and tighten ruleset when
  first business contract lands (Phase 1).
- Add Chainlink VRF submodule when the first jury contract lands
  (Phase 3).
- Decide on a Foundry version pin via the `foundry-toolchain` action
  in CI (Commit number-ten).

## References

- [`.cursor/rules/41-solidity-contracts.mdc`](../../.cursor/rules/41-solidity-contracts.mdc)
- [ADR-0001](./0001-base-l2.md) — Base L2 as primary chain
- [ADR-0006](./0006-ddd-modular-monolith.md) — DDD architecture
- [ADR-0007](./0007-no-token-in-v1.md) — no token in V1
- [ADR-0008](./0008-jury-phased.md) — jury phased rollout
- [Foundry Book](https://book.getfoundry.sh/)
- [OpenZeppelin v5 release notes](https://github.com/OpenZeppelin/openzeppelin-contracts/releases)
- [`packages/contracts/README.md`](../../packages/contracts/README.md)
