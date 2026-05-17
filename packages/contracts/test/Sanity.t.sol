// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Test } from "forge-std/Test.sol";

/// @title  Toolchain smoke test for packages/contracts.
/// @notice This file deliberately contains no business logic. Its only
///         purposes are to prove that:
///           1. `forge test` runs end-to-end against the OpenTrade
///              foundry.toml configuration.
///           2. The pinned OpenZeppelin v5.6.1 import paths resolve, for
///              both the non-upgradeable and the upgradeable variants.
///           3. CI has a green signal before any real contract lands.
/// @dev    Every real contract (ReviewRegistry, JuryPool, SignalLogger,
///         the SBT suite) belongs to Phase 1+ and arrives with its own
///         dedicated test file. Do not graft business assertions onto
///         this canary — keep it boring on purpose.
contract SanityTest is Test {
    function test_ForgeRunnerIsAlive() public pure {
        assertTrue(true, "forge test runner did not execute this assertion");
    }

    function test_OpenZeppelinTypeNamesResolve() public pure {
        // Referencing `type(C).name` forces solc to fully analyse the
        // import graph without instantiating anything (both contracts
        // are abstract in OZ v5). If either remapping ever drifts, this
        // assertion fails at compile time, not at runtime.
        assertEq(type(Ownable).name, "Ownable");
        assertEq(type(OwnableUpgradeable).name, "OwnableUpgradeable");
    }
}
