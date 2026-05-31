// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { KolNoteRegistry } from "../../src/notes/KolNoteRegistry.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { Test } from "forge-std/Test.sol";

contract KolNoteRegistryTest is Test {
    KolNoteRegistry public registry;
    address public admin = makeAddr("admin");
    address public kol1 = makeAddr("kol1");
    address public kol2 = makeAddr("kol2");

    bytes32 constant KOL_ID = keccak256("kol-uuid-001");
    bytes32 constant CONTENT_HASH = keccak256("note content json");
    string constant IPFS_CID = "bafkreitest1234567890abcdefghijklmnopqrst";
    uint256 constant STANDALONE = 0;
    uint256 constant LINKED_SIGNAL = 42;

    function setUp() public {
        KolNoteRegistry impl = new KolNoteRegistry();
        bytes memory initData = abi.encodeCall(KolNoteRegistry.initialize, (admin));
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        registry = KolNoteRegistry(address(proxy));
    }

    // =========================================================================
    // Unit tests — emit
    // =========================================================================

    function test_Emit_Standalone_Succeeds() public {
        vm.prank(kol1);
        uint256 id = registry.emitNote(KOL_ID, CONTENT_HASH, IPFS_CID, STANDALONE);
        assertEq(id, 0);
        assertEq(registry.noteCount(), 1);

        KolNoteRegistry.Note memory n = registry.getNote(0);
        assertEq(n.author, kol1);
        assertEq(n.kolId, KOL_ID);
        assertEq(n.contentHash, CONTENT_HASH);
        assertEq(keccak256(bytes(n.ipfsCid)), keccak256(bytes(IPFS_CID)));
        assertEq(n.linkedSignalId, STANDALONE);
        assertGt(n.timestamp, 0);
    }

    function test_Emit_LinkedToSignal_Succeeds() public {
        vm.prank(kol1);
        uint256 id = registry.emitNote(KOL_ID, CONTENT_HASH, IPFS_CID, LINKED_SIGNAL);
        assertEq(registry.getNote(id).linkedSignalId, LINKED_SIGNAL);
    }

    function test_Emit_EmitsEvent() public {
        vm.prank(kol1);
        vm.expectEmit(true, true, true, true);
        emit KolNoteRegistry.NoteEmitted(0, kol1, KOL_ID, CONTENT_HASH, IPFS_CID, LINKED_SIGNAL);
        registry.emitNote(KOL_ID, CONTENT_HASH, IPFS_CID, LINKED_SIGNAL);
    }

    function test_Emit_SequentialIds() public {
        vm.prank(kol1);
        assertEq(registry.emitNote(KOL_ID, CONTENT_HASH, IPFS_CID, STANDALONE), 0);

        vm.prank(kol2);
        assertEq(registry.emitNote(keccak256("kol-002"), keccak256("other"), "QmOther", LINKED_SIGNAL), 1);

        assertEq(registry.noteCount(), 2);
    }

    // =========================================================================
    // Unit tests — validation
    // =========================================================================

    function test_Emit_EmptyKolId_Reverts() public {
        vm.prank(kol1);
        vm.expectRevert(KolNoteRegistry.EmptyKolId.selector);
        registry.emitNote(bytes32(0), CONTENT_HASH, IPFS_CID, STANDALONE);
    }

    function test_Emit_EmptyContentHash_Reverts() public {
        vm.prank(kol1);
        vm.expectRevert(KolNoteRegistry.EmptyContentHash.selector);
        registry.emitNote(KOL_ID, bytes32(0), IPFS_CID, STANDALONE);
    }

    function test_Emit_EmptyIpfsCid_Reverts() public {
        vm.prank(kol1);
        vm.expectRevert(KolNoteRegistry.EmptyIpfsCid.selector);
        registry.emitNote(KOL_ID, CONTENT_HASH, "", STANDALONE);
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
        registry.emitNote(KOL_ID, CONTENT_HASH, IPFS_CID, STANDALONE);
    }

    function test_Unpause_ThenEmit_Succeeds() public {
        vm.prank(admin);
        registry.pause();

        vm.prank(admin);
        registry.unpause();

        vm.prank(kol1);
        registry.emitNote(KOL_ID, CONTENT_HASH, IPFS_CID, STANDALONE);
        assertEq(registry.noteCount(), 1);
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

    function test_NoteDataPersistsAfterMoreEmissions() public {
        vm.prank(kol1);
        registry.emitNote(KOL_ID, CONTENT_HASH, IPFS_CID, STANDALONE);

        vm.prank(kol2);
        registry.emitNote(keccak256("kol-002"), keccak256("other"), "QmOther", LINKED_SIGNAL);

        KolNoteRegistry.Note memory first = registry.getNote(0);
        assertEq(first.author, kol1);
        assertEq(first.contentHash, CONTENT_HASH);
        assertEq(first.linkedSignalId, STANDALONE);
    }

    // =========================================================================
    // Unit tests — UUPS upgrade
    // =========================================================================

    function test_Upgrade_AsUpgrader_PreservesState() public {
        vm.prank(kol1);
        registry.emitNote(KOL_ID, CONTENT_HASH, IPFS_CID, LINKED_SIGNAL);

        KolNoteRegistry newImpl = new KolNoteRegistry();
        vm.prank(admin);
        registry.upgradeToAndCall(address(newImpl), "");

        KolNoteRegistry.Note memory n = registry.getNote(0);
        assertEq(n.author, kol1);
        assertEq(n.contentHash, CONTENT_HASH);
        assertEq(n.linkedSignalId, LINKED_SIGNAL);
        assertEq(registry.noteCount(), 1);
    }

    function test_Upgrade_AsNonUpgrader_Reverts() public {
        KolNoteRegistry newImpl = new KolNoteRegistry();
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
        uint256 linkedSignalId
    ) public {
        vm.assume(kolId != bytes32(0));
        vm.assume(contentHash != bytes32(0));
        vm.assume(bytes(ipfsCid).length > 0);

        vm.prank(kol1);
        uint256 id = registry.emitNote(kolId, contentHash, ipfsCid, linkedSignalId);

        KolNoteRegistry.Note memory n = registry.getNote(id);
        assertEq(n.author, kol1);
        assertEq(n.kolId, kolId);
        assertEq(n.contentHash, contentHash);
        assertEq(n.linkedSignalId, linkedSignalId);
    }
}
