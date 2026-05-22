// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { AccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { ERC721Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import { PausableUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";

/// @title  ReviewerSBT — Soulbound token for verified OpenTrade reviewers.
/// @notice Each verified user receives exactly one non-transferable ERC721.
///         The token proves on-chain that the holder has completed L2+
///         identity verification (per ADR-0021). Transfers are blocked;
///         only mint and burn are permitted.
/// @dev    UUPS upgradeable. Storage layout is append-only.
contract ReviewerSBT is
    Initializable,
    ERC721Upgradeable,
    UUPSUpgradeable,
    AccessControlUpgradeable,
    PausableUpgradeable
{
    // =========================================================================
    // Roles
    // =========================================================================

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant REVOKER_ROLE = keccak256("REVOKER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    // =========================================================================
    // Errors
    // =========================================================================

    error SoulboundTransferBlocked();
    error AlreadyMinted(address to);

    // =========================================================================
    // Events
    // =========================================================================

    event ReviewerSBTMinted(uint256 indexed tokenId, address indexed to, string tokenURI);
    event ReviewerSBTRevoked(uint256 indexed tokenId, address indexed from);

    // =========================================================================
    // Storage
    // =========================================================================

    uint256 public tokenCount;
    mapping(address => bool) public hasMinted;
    mapping(uint256 => string) private _tokenURIs;

    uint256[47] private __gap;

    // =========================================================================
    // Initialiser
    // =========================================================================

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address admin
    ) public initializer {
        __ERC721_init("OpenTrade Reviewer SBT", "OT-SBT");
        __AccessControl_init();
        __Pausable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(MINTER_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        _grantRole(UPGRADER_ROLE, admin);
    }

    // =========================================================================
    // Soulbound enforcement
    // =========================================================================

    /// @dev Blocks all transfers except mint (from == 0) and burn (to == 0).
    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) {
            revert SoulboundTransferBlocked();
        }
        return super._update(to, tokenId, auth);
    }

    // =========================================================================
    // Minting
    // =========================================================================

    /// @notice Mint a new ReviewerSBT to a verified user. One per address.
    /// @param  to       The recipient wallet address.
    /// @param  uri      IPFS URI containing verification metadata.
    /// @return tokenId  The ID of the newly minted token.
    function mint(
        address to,
        string calldata uri
    ) external onlyRole(MINTER_ROLE) whenNotPaused returns (uint256 tokenId) {
        if (hasMinted[to]) revert AlreadyMinted(to);

        unchecked {
            tokenId = tokenCount++;
        }

        hasMinted[to] = true;
        _tokenURIs[tokenId] = uri;
        _safeMint(to, tokenId);

        emit ReviewerSBTMinted(tokenId, to, uri);
    }

    // =========================================================================
    // Revocation (Phase 2+)
    // =========================================================================

    /// @notice Burn/revoke a ReviewerSBT. Reserved for future dispute outcomes.
    function revoke(
        uint256 tokenId
    ) external onlyRole(REVOKER_ROLE) whenNotPaused {
        address owner = ownerOf(tokenId);
        hasMinted[owner] = false;
        _burn(tokenId);

        emit ReviewerSBTRevoked(tokenId, owner);
    }

    // =========================================================================
    // Metadata
    // =========================================================================

    function tokenURI(
        uint256 tokenId
    ) public view override returns (string memory) {
        _requireOwned(tokenId);
        return _tokenURIs[tokenId];
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
    // Interface support
    // =========================================================================

    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC721Upgradeable, AccessControlUpgradeable) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    // =========================================================================
    // UUPS
    // =========================================================================

    function _authorizeUpgrade(
        address
    ) internal override onlyRole(UPGRADER_ROLE) { }
}
