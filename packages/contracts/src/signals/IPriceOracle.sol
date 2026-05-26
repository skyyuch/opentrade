// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title  IPriceOracle — abstraction for price feed settlement.
/// @notice Used by the off-chain Settle Worker (M9.2) to report settlement
///         data on-chain. Phase 2 uses an off-chain reporter pattern; Phase 5+
///         may upgrade to fully on-chain (Chainlink Automation / Gelato).
/// @dev    Per ADR-0036 D7: the oracle provides period OHLC data, not just
///         spot price. This is needed for target-hit and stoploss detection.
interface IPriceOracle {
    /// @notice Report settlement data for a signal.
    /// @param  signalId    The on-chain signal ID from KolSignalRegistry.
    /// @param  settlePrice The close price at horizon expiry.
    /// @param  periodHigh  The highest price during the signal's horizon.
    /// @param  periodLow   The lowest price during the signal's horizon.
    /// @param  outcome     The terminal outcome (1=HIT_TARGET, 2=HIT_DIRECTION,
    ///                     3=STOPPED, 4=EXPIRED, 5=UNRESOLVED).
    function reportSettlement(
        uint256 signalId,
        int256 settlePrice,
        int256 periodHigh,
        int256 periodLow,
        uint8 outcome
    ) external;

    /// @notice Get the latest reported price for a symbol.
    /// @param  symbolHash  keccak256 of the symbol string (e.g. "BTC/USD").
    /// @return price       The latest price (18 decimal places).
    /// @return timestamp   The timestamp of the price observation.
    function getLatestPrice(
        bytes32 symbolHash
    ) external view returns (int256 price, uint64 timestamp);
}
