-- Rebrand the bullion registry CGSE (金銀業貿易場) -> HKGX (香港黃金交易所) per ADR-0050.
-- In-place, lossless enum value renames (Postgres 10+). Existing rows keep their
-- data; only the enum label changes, so BrokerLicense rows that were HK_CGSE /
-- HK_CGSE_MEMBER become HK_HKGX / HK_HKGX_MEMBER automatically.

-- AlterEnum
ALTER TYPE "Regulator" RENAME VALUE 'HK_CGSE' TO 'HK_HKGX';

-- AlterEnum
ALTER TYPE "LicenseType" RENAME VALUE 'HK_CGSE_MEMBER' TO 'HK_HKGX_MEMBER';
