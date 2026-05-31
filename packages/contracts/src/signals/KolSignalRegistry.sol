// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { AccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { PausableUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";

/// @title  KolSignalRegistry — immutable on-chain KOL signal ledger for OpenTrade.
/// @notice Stores a content hash and IPFS CID for each KOL signal (call).
///         Full signal data lives on IPFS; this contract provides the
///         tamper-proof anchor. Per ADR-0036 D4: pure Live mode, no
///         commit-reveal. Per project red line: no function may delete or
///         modify a submitted signal.
/// @dev    UUPS upgradeable (ADR-0015, rule 41). Mirrors ReviewRegistry
///         pattern (ADR-0019). Storage layout must be append-only.
contract KolSignalRegistry is Initializable, UUPSUpgradeable, AccessControlUpgradeable, PausableUpgradeable {
    // =========================================================================
    // Roles
    // =========================================================================

    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    // =========================================================================
    // Types
    // =========================================================================

    struct Signal {
        address author;
        bytes32 kolId;
        bytes32 contentHash;
        string ipfsCid;
        uint64 timestamp;
        uint8 assetClass;
        uint8 direction;
        uint8 horizon;
    }

    // =========================================================================
    // Errors
    // =========================================================================

    error EmptyContentHash();
    error EmptyIpfsCid();
    error EmptyKolId();
    error InvalidAssetClass();
    error InvalidDirection();
    error InvalidHorizon();

    // =========================================================================
    // Events
    // =========================================================================

    event SignalEmitted(
        uint256 indexed signalId,
        address indexed author,
        bytes32 indexed kolId,
        bytes32 contentHash,
        string ipfsCid,
        uint8 assetClass,
        uint8 direction,
        uint8 horizon
    );

    // =========================================================================
    // Storage
    // =========================================================================

    mapping(uint256 => Signal) public signals;
    uint256 public signalCount;

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

    /// @notice Emit a new signal. Once stored, the signal is immutable.
    /// @param  kolId       keccak256 of the off-chain KOL UUID.
    /// @param  contentHash keccak256 of the full signal JSON on IPFS.
    /// @param  ipfsCid     The IPFS CID where the signal JSON is pinned.
    /// @param  assetClass  Asset class enum (0-7 per ADR-0036 D5 as amended by
    ///                     ADR-0038 D3: EQUITY_HK=0, EQUITY_US=1, FUTURES=2,
    ///                     SPOT=3, FOREX=4, CRYPTO=5, INDEX=6, COMMODITY=7).
    /// @param  direction   Signal direction (0=BUY, 1=SELL, 2=HOLD).
    /// @param  horizon     Horizon in days (1/3/7/14/30/90/180/365).
    /// @return signalId    The sequential ID assigned to this signal.
    function emitSignal(
        bytes32 kolId,
        bytes32 contentHash,
        string calldata ipfsCid,
        uint8 assetClass,
        uint8 direction,
        uint8 horizon
    ) external whenNotPaused returns (uint256 signalId) {
        if (kolId == bytes32(0)) revert EmptyKolId();
        if (contentHash == bytes32(0)) revert EmptyContentHash();
        if (bytes(ipfsCid).length == 0) revert EmptyIpfsCid();
        if (assetClass > 7) revert InvalidAssetClass();
        if (direction > 2) revert InvalidDirection();
        if (horizon == 0) revert InvalidHorizon();

        unchecked {
            signalId = signalCount++;
        }

        signals[signalId] = Signal({
            author: msg.sender,
            kolId: kolId,
            contentHash: contentHash,
            ipfsCid: ipfsCid,
            timestamp: uint64(block.timestamp),
            assetClass: assetClass,
            direction: direction,
            horizon: horizon
        });

        emit SignalEmitted(signalId, msg.sender, kolId, contentHash, ipfsCid, assetClass, direction, horizon);
    }

    // =========================================================================
    // Public read
    // =========================================================================

    /// @notice Get a single signal by ID.
    function getSignal(
        uint256 signalId
    ) external view returns (Signal memory) {
        return signals[signalId];
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
