// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ReviewRegistry } from "../../src/reviews/ReviewRegistry.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { Test, console2 } from "forge-std/Test.sol";

contract ReviewRegistryTest is Test {
    ReviewRegistry public registry;
    address public admin = makeAddr("admin");
    address public user1 = makeAddr("user1");
    address public user2 = makeAddr("user2");

    bytes32 constant BROKER_ID = keccak256("broker-uuid-001");
    bytes32 constant CONTENT_HASH = keccak256("review content json");
    string constant IPFS_CID = "QmTest1234567890abcdefghijklmnopqrstuvwxyz";

    function setUp() public {
        ReviewRegistry impl = new ReviewRegistry();
        bytes memory initData = abi.encodeCall(ReviewRegistry.initialize, (admin));
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        registry = ReviewRegistry(address(proxy));
    }

    // =========================================================================
    // Unit tests — submit
    // =========================================================================

    function test_SubmitReview_AsUser_Succeeds() public {
        vm.prank(user1);
        uint256 id = registry.submitReview(BROKER_ID, CONTENT_HASH, IPFS_CID);
        assertEq(id, 0);
        assertEq(registry.reviewCount(), 1);

        ReviewRegistry.Review memory r = registry.getReview(0);
        assertEq(r.author, user1);
        assertEq(r.brokerId, BROKER_ID);
        assertEq(r.contentHash, CONTENT_HASH);
        assertEq(keccak256(bytes(r.ipfsCid)), keccak256(bytes(IPFS_CID)));
        assertGt(r.timestamp, 0);
    }

    function test_SubmitReview_EmitsEvent() public {
        vm.prank(user1);
        vm.expectEmit(true, true, true, true);
        emit ReviewRegistry.ReviewSubmitted(0, user1, BROKER_ID, CONTENT_HASH, IPFS_CID);
        registry.submitReview(BROKER_ID, CONTENT_HASH, IPFS_CID);
    }

    function test_SubmitReview_SequentialIds() public {
        vm.prank(user1);
        assertEq(registry.submitReview(BROKER_ID, CONTENT_HASH, IPFS_CID), 0);

        vm.prank(user2);
        assertEq(registry.submitReview(BROKER_ID, keccak256("other"), "QmOther"), 1);

        assertEq(registry.reviewCount(), 2);
    }

    // =========================================================================
    // Unit tests — validation
    // =========================================================================

    function test_SubmitReview_EmptyBrokerId_Reverts() public {
        vm.prank(user1);
        vm.expectRevert(ReviewRegistry.EmptyBrokerId.selector);
        registry.submitReview(bytes32(0), CONTENT_HASH, IPFS_CID);
    }

    function test_SubmitReview_EmptyContentHash_Reverts() public {
        vm.prank(user1);
        vm.expectRevert(ReviewRegistry.EmptyContentHash.selector);
        registry.submitReview(BROKER_ID, bytes32(0), IPFS_CID);
    }

    function test_SubmitReview_EmptyIpfsCid_Reverts() public {
        vm.prank(user1);
        vm.expectRevert(ReviewRegistry.EmptyIpfsCid.selector);
        registry.submitReview(BROKER_ID, CONTENT_HASH, "");
    }

    // =========================================================================
    // Unit tests — pause / unpause
    // =========================================================================

    function test_Pause_AsAdmin_Succeeds() public {
        vm.prank(admin);
        registry.pause();
        assertTrue(registry.paused());
    }

    function test_SubmitReview_WhenPaused_Reverts() public {
        vm.prank(admin);
        registry.pause();

        vm.prank(user1);
        vm.expectRevert();
        registry.submitReview(BROKER_ID, CONTENT_HASH, IPFS_CID);
    }

    function test_Unpause_ThenSubmit_Succeeds() public {
        vm.prank(admin);
        registry.pause();

        vm.prank(admin);
        registry.unpause();

        vm.prank(user1);
        registry.submitReview(BROKER_ID, CONTENT_HASH, IPFS_CID);
        assertEq(registry.reviewCount(), 1);
    }

    function test_Pause_AsNonAdmin_Reverts() public {
        vm.prank(user1);
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

    function test_ReviewDataPersistsAfterMoreSubmissions() public {
        vm.prank(user1);
        registry.submitReview(BROKER_ID, CONTENT_HASH, IPFS_CID);

        vm.prank(user2);
        registry.submitReview(keccak256("broker-002"), keccak256("other"), "QmOther");

        ReviewRegistry.Review memory first = registry.getReview(0);
        assertEq(first.author, user1);
        assertEq(first.contentHash, CONTENT_HASH);
    }

    // =========================================================================
    // Fuzz tests
    // =========================================================================

    function testFuzz_SubmitReview_ArbitraryContent(
        bytes32 brokerId,
        bytes32 contentHash,
        string calldata ipfsCid
    ) public {
        vm.assume(brokerId != bytes32(0));
        vm.assume(contentHash != bytes32(0));
        vm.assume(bytes(ipfsCid).length > 0);

        vm.prank(user1);
        uint256 id = registry.submitReview(brokerId, contentHash, ipfsCid);

        ReviewRegistry.Review memory r = registry.getReview(id);
        assertEq(r.author, user1);
        assertEq(r.brokerId, brokerId);
        assertEq(r.contentHash, contentHash);
    }
}

/// @title Invariant tests for ReviewRegistry
contract ReviewRegistryInvariant is Test {
    ReviewRegistry public registry;
    ReviewSubmitter public submitter;

    function setUp() public {
        address admin = makeAddr("admin");
        ReviewRegistry impl = new ReviewRegistry();
        bytes memory initData = abi.encodeCall(ReviewRegistry.initialize, (admin));
        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), initData);
        registry = ReviewRegistry(address(proxy));

        submitter = new ReviewSubmitter(registry);
        targetContract(address(submitter));
    }

    function invariant_ReviewCountMatchesSubmissions() public view {
        assertEq(registry.reviewCount(), submitter.totalSubmissions());
    }

    function invariant_SubmittedReviewsAreImmutable() public view {
        uint256 count = submitter.totalSubmissions();
        for (uint256 i = 0; i < count && i < 10; i++) {
            ReviewRegistry.Review memory r = registry.getReview(i);
            assertEq(r.contentHash, submitter.expectedHash(i));
        }
    }
}

/// @dev Handler contract for invariant testing — submits reviews with known hashes.
contract ReviewSubmitter is Test {
    ReviewRegistry private registry;
    uint256 public totalSubmissions;
    mapping(uint256 => bytes32) public expectedHash;

    constructor(
        ReviewRegistry _registry
    ) {
        registry = _registry;
    }

    function submit(
        bytes32 brokerId,
        bytes32 contentHash,
        string calldata ipfsCid
    ) external {
        if (brokerId == bytes32(0) || contentHash == bytes32(0) || bytes(ipfsCid).length == 0) return;

        uint256 id = registry.submitReview(brokerId, contentHash, ipfsCid);
        expectedHash[id] = contentHash;
        totalSubmissions++;
    }
}
