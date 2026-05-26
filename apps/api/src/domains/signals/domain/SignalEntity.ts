/**
 * Domain types for the signals bounded context.
 *
 * Per ADR-0036 D4-D6: signals are immutable once emitted. Settlement
 * is performed by the off-chain Settle Worker (M9.2).
 *
 * The domain layer keeps zero infrastructure imports (rule 10).
 */

export type AssetClassValue = 'EQUITY_HK' | 'EQUITY_US' | 'FUTURES' | 'SPOT' | 'FOREX' | 'CRYPTO';

export const ASSET_CLASS_VALUES = [
  'EQUITY_HK',
  'EQUITY_US',
  'FUTURES',
  'SPOT',
  'FOREX',
  'CRYPTO',
] as const satisfies readonly AssetClassValue[];

export type SignalDirectionValue = 'BUY' | 'SELL' | 'HOLD';

export const SIGNAL_DIRECTION_VALUES = [
  'BUY',
  'SELL',
  'HOLD',
] as const satisfies readonly SignalDirectionValue[];

export type SignalOutcomeValue =
  | 'ACTIVE'
  | 'HIT_TARGET'
  | 'HIT_DIRECTION'
  | 'STOPPED'
  | 'EXPIRED'
  | 'UNRESOLVED';

export const SIGNAL_OUTCOME_VALUES = [
  'ACTIVE',
  'HIT_TARGET',
  'HIT_DIRECTION',
  'STOPPED',
  'EXPIRED',
  'UNRESOLVED',
] as const satisfies readonly SignalOutcomeValue[];

export const VALID_HORIZONS = [1, 3, 7, 14, 30, 90, 180, 365] as const;
export type ValidHorizon = (typeof VALID_HORIZONS)[number];

export interface EmitSignalInput {
  tenantId: string;
  kolId: string;
  assetClass: AssetClassValue;
  symbol: string;
  direction: SignalDirectionValue;
  entryPrice: string;
  targetPrice: string;
  stoplossPrice?: string;
  horizon: ValidHorizon;
  note?: string;
}

export interface SignalRecord {
  id: string;
  tenantId: string;
  kolId: string;
  assetClass: AssetClassValue;
  symbol: string;
  direction: SignalDirectionValue;
  entryPrice: string;
  targetPrice: string;
  stoplossPrice: string | null;
  horizon: number;
  note: string | null;
  outcome: SignalOutcomeValue;
  settledAt: Date | null;
  settlePrice: string | null;
  periodHigh: string | null;
  periodLow: string | null;
  contentHash: string;
  ipfsCid: string | null;
  chainSignalId: number | null;
  chainTxHash: string | null;
  createdAt: Date;
  updatedAt: Date;
}
