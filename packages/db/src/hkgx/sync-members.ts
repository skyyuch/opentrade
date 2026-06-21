/**
 * Idempotent HKGX bullion-dealer sync — upserts `Broker` (category = BULLION) +
 * `BrokerLicense` (regulator = HK_HKGX) rows from an array of
 * {@link HkgxMemberData}. Shared by `seed.ts` (which reads the committed
 * `seed-data/hkgx-members.json`) and any future entry point. Per ADR-0045 D5,
 * rebranded from CGSE per ADR-0050.
 *
 * Per cursor rule 31 every write MUST be idempotent: running twice on the same
 * dataset leaves the DB in the same state as running once.
 *
 * Upsert keys:
 *   - Broker:        `@@unique([tenantId, slug])`        (slug = `hkgx-{code}`)
 *   - BrokerLicense: `@@unique([tenantId, regulator, licenseNumber])`
 *                    (licenseNumber = 行員編號, e.g. "009")
 *
 * Lifecycle / soft-retirement (rule 31 — never hard-delete a reference row):
 *   - A member present in `data` upserts its Broker + license and forces the
 *     license status to match the member's `status` (so a curated ACTIVE →
 *     SUSPENDED/REVOKED flip in the JSON propagates, and a re-listed member is
 *     reactivated).
 *   - After processing, any HK_HKGX license NOT already REVOKED whose
 *     `licenseNumber` is absent from `data` is marked REVOKED — the member left
 *     the roster. The Broker row itself is NEVER deleted (it may carry reviews);
 *     the revoked license stays visible as an immutable trust signal.
 *
 * `displayNameZhHans` is derived from `legalNameZh` via OpenCC here (mirroring
 * the SFC sync), so the scraper never carries a Simplified column.
 */

import { LicenseStatus, LicenseType, Regulator } from '../generated/prisma/client.js';
import { toSimplifiedChinese } from '../sfc/opencc.js';

import type { HkgxMemberData, HkgxMemberStatus } from './types.js';
import type { PrismaClient } from '../generated/prisma/client.js';

const STATUS_TO_LICENSE: Record<HkgxMemberStatus, LicenseStatus> = {
  ACTIVE: LicenseStatus.ACTIVE,
  SUSPENDED: LicenseStatus.SUSPENDED,
  REVOKED: LicenseStatus.REVOKED,
};

export type HkgxSyncResult = {
  brokersCreated: number;
  brokersUpdated: number;
  licensesCreated: number;
  licensesUpdated: number;
  membersRetired: number;
};

export async function syncHkgxMembers(
  prisma: PrismaClient,
  data: HkgxMemberData[],
): Promise<HkgxSyncResult> {
  const tenant = await prisma.tenant.findUnique({ where: { code: 'hk' } });
  if (!tenant) {
    throw new Error('Tenant "hk" not found. Run seed first.');
  }

  const result: HkgxSyncResult = {
    brokersCreated: 0,
    brokersUpdated: 0,
    licensesCreated: 0,
    licensesUpdated: 0,
    membersRetired: 0,
  };

  const seenCodes = new Set<string>();

  for (const member of data) {
    seenCodes.add(member.memberCode);

    const displayName = member.legalNameZh ?? member.legalNameEn;
    const displayNameZhHans = toSimplifiedChinese(member.legalNameZh);

    const existingBroker = await prisma.broker.findUnique({
      where: { tenantId_slug: { tenantId: tenant.id, slug: member.slug } },
    });

    let brokerId: string;
    if (existingBroker) {
      // Conservative update: refresh registry-sourced names only, never
      // clobber operator-edited fields (description, logoUrl, isClaimed).
      await prisma.broker.update({
        where: { id: existingBroker.id },
        data: {
          legalName: member.legalNameEn,
          displayName,
          displayNameZhHans,
        },
      });
      brokerId = existingBroker.id;
      result.brokersUpdated++;
    } else {
      const created = await prisma.broker.create({
        data: {
          tenantId: tenant.id,
          category: 'BULLION',
          slug: member.slug,
          legalName: member.legalNameEn,
          displayName,
          displayNameZhHans,
          isClaimed: false,
        },
      });
      brokerId = created.id;
      result.brokersCreated++;
    }

    const targetStatus = STATUS_TO_LICENSE[member.status];
    const existingLicense = await prisma.brokerLicense.findUnique({
      where: {
        tenantId_regulator_licenseNumber: {
          tenantId: tenant.id,
          regulator: Regulator.HK_HKGX,
          licenseNumber: member.memberCode,
        },
      },
    });

    if (existingLicense) {
      if (existingLicense.status !== targetStatus) {
        await prisma.brokerLicense.update({
          where: { id: existingLicense.id },
          data: { status: targetStatus },
        });
        result.licensesUpdated++;
      }
    } else {
      await prisma.brokerLicense.create({
        data: {
          tenantId: tenant.id,
          brokerId,
          regulator: Regulator.HK_HKGX,
          licenseType: LicenseType.HK_HKGX_MEMBER,
          licenseNumber: member.memberCode,
          issuedAt: new Date(),
          status: targetStatus,
        },
      });
      result.licensesCreated++;
    }
  }

  // Per-source soft retirement: a member that disappeared from the roster has
  // its HKGX license revoked (never deleted — the Broker may carry reviews).
  const activeLicenses = await prisma.brokerLicense.findMany({
    where: {
      tenantId: tenant.id,
      regulator: Regulator.HK_HKGX,
      status: { not: LicenseStatus.REVOKED },
    },
    select: { id: true, licenseNumber: true },
  });
  for (const license of activeLicenses) {
    if (seenCodes.has(license.licenseNumber)) continue;
    await prisma.brokerLicense.update({
      where: { id: license.id },
      data: { status: LicenseStatus.REVOKED },
    });
    result.membersRetired++;
  }

  return result;
}
