// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IPriceOracle } from "./IPriceOracle.sol";

/// @title  MockPriceOracle — test-only implementation of IPriceOracle.
/// @notice Allows test scripts to set arbitrary prices and settlement data.
///         Not for production use.
contract MockPriceOracle is IPriceOracle {
    struct PriceData {
        int256 price;
        uint64 timestamp;
    }

    struct SettlementData {
        int256 settlePrice;
        int256 periodHigh;
        int256 periodLow;
        uint8 outcome;
        bool reported;
    }

    mapping(bytes32 => PriceData) private _prices;
    mapping(uint256 => SettlementData) private _settlements;

    event PriceSet(bytes32 indexed symbolHash, int256 price, uint64 timestamp);
    event SettlementReported(uint256 indexed signalId, uint8 outcome);

    /// @notice Set a mock price for a symbol (test helper).
    function setPrice(
        bytes32 symbolHash,
        int256 price,
        uint64 timestamp
    ) external {
        _prices[symbolHash] = PriceData({ price: price, timestamp: timestamp });
        emit PriceSet(symbolHash, price, timestamp);
    }

    /// @inheritdoc IPriceOracle
    function reportSettlement(
        uint256 signalId,
        int256 settlePrice,
        int256 periodHigh,
        int256 periodLow,
        uint8 outcome
    ) external override {
        _settlements[signalId] = SettlementData({
            settlePrice: settlePrice, periodHigh: periodHigh, periodLow: periodLow, outcome: outcome, reported: true
        });
        emit SettlementReported(signalId, outcome);
    }

    /// @inheritdoc IPriceOracle
    function getLatestPrice(
        bytes32 symbolHash
    ) external view override returns (int256 price, uint64 timestamp) {
        PriceData memory data = _prices[symbolHash];
        return (data.price, data.timestamp);
    }

    /// @notice Get settlement data for a signal (test helper).
    function getSettlement(
        uint256 signalId
    ) external view returns (SettlementData memory) {
        return _settlements[signalId];
    }
}
