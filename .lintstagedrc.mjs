// lint-staged configuration for OpenTrade
// -------------------------------------------------------------------------
// Why a dedicated `.mjs` file instead of the `lint-staged` field inside
// package.json: Solidity sources cannot share the prettier toolchain we use
// for everything else, so we need a function-shaped entry. Once one entry
// goes functional, all of lint-staged has to live in this file (lint-staged
// reads either package.json *or* this file, never both).
//
// Solidity rationale (per ADR-0015 + rule 41):
//   - prettier requires `prettier-plugin-solidity` to parse `.sol` files;
//     installing that plugin would create two competing formatters in the
//     repo (prettier-plugin-solidity vs forge fmt) which inevitably drift.
//   - `forge fmt` is the canonical Foundry formatter; it reads the [fmt]
//     block in `packages/contracts/foundry.toml`, so style decisions live
//     next to the contract code instead of inside this lint-staged file.
//   - We invoke it with `--root packages/contracts` so the formatter picks
//     up that foundry.toml even when lint-staged runs from the monorepo
//     root with relative paths.

/** @type {import('lint-staged').Config} */
const config = {
  '*.{ts,tsx}': 'prettier --write',
  '*.{js,jsx,mjs,cjs}': 'prettier --write',
  '*.{json,md,yaml,yml}': 'prettier --write',
  'packages/contracts/**/*.sol': (files) => [
    `forge fmt --root packages/contracts ${files.join(' ')}`,
  ],
};

export default config;
