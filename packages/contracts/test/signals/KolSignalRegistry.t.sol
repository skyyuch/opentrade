// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { KolSignalRegistry } from "../../src/signals/KolSignalRegistry.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { Test } from "forge-std/Test.sol";

contract KolSignalRegistryTest is Test {
    KolSignalRegistry public registry;
    address public admin = makeAddr("admin");
    address public kol1 = makeAddr("kol1");
    address public kol2 = makeAddr("kol2");

    bytes32 constant KOL_ID = keccak256("kol-uuid-001");
    bytes32 constant CONTENT_HASH = keccak256("signal content json");
    string constant IPFS_CID = "bafkreitest1234567890abcdefghijklmnopqrst";
    uint8 constant ASSET_CRYPTO = 5;
    uint8 constant ASSET_INDEX = 6;
    uint8 constant ASSET_COMMODITY = 7;
    uint8 constant DIRECTION_BUY = 0;
    uint8 constant HORIZON_7D = 7;

    function setUp() public {
        KolSignalRegistry impl = new KolSignalRegistry();
        bytes memory initData = abi.encodeCall(KolSignalRegistry.initialize, (admin));
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        registry = KolSignalRegistry(address(proxy));
    }

    // =========================================================================
    // Unit tests — emit
    // =========================================================================

    function test_Emit_AsKol_Succeeds() public {
        vm.prank(kol1);
        uint256 id = registry.emitSignal(KOL_ID, CONTENT_HASH, IPFS_CID, ASSET_CRYPTO, DIRECTION_BUY, HORIZON_7D);
        assertEq(id, 0);
        assertEq(registry.signalCount(), 1);

        KolSignalRegistry.Signal memory s = registry.getSignal(0);
        assertEq(s.author, kol1);
        assertEq(s.kolId, KOL_ID);
        assertEq(s.contentHash, CONTENT_HASH);
        assertEq(keccak256(bytes(s.ipfsCid)), keccak256(bytes(IPFS_CID)));
        assertEq(s.assetClass, ASSET_CRYPTO);
        assertEq(s.direction, DIRECTION_BUY);
        assertEq(s.horizon, HORIZON_7D);
        assertGt(s.timestamp, 0);
    }

    function test_Emit_EmitsEvent() public {
        vm.prank(kol1);
        vm.expectEmit(true, true, true, true);
        emit KolSignalRegistry.SignalEmitted(
            0, kol1, KOL_ID, CONTENT_HASH, IPFS_CID, ASSET_CRYPTO, DIRECTION_BUY, HORIZON_7D
        );
        registry.emitSignal(KOL_ID, CONTENT_HASH, IPFS_CID, ASSET_CRYPTO, DIRECTION_BUY, HORIZON_7D);
    }

    function test_Emit_SequentialIds() public {
        vm.prank(kol1);
        assertEq(registry.emitSignal(KOL_ID, CONTENT_HASH, IPFS_CID, ASSET_CRYPTO, DIRECTION_BUY, HORIZON_7D), 0);

        vm.prank(kol2);
        assertEq(registry.emitSignal(keccak256("kol-002"), keccak256("other"), "QmOther", 0, 1, 30), 1);

        assertEq(registry.signalCount(), 2);
    }

    // =========================================================================
    // Unit tests — validation
    // =========================================================================

    function test_Emit_EmptyKolId_Reverts() public {
        vm.prank(kol1);
        vm.expectRevert(KolSignalRegistry.EmptyKolId.selector);
        registry.emitSignal(bytes32(0), CONTENT_HASH, IPFS_CID, ASSET_CRYPTO, DIRECTION_BUY, HORIZON_7D);
    }

    function test_Emit_EmptyContentHash_Reverts() public {
        vm.prank(kol1);
        vm.expectRevert(KolSignalRegistry.EmptyContentHash.selector);
        registry.emitSignal(KOL_ID, bytes32(0), IPFS_CID, ASSET_CRYPTO, DIRECTION_BUY, HORIZON_7D);
    }

    function test_Emit_EmptyIpfsCid_Reverts() public {
        vm.prank(kol1);
        vm.expectRevert(KolSignalRegistry.EmptyIpfsCid.selector);
        registry.emitSignal(KOL_ID, CONTENT_HASH, "", ASSET_CRYPTO, DIRECTION_BUY, HORIZON_7D);
    }

    function test_Emit_InvalidAssetClass_Reverts() public {
        vm.prank(kol1);
        vm.expectRevert(KolSignalRegistry.InvalidAssetClass.selector);
        registry.emitSignal(KOL_ID, CONTENT_HASH, IPFS_CID, 8, DIRECTION_BUY, HORIZON_7D);
    }

    /// @dev INDEX (6) is a valid asset class after the ADR-0038 D3 widening.
    function test_Emit_IndexAssetClass_Succeeds() public {
        vm.prank(kol1);
        uint256 id = registry.emitSignal(KOL_ID, CONTENT_HASH, IPFS_CID, ASSET_INDEX, DIRECTION_BUY, HORIZON_7D);
        assertEq(registry.getSignal(id).assetClass, ASSET_INDEX);
    }

    /// @dev COMMODITY (7) is a valid asset class after the ADR-0038 D3 widening.
    function test_Emit_CommodityAssetClass_Succeeds() public {
        vm.prank(kol1);
        uint256 id = registry.emitSignal(KOL_ID, CONTENT_HASH, IPFS_CID, ASSET_COMMODITY, DIRECTION_BUY, HORIZON_7D);
        assertEq(registry.getSignal(id).assetClass, ASSET_COMMODITY);
    }

    /// @dev The boundary: asset class 7 passes, 8 reverts.
    function test_Emit_AssetClassBoundary() public {
        vm.prank(kol1);
        registry.emitSignal(KOL_ID, CONTENT_HASH, IPFS_CID, 7, DIRECTION_BUY, HORIZON_7D);

        vm.prank(kol1);
        vm.expectRevert(KolSignalRegistry.InvalidAssetClass.selector);
        registry.emitSignal(KOL_ID, CONTENT_HASH, IPFS_CID, 8, DIRECTION_BUY, HORIZON_7D);
    }

    function test_Emit_InvalidDirection_Reverts() public {
        vm.prank(kol1);
        vm.expectRevert(KolSignalRegistry.InvalidDirection.selector);
        registry.emitSignal(KOL_ID, CONTENT_HASH, IPFS_CID, ASSET_CRYPTO, 3, HORIZON_7D);
    }

    function test_Emit_InvalidHorizon_Reverts() public {
        vm.prank(kol1);
        vm.expectRevert(KolSignalRegistry.InvalidHorizon.selector);
        registry.emitSignal(KOL_ID, CONTENT_HASH, IPFS_CID, ASSET_CRYPTO, DIRECTION_BUY, 0);
    }

    // =========================================================================
    // Unit tests — pause / unpause
    // =========================================================================

    function test_Pause_AsAdmin_Succeeds() public {
        vm.prank(admin);
        registry.pause();
        assertTrue(registry.paused());
    }

    function test_Emit_WhenPaused_Reverts() public {
        vm.prank(admin);
        registry.pause();

        vm.prank(kol1);
        vm.expectRevert();
        registry.emitSignal(KOL_ID, CONTENT_HASH, IPFS_CID, ASSET_CRYPTO, DIRECTION_BUY, HORIZON_7D);
    }

    function test_Unpause_ThenEmit_Succeeds() public {
        vm.prank(admin);
        registry.pause();

        vm.prank(admin);
        registry.unpause();

        vm.prank(kol1);
        registry.emitSignal(KOL_ID, CONTENT_HASH, IPFS_CID, ASSET_CRYPTO, DIRECTION_BUY, HORIZON_7D);
        assertEq(registry.signalCount(), 1);
    }

    function test_Pause_AsNonAdmin_Reverts() public {
        vm.prank(kol1);
        vm.expectRevert();
        registry.pause();
    }

    // =========================================================================
    // Unit tests — access control
    // =========================================================================

    function test_Initialize_GrantsRoles() public view {
        assertTrue(registry.hasRole(registry.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(registry.hasRole(registry.PAUSER_ROLE(), admin));
        assertTrue(registry.hasRole(registry.UPGRADER_ROLE(), admin));
    }

    // =========================================================================
    // Unit tests — immutability guarantee
    // =========================================================================

    function test_SignalDataPersistsAfterMoreEmissions() public {
        vm.prank(kol1);
        registry.emitSignal(KOL_ID, CONTENT_HASH, IPFS_CID, ASSET_CRYPTO, DIRECTION_BUY, HORIZON_7D);

        vm.prank(kol2);
        registry.emitSignal(keccak256("kol-002"), keccak256("other"), "QmOther", 0, 1, 30);

        KolSignalRegistry.Signal memory first = registry.getSignal(0);
        assertEq(first.author, kol1);
        assertEq(first.contentHash, CONTENT_HASH);
    }

    // =========================================================================
    // Unit tests — UUPS upgrade (exercises the ADR-0038 D3 widening upgrade)
    // =========================================================================

    function test_Upgrade_AsUpgrader_PreservesStateAndWidensValidation() public {
        vm.prank(kol1);
        registry.emitSignal(KOL_ID, CONTENT_HASH, IPFS_CID, ASSET_CRYPTO, DIRECTION_BUY, HORIZON_7D);

        KolSignalRegistry newImpl = new KolSignalRegistry();
        vm.prank(admin);
        registry.upgradeToAndCall(address(newImpl), "");

        // Existing signal survives the implementation swap (append-only storage).
        KolSignalRegistry.Signal memory s = registry.getSignal(0);
        assertEq(s.author, kol1);
        assertEq(s.contentHash, CONTENT_HASH);
        assertEq(registry.signalCount(), 1);

        // The widened asset-class range is live after the upgrade.
        vm.prank(kol2);
        uint256 id = registry.emitSignal(KOL_ID, CONTENT_HASH, IPFS_CID, ASSET_COMMODITY, DIRECTION_BUY, HORIZON_7D);
        assertEq(registry.getSignal(id).assetClass, ASSET_COMMODITY);
    }

    function test_Upgrade_AsNonUpgrader_Reverts() public {
        KolSignalRegistry newImpl = new KolSignalRegistry();
        vm.prank(kol1);
        vm.expectRevert();
        registry.upgradeToAndCall(address(newImpl), "");
    }

    // =========================================================================
    // Fuzz tests
    // =========================================================================

    function testFuzz_Emit_ArbitraryContent(
        bytes32 kolId,
        bytes32 contentHash,
        string calldata ipfsCid,
        uint8 assetClass,
        uint8 direction,
        uint8 horizon
    ) public {
        vm.assume(kolId != bytes32(0));
        vm.assume(contentHash != bytes32(0));
        vm.assume(bytes(ipfsCid).length > 0);
        vm.assume(assetClass <= 7);
        vm.assume(direction <= 2);
        vm.assume(horizon > 0);

        vm.prank(kol1);
        uint256 id = registry.emitSignal(kolId, contentHash, ipfsCid, assetClass, direction, horizon);

        KolSignalRegistry.Signal memory s = registry.getSignal(id);
        assertEq(s.author, kol1);
        assertEq(s.kolId, kolId);
        assertEq(s.contentHash, contentHash);
        assertEq(s.assetClass, assetClass);
        assertEq(s.direction, direction);
        assertEq(s.horizon, horizon);
    }
}
