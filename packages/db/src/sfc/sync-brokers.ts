/**
 * Idempotent SFC broker sync — upserts Broker + BrokerLicense rows from
 * an array of {@link SfcBrokerData}. Shared by both `seed.ts` (reads JSON
 * produced by the offline fetcher) and `sync-sfc-brokers.ts` (fetches live
 * from SFC API).
 *
 * Per cursor rule 31 every write MUST be idempotent: running twice on the
 * same dataset leaves the DB in the same state as running once.
 *
 * Upsert keys:
 *   - Broker: `@@unique([tenantId, slug])`
 *   - BrokerLicense: `@@unique([tenantId, regulator, licenseNumber])`
 *
 * License lifecycle: if SFC shows a corporation no longer holds a specific
 * RA type, we mark the licence REVOKED (not deleted — per project red line).
 */

import { LicenseStatus, LicenseType, Regulator } from '@prisma/client';

import type { SfcBrokerData } from './types.js';
import type { PrismaClient } from '@prisma/client';

const RA_TYPE_TO_LICENSE: Record<number, LicenseType> = {
  1: LicenseType.HK_SFC_TYPE_1,
  2: LicenseType.HK_SFC_TYPE_2,
  3: LicenseType.HK_SFC_TYPE_3,
  4: LicenseType.HK_SFC_TYPE_4,
  5: LicenseType.HK_SFC_TYPE_5,
  6: LicenseType.HK_SFC_TYPE_6,
  7: LicenseType.HK_SFC_TYPE_7,
  8: LicenseType.HK_SFC_TYPE_8,
  9: LicenseType.HK_SFC_TYPE_9,
  10: LicenseType.HK_SFC_TYPE_10,
};

export type SyncResult = {
  brokersCreated: number;
  brokersUpdated: number;
  licensesCreated: number;
  licensesRevoked: number;
};

export async function syncBrokers(
  prisma: PrismaClient,
  data: SfcBrokerData[],
): Promise<SyncResult> {
  const tenant = await prisma.tenant.findUnique({ where: { code: 'hk' } });
  if (!tenant) {
    throw new Error('Tenant "hk" not found. Run seed first.');
  }

  const result: SyncResult = {
    brokersCreated: 0,
    brokersUpdated: 0,
    licensesCreated: 0,
    licensesRevoked: 0,
  };

  for (const broker of data) {
    const existing = await prisma.broker.findUnique({
      where: { tenantId_slug: { tenantId: tenant.id, slug: broker.slug } },
      include: { licenses: true },
    });

    if (existing) {
      await prisma.broker.update({
        where: { id: existing.id },
        data: {
          legalName: broker.legalNameEn,
          displayName: broker.legalNameZh,
          ceNumber: broker.ceNumber,
        },
      });
      result.brokersUpdated++;
    } else {
      await prisma.broker.create({
        data: {
          tenantId: tenant.id,
          slug: broker.slug,
          legalName: broker.legalNameEn,
          displayName: broker.legalNameZh,
          ceNumber: broker.ceNumber,
          isClaimed: false,
        },
      });
      result.brokersCreated++;
    }

    const brokerId =
      existing?.id ??
      (
        await prisma.broker.findUniqueOrThrow({
          where: { tenantId_slug: { tenantId: tenant.id, slug: broker.slug } },
        })
      ).id;

    const activeLicenseTypes = new Set<LicenseType>();

    for (const lic of broker.licenses) {
      const licenseType = RA_TYPE_TO_LICENSE[lic.type];
      if (!licenseType) continue;
      activeLicenseTypes.add(licenseType);

      const licenseNumber = broker.ceNumber;
      const existingLic = await prisma.brokerLicense.findUnique({
        where: {
          tenantId_regulator_licenseNumber: {
            tenantId: tenant.id,
            regulator: Regulator.HK_SFC,
            licenseNumber: `${licenseNumber}-${lic.type}`,
          },
        },
      });

      if (existingLic) {
        if (existingLic.status === LicenseStatus.REVOKED) {
          await prisma.brokerLicense.update({
            where: { id: existingLic.id },
            data: { status: LicenseStatus.ACTIVE },
          });
        }
      } else {
        await prisma.brokerLicense.create({
          data: {
            tenantId: tenant.id,
            brokerId,
            regulator: Regulator.HK_SFC,
            licenseType,
            licenseNumber: `${licenseNumber}-${lic.type}`,
            issuedAt: new Date(),
            status: LicenseStatus.ACTIVE,
          },
        });
        result.licensesCreated++;
      }
    }

    if (existing) {
      const toRevoke = existing.licenses.filter(
        (l) => l.status === LicenseStatus.ACTIVE && !activeLicenseTypes.has(l.licenseType),
      );
      for (const lic of toRevoke) {
        await prisma.brokerLicense.update({
          where: { id: lic.id },
          data: { status: LicenseStatus.REVOKED },
        });
        result.licensesRevoked++;
      }
    }
  }

  return result;
}
