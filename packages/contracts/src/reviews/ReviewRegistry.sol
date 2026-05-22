// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { AccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { PausableUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";

/// @title  ReviewRegistry — immutable on-chain review ledger for OpenTrade.
/// @notice Stores a content hash and IPFS CID for each review. Full review
///         text lives on IPFS; this contract provides the tamper-proof anchor.
///         Per ADR-0019 D5, no function may delete or modify a submitted review.
/// @dev    UUPS upgradeable (ADR-0015, rule 41). Storage layout must be
///         append-only — never reorder or remove existing variables.
contract ReviewRegistry is Initializable, UUPSUpgradeable, AccessControlUpgradeable, PausableUpgradeable {
    // =========================================================================
    // Roles
    // =========================================================================

    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    // =========================================================================
    // Types
    // =========================================================================

    struct Review {
        address author;
        bytes32 brokerId;
        bytes32 contentHash;
        string ipfsCid;
        uint64 timestamp;
    }

    // =========================================================================
    // Errors
    // =========================================================================

    error EmptyContentHash();
    error EmptyIpfsCid();
    error EmptyBrokerId();

    // =========================================================================
    // Events
    // =========================================================================

    event ReviewSubmitted(
        uint256 indexed reviewId, address indexed author, bytes32 indexed brokerId, bytes32 contentHash, string ipfsCid
    );

    // =========================================================================
    // Storage
    // =========================================================================

    mapping(uint256 => Review) public reviews;
    uint256 public reviewCount;

    uint256[48] private __gap;

    // =========================================================================
    // Initialiser (replaces constructor for UUPS proxy)
    // =========================================================================

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address admin
    ) public initializer {
        __AccessControl_init();
        __Pausable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        _grantRole(UPGRADER_ROLE, admin);
    }

    // =========================================================================
    // Public write
    // =========================================================================

    /// @notice Submit a new review. Once stored, the review is immutable.
    /// @param  brokerId    keccak256 of the off-chain broker UUID.
    /// @param  contentHash keccak256 of the full review JSON on IPFS.
    /// @param  ipfsCid     The IPFS CID where the review JSON is pinned.
    /// @return reviewId    The sequential ID assigned to this review.
    function submitReview(
        bytes32 brokerId,
        bytes32 contentHash,
        string calldata ipfsCid
    ) external whenNotPaused returns (uint256 reviewId) {
        if (brokerId == bytes32(0)) revert EmptyBrokerId();
        if (contentHash == bytes32(0)) revert EmptyContentHash();
        if (bytes(ipfsCid).length == 0) revert EmptyIpfsCid();

        // Safe: reviewCount cannot realistically reach 2^256.
        unchecked {
            reviewId = reviewCount++;
        }

        reviews[reviewId] = Review({
            author: msg.sender,
            brokerId: brokerId,
            contentHash: contentHash,
            ipfsCid: ipfsCid,
            timestamp: uint64(block.timestamp)
        });

        emit ReviewSubmitted(reviewId, msg.sender, brokerId, contentHash, ipfsCid);
    }

    // =========================================================================
    // Public read
    // =========================================================================

    /// @notice Get a single review by ID.
    function getReview(
        uint256 reviewId
    ) external view returns (Review memory) {
        return reviews[reviewId];
    }

    // =========================================================================
    // Admin
    // =========================================================================

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    // =========================================================================
    // UUPS
    // =========================================================================

    function _authorizeUpgrade(
        address
    ) internal override onlyRole(UPGRADER_ROLE) { }
}
