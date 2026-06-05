/**
 * CGSE member-list scraper (per ADR-0045 D5).
 *
 * CGSE publishes its authoritative bullion-dealer roster only as a public,
 * trilingual HTML page (no API). We fetch the English and Traditional Chinese
 * editions and join them by 行員編號 (member code) so each dealer carries both
 * `legalNameEn` and `legalNameZh`; `legalNameZhHans` is OpenCC-derived later
 * inside {@link syncCgseMembers}.
 *
 * This module is the only place that talks to CGSE, and it is offline-only:
 * it is imported by `scripts/fetch-cgse-members.ts`, never by API/runtime code
 * (cursor rule 31 §外部參考資料同步 — never call the source at request time).
 *
 * Markup (both editions): a single `table.trading-table` whose data rows each
 * carry 7 `<td>` cells — No. / Company Name / Executive Manager-1 /
 * Executive Manager-2 / Business Registration No / Company Cert. No / Info.
 * We read only the code (cell 0) and the company name (cell 1). The manager
 * columns are personal names (PII) and are deliberately NOT collected
 * (cursor rule 50).
 */

import { load as cheerioLoad } from 'cheerio';

import type { CgseMemberData } from './types.js';

const MEMBER_LIST_EN_URL = 'https://cgse.com.hk/chines/en/member-list';
// zh-Hant path is URL-encoded "行員名單".
const MEMBER_LIST_ZH_URL =
  'https://cgse.com.hk/chines/zh-hant/%E8%A1%8C%E5%93%A1%E5%90%8D%E5%96%AE';

const USER_AGENT = 'Mozilla/5.0 (OpenTrade-CGSE-Seed/1.0)';

const isMemberCode = (value: string): boolean => /^\d{1,4}$/.test(value);

/** Strip the leading `@` / `#` / `*` roster markers and surrounding whitespace. */
const cleanName = (raw: string): string =>
  raw
    .replace(/^[\s@#*]+/, '')
    .replace(/\s+/g, ' ')
    .trim();

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) {
    throw new Error(`CGSE returned ${res.status} for ${url}`);
  }
  return res.text();
}

/**
 * Parse a CGSE member-list edition into a `memberCode -> companyName` map.
 * Rows whose first cell is not a numeric member code (e.g. the header row) are
 * skipped, so malformed `<thead>`/`<tbody>` nesting is tolerated.
 */
function parseEdition(html: string): Map<string, string> {
  const $ = cheerioLoad(html);
  const byCode = new Map<string, string>();

  $('table.trading-table tr').each((_, tr) => {
    const cells = $(tr).find('td');
    if (cells.length < 2) return;
    const code = $(cells[0]).text().trim();
    if (!isMemberCode(code)) return;
    const name = cleanName($(cells[1]).text());
    if (name === '') return;
    if (!byCode.has(code)) byCode.set(code, name);
  });

  return byCode;
}

/** Extract the "Last Updated" timestamp the page prints in its footer, if any. */
export function parseLastUpdated(html: string): string | null {
  const match = /Last Updated\s+([\d-]+\s+[\d:]+)/i.exec(html);
  return match?.[1] ?? null;
}

/**
 * Fetch the CGSE roster as {@link CgseMemberData}. Every current member is
 * ACTIVE; SUSPENDED / REVOKED overrides are layered on by the fetch script
 * from the previously-committed JSON (see `scripts/fetch-cgse-members.ts`).
 */
export async function fetchCgseMembers(): Promise<CgseMemberData[]> {
  const [enHtml, zhHtml] = await Promise.all([
    fetchHtml(MEMBER_LIST_EN_URL),
    fetchHtml(MEMBER_LIST_ZH_URL),
  ]);

  const enByCode = parseEdition(enHtml);
  const zhByCode = parseEdition(zhHtml);

  const members: CgseMemberData[] = [];
  for (const [memberCode, legalNameEn] of enByCode) {
    members.push({
      memberCode,
      slug: `cgse-${memberCode}`,
      legalNameEn,
      legalNameZh: zhByCode.get(memberCode) ?? null,
      status: 'ACTIVE',
      source: 'cgse',
    });
  }

  members.sort((a, b) => a.memberCode.localeCompare(b.memberCode));
  return members;
}

export { MEMBER_LIST_EN_URL, MEMBER_LIST_ZH_URL };
