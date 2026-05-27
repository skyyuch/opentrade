// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { KolSbt } from "../src/identity/KolSbt.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { Script, console2 } from "forge-std/Script.sol";

/// @title  DeployKolSbt — UUPS proxy deployment for the KolSbt contract.
/// @notice Run with: forge script script/DeployKolSbt.s.sol --rpc-url $RPC --broadcast
contract DeployKolSbt is Script {
    function run() external {
        address admin = vm.envAddress("DEPLOY_ADMIN");

        vm.startBroadcast();

        KolSbt impl = new KolSbt();
        bytes memory initData = abi.encodeCall(KolSbt.initialize, (admin));
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);

        vm.stopBroadcast();

        console2.log("Implementation:", address(impl));
        console2.log("Proxy:", address(proxy));
        console2.log("Admin:", admin);
    }
}
