// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ReviewerSBT } from "../../src/identity/ReviewerSBT.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { Test, console2 } from "forge-std/Test.sol";

contract ReviewerSBTTest is Test {
    ReviewerSBT internal sbt;

    address internal admin = makeAddr("admin");
    address internal minter = makeAddr("minter");
    address internal revoker = makeAddr("revoker");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    string internal constant TOKEN_URI = "ipfs://QmTest123";

    function setUp() public {
        ReviewerSBT impl = new ReviewerSBT();
        bytes memory initData = abi.encodeCall(ReviewerSBT.initialize, (admin));
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        sbt = ReviewerSBT(address(proxy));

        vm.startPrank(admin);
        sbt.grantRole(sbt.MINTER_ROLE(), minter);
        sbt.grantRole(sbt.REVOKER_ROLE(), revoker);
        vm.stopPrank();
    }

    // =====================================================================
    // Initialisation
    // =====================================================================

    function test_name() public view {
        assertEq(sbt.name(), "OpenTrade Reviewer SBT");
    }

    function test_symbol() public view {
        assertEq(sbt.symbol(), "OT-SBT");
    }

    function test_initialTokenCount() public view {
        assertEq(sbt.tokenCount(), 0);
    }

    // =====================================================================
    // Minting
    // =====================================================================

    function test_mintSuccess() public {
        vm.prank(minter);
        uint256 tokenId = sbt.mint(alice, TOKEN_URI);

        assertEq(tokenId, 0);
        assertEq(sbt.ownerOf(0), alice);
        assertEq(sbt.tokenURI(0), TOKEN_URI);
        assertEq(sbt.tokenCount(), 1);
        assertTrue(sbt.hasMinted(alice));
    }

    function test_mintEmitsEvent() public {
        vm.prank(minter);
        vm.expectEmit(true, true, false, true);
        emit ReviewerSBT.ReviewerSBTMinted(0, alice, TOKEN_URI);
        sbt.mint(alice, TOKEN_URI);
    }

    function test_mintRevertsForNonMinter() public {
        vm.prank(alice);
        vm.expectRevert();
        sbt.mint(alice, TOKEN_URI);
    }

    function test_mintRevertsOnDuplicate() public {
        vm.prank(minter);
        sbt.mint(alice, TOKEN_URI);

        vm.prank(minter);
        vm.expectRevert(abi.encodeWithSelector(ReviewerSBT.AlreadyMinted.selector, alice));
        sbt.mint(alice, TOKEN_URI);
    }

    function test_mintRevertsWhenPaused() public {
        vm.prank(admin);
        sbt.pause();

        vm.prank(minter);
        vm.expectRevert();
        sbt.mint(alice, TOKEN_URI);
    }

    // =====================================================================
    // Soulbound (transfer blocked)
    // =====================================================================

    function test_transferRevertsAliceToAlice() public {
        vm.prank(minter);
        sbt.mint(alice, TOKEN_URI);

        vm.prank(alice);
        vm.expectRevert(ReviewerSBT.SoulboundTransferBlocked.selector);
        sbt.transferFrom(alice, bob, 0);
    }

    function test_safeTransferRevertsAliceToBob() public {
        vm.prank(minter);
        sbt.mint(alice, TOKEN_URI);

        vm.prank(alice);
        vm.expectRevert(ReviewerSBT.SoulboundTransferBlocked.selector);
        sbt.safeTransferFrom(alice, bob, 0);
    }

    // =====================================================================
    // Revocation
    // =====================================================================

    function test_revokeSuccess() public {
        vm.prank(minter);
        sbt.mint(alice, TOKEN_URI);

        vm.prank(revoker);
        sbt.revoke(0);

        assertFalse(sbt.hasMinted(alice));
    }

    function test_revokeEmitsEvent() public {
        vm.prank(minter);
        sbt.mint(alice, TOKEN_URI);

        vm.prank(revoker);
        vm.expectEmit(true, true, false, false);
        emit ReviewerSBT.ReviewerSBTRevoked(0, alice);
        sbt.revoke(0);
    }

    function test_revokeAllowsRemint() public {
        vm.prank(minter);
        sbt.mint(alice, TOKEN_URI);

        vm.prank(revoker);
        sbt.revoke(0);

        vm.prank(minter);
        uint256 newId = sbt.mint(alice, "ipfs://QmNew");
        assertEq(newId, 1);
        assertEq(sbt.ownerOf(1), alice);
    }

    function test_revokeRevertsForNonRevoker() public {
        vm.prank(minter);
        sbt.mint(alice, TOKEN_URI);

        vm.prank(alice);
        vm.expectRevert();
        sbt.revoke(0);
    }

    // =====================================================================
    // Multiple users
    // =====================================================================

    function test_mintMultipleUsers() public {
        vm.startPrank(minter);
        uint256 id0 = sbt.mint(alice, "ipfs://A");
        uint256 id1 = sbt.mint(bob, "ipfs://B");
        vm.stopPrank();

        assertEq(id0, 0);
        assertEq(id1, 1);
        assertEq(sbt.tokenCount(), 2);
        assertEq(sbt.ownerOf(0), alice);
        assertEq(sbt.ownerOf(1), bob);
    }

    // =====================================================================
    // Fuzz
    // =====================================================================

    function testFuzz_transferAlwaysReverts(
        address from,
        address to
    ) public {
        vm.assume(from != address(0) && to != address(0) && from != to);
        vm.assume(from.code.length == 0);

        vm.prank(minter);
        sbt.mint(from, TOKEN_URI);

        vm.prank(from);
        vm.expectRevert(ReviewerSBT.SoulboundTransferBlocked.selector);
        sbt.transferFrom(from, to, 0);
    }

    // =====================================================================
    // Invariant: balanceOf <= 1
    // =====================================================================

    function test_balanceNeverExceedsOne() public {
        vm.prank(minter);
        sbt.mint(alice, TOKEN_URI);

        assertEq(sbt.balanceOf(alice), 1);
    }
}
