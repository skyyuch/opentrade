-- ADR-0061 (batch 4): add South Korea to the EconomicRegion enum for the
-- KOSTAT (Statistics Korea / Ministry of Data and Statistics) official calendar
-- provider. Additive enum ADD VALUE only (non-breaking; no existing rows
-- change). `region` remains a filter/label, never a ranking.

-- AlterEnum
ALTER TYPE "EconomicRegion" ADD VALUE IF NOT EXISTS 'KR';
