/**
 * Shared types for SFC broker data consumed by both the offline fetcher
 * (`scripts/fetch-sfc-brokers.ts`) and the DB sync logic (`sync-brokers.ts`).
 */

export type SfcBrokerLicense = {
  type: number;
  description: string;
};

export type SfcBrokerData = {
  ceNumber: string;
  legalNameEn: string;
  legalNameZh: string;
  slug: string;
  licenses: SfcBrokerLicense[];
};
