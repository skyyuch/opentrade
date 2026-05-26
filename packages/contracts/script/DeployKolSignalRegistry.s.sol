// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { KolSignalRegistry } from "../src/signals/KolSignalRegistry.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { Script, console2 } from "forge-std/Script.sol";

/// @title  DeployKolSignalRegistry — deterministic UUPS proxy deployment.
/// @notice Run with: forge script script/DeployKolSignalRegistry.s.sol --rpc-url $RPC --broadcast
contract DeployKolSignalRegistry is Script {
    function run() external {
        address admin = vm.envAddress("DEPLOY_ADMIN");

        vm.startBroadcast();

        KolSignalRegistry impl = new KolSignalRegistry();
        bytes memory initData = abi.encodeCall(KolSignalRegistry.initialize, (admin));
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);

        vm.stopBroadcast();

        console2.log("Implementation:", address(impl));
        console2.log("Proxy:", address(proxy));
        console2.log("Admin:", admin);
    }
}
