// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { KolNoteRegistry } from "../src/notes/KolNoteRegistry.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { Script, console2 } from "forge-std/Script.sol";

/// @title  DeployKolNoteRegistry — UUPS proxy deployment for KolNoteRegistry.
/// @notice Run with: forge script script/DeployKolNoteRegistry.s.sol --rpc-url $RPC --broadcast
contract DeployKolNoteRegistry is Script {
    function run() external {
        address admin = vm.envAddress("DEPLOY_ADMIN");

        vm.startBroadcast();

        KolNoteRegistry impl = new KolNoteRegistry();
        bytes memory initData = abi.encodeCall(KolNoteRegistry.initialize, (admin));
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);

        vm.stopBroadcast();

        console2.log("Implementation:", address(impl));
        console2.log("Proxy:", address(proxy));
        console2.log("Admin:", admin);
    }
}
