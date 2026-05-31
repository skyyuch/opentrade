// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { KolSignalRegistry } from "../src/signals/KolSignalRegistry.sol";
import { Script, console2 } from "forge-std/Script.sol";

/// @title  UpgradeKolSignalRegistry — UUPS implementation swap for the
///         deployed KolSignalRegistry proxy.
/// @notice Deploys a fresh KolSignalRegistry implementation and points the
///         existing proxy at it via UUPS `upgradeToAndCall`. Used to ship the
///         ADR-0038 D3 widening of the asset-class range (0-5 → 0-7). Storage
///         layout is append-only, so no reinitializer is required and the call
///         data is empty.
/// @dev    The broadcasting key MUST hold `UPGRADER_ROLE` on the proxy. Run:
///         forge script script/UpgradeKolSignalRegistry.s.sol \
///           --rpc-url $RPC --broadcast
///         with KOL_SIGNAL_REGISTRY_ADDRESS set to the deployed proxy address.
contract UpgradeKolSignalRegistry is Script {
    function run() external {
        address proxy = vm.envAddress("KOL_SIGNAL_REGISTRY_ADDRESS");

        vm.startBroadcast();

        KolSignalRegistry newImpl = new KolSignalRegistry();
        KolSignalRegistry(proxy).upgradeToAndCall(address(newImpl), "");

        vm.stopBroadcast();

        console2.log("Proxy:", proxy);
        console2.log("New implementation:", address(newImpl));
    }
}
