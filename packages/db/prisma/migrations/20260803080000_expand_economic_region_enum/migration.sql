-- ADR-0061: expand EconomicRegion beyond the US/HK/CN MVP to multi-region
-- official sources. Additive enum ADD VALUEs only (non-breaking; no existing
-- rows change). `region` remains a filter/label, never a ranking.

-- AlterEnum
ALTER TYPE "EconomicRegion" ADD VALUE IF NOT EXISTS 'EU';
ALTER TYPE "EconomicRegion" ADD VALUE IF NOT EXISTS 'EA';
ALTER TYPE "EconomicRegion" ADD VALUE IF NOT EXISTS 'GB';
ALTER TYPE "EconomicRegion" ADD VALUE IF NOT EXISTS 'CA';
ALTER TYPE "EconomicRegion" ADD VALUE IF NOT EXISTS 'AU';
ALTER TYPE "EconomicRegion" ADD VALUE IF NOT EXISTS 'JP';
