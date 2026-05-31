// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { AccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { PausableUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";

/// @title  KolNoteRegistry — immutable on-chain KOL analyst-note ledger.
/// @notice Stores a content hash and IPFS CID for each KOL note (rich-text
///         analysis write-up). Full note content (TipTap/ProseMirror JSON and
///         IPFS image CIDs) lives on IPFS; this contract is the tamper-proof
///         anchor. A note may stand alone or be attached to a signal. Per the
///         project red line: no function may delete or modify a submitted note
///         ("win loudly, lose quietly" is the exact behaviour we prevent).
/// @dev    UUPS upgradeable (ADR-0015, rule 41). Mirrors KolSignalRegistry
///         (ADR-0036 / ADR-0039 D1). Storage layout must be append-only.
contract KolNoteRegistry is Initializable, UUPSUpgradeable, AccessControlUpgradeable, PausableUpgradeable {
    // =========================================================================
    // Roles
    // =========================================================================

    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    // =========================================================================
    // Types
    // =========================================================================

    struct Note {
        address author;
        bytes32 kolId;
        bytes32 contentHash;
        string ipfsCid;
        uint64 timestamp;
        uint256 linkedSignalId;
    }

    // =========================================================================
    // Errors
    // =========================================================================

    error EmptyContentHash();
    error EmptyIpfsCid();
    error EmptyKolId();

    // =========================================================================
    // Events
    // =========================================================================

    event NoteEmitted(
        uint256 indexed noteId,
        address indexed author,
        bytes32 indexed kolId,
        bytes32 contentHash,
        string ipfsCid,
        uint256 linkedSignalId
    );

    // =========================================================================
    // Storage
    // =========================================================================

    mapping(uint256 => Note) public notes;
    uint256 public noteCount;

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

    /// @notice Emit a new note. Once stored, the note is immutable.
    /// @param  kolId          keccak256 of the off-chain KOL UUID.
    /// @param  contentHash    keccak256 of the full note JSON on IPFS.
    /// @param  ipfsCid        The IPFS CID where the note JSON is pinned.
    /// @param  linkedSignalId The on-chain signal id this note is attached to;
    ///                        0 means the note is standalone (ADR-0039 D1).
    /// @return noteId         The sequential ID assigned to this note.
    function emitNote(
        bytes32 kolId,
        bytes32 contentHash,
        string calldata ipfsCid,
        uint256 linkedSignalId
    ) external whenNotPaused returns (uint256 noteId) {
        if (kolId == bytes32(0)) revert EmptyKolId();
        if (contentHash == bytes32(0)) revert EmptyContentHash();
        if (bytes(ipfsCid).length == 0) revert EmptyIpfsCid();

        unchecked {
            noteId = noteCount++;
        }

        notes[noteId] = Note({
            author: msg.sender,
            kolId: kolId,
            contentHash: contentHash,
            ipfsCid: ipfsCid,
            timestamp: uint64(block.timestamp),
            linkedSignalId: linkedSignalId
        });

        emit NoteEmitted(noteId, msg.sender, kolId, contentHash, ipfsCid, linkedSignalId);
    }

    // =========================================================================
    // Public read
    // =========================================================================

    /// @notice Get a single note by ID.
    function getNote(
        uint256 noteId
    ) external view returns (Note memory) {
        return notes[noteId];
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
