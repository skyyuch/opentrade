-- ADR-0061 (batch 3): add New Zealand to the EconomicRegion enum for the
-- Stats NZ official calendar provider. Additive enum ADD VALUE only
-- (non-breaking; no existing rows change). `region` remains a filter/label,
-- never a ranking.

-- AlterEnum
ALTER TYPE "EconomicRegion" ADD VALUE IF NOT EXISTS 'NZ';
