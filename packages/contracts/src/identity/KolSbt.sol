// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { AccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { ERC721Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import { PausableUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";

/// @title  KolSbt — Soulbound token for verified OpenTrade KOLs.
/// @notice Each approved KOL receives exactly one non-transferable ERC721.
///         The token proves on-chain that the holder has been approved as a
///         KOL (per ADR-0036 D3). Transfers are blocked; only mint and burn
///         are permitted. Structurally independent from ReviewerSBT — a user
///         can hold both tokens simultaneously.
/// @dev    UUPS upgradeable. Storage layout is append-only.
contract KolSbt is Initializable, ERC721Upgradeable, UUPSUpgradeable, AccessControlUpgradeable, PausableUpgradeable {
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

    event KolSbtMinted(uint256 indexed tokenId, address indexed to, string tokenURI);
    event KolSbtRevoked(uint256 indexed tokenId, address indexed from);

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
        __ERC721_init("OpenTrade KOL SBT", "OT-KOL");
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

    /// @notice Mint a new KolSbt to an approved KOL. One per address.
    /// @param  to       The KOL's wallet address.
    /// @param  uri      IPFS URI containing KOL approval metadata.
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

        emit KolSbtMinted(tokenId, to, uri);
    }

    // =========================================================================
    // Revocation
    // =========================================================================

    /// @notice Burn/revoke a KolSbt. Used when a KOL is suspended or identity
    ///         verification expires.
    function revoke(
        uint256 tokenId
    ) external onlyRole(REVOKER_ROLE) whenNotPaused {
        address owner = ownerOf(tokenId);
        hasMinted[owner] = false;
        _burn(tokenId);

        emit KolSbtRevoked(tokenId, owner);
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
