-- ADR-0061 (batch 4): add Singapore to the EconomicRegion enum for the
-- SingStat (Singapore Department of Statistics) official calendar provider.
-- Additive enum ADD VALUE only (non-breaking; no existing rows change).
-- `region` remains a filter/label, never a ranking.

-- AlterEnum
ALTER TYPE "EconomicRegion" ADD VALUE IF NOT EXISTS 'SG';
