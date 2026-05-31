/**
 * EQUITY_HK source — the official HKEX "List of Securities" (ADR-0038 D5).
 *
 * Free, keyless bulk XLSX files. We fetch both the English and Traditional
 * Chinese editions and join them by stock code so each equity carries
 * `nameEn` + `nameZh`; `nameZhHans` is OpenCC-derived later inside
 * syncInstruments. Only rows whose Category is "Equity" (英) / "股本" (中)
 * are kept — ETFs, warrants, bonds, CBBCs etc. are excluded.
 *
 * Layout (both files): header on row 3, data from row 4.
 *   A = Stock Code   B = Name of Securities   C = Category
 */

import { fetchBuffer, parseXlsxRows } from './xlsx.js';

import type { InstrumentData } from '../types.js';

const HKEX_EN_URL =
  'https://www.hkex.com.hk/eng/services/trading/securities/securitieslists/ListOfSecurities.xlsx';
const HKEX_ZH_URL =
  'https://www.hkex.com.hk/chi/services/trading/securities/securitieslists/ListOfSecurities_c.xlsx';

const isEnglishEquity = (category: string | undefined): boolean => category?.trim() === 'Equity';
const isChineseEquity = (category: string | undefined): boolean => category?.trim() === '股本';

export async function fetchHkexInstruments(): Promise<InstrumentData[]> {
  const [enBuf, zhBuf] = await Promise.all([fetchBuffer(HKEX_EN_URL), fetchBuffer(HKEX_ZH_URL)]);

  // code → Traditional Chinese name (best-effort; missing if the ZH file lags).
  const zhByCode = new Map<string, string>();
  for (const row of parseXlsxRows(zhBuf)) {
    if (!isChineseEquity(row['C'])) continue;
    const code = row['A']?.trim();
    const name = row['B']?.trim();
    if (code && name) zhByCode.set(code, name);
  }

  const instruments: InstrumentData[] = [];
  const seen = new Set<string>();
  for (const row of parseXlsxRows(enBuf)) {
    if (!isEnglishEquity(row['C'])) continue;
    const code = row['A']?.trim();
    const nameEn = row['B']?.trim();
    if (!code || !nameEn) continue;
    if (seen.has(code)) continue;
    seen.add(code);

    instruments.push({
      category: 'EQUITY_HK',
      symbol: code,
      displayCode: code,
      nameEn,
      nameZh: zhByCode.get(code) ?? null,
      exchange: 'HKEX',
      source: 'HKEX',
    });
  }

  return instruments;
}
