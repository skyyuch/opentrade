/**
 * HKGX member-list scraper (per ADR-0045 D5, rebranded per ADR-0050).
 *
 * The Hong Kong Gold Exchange (香港黃金交易所) — successor to CGSE since
 * 2025-01-01 — publishes its authoritative bullion-dealer roster only as a
 * public, bilingual HTML page (no API). We fetch the English and Traditional
 * Chinese editions and join them by 行員編號 (member code) so each dealer carries
 * both `legalNameEn` and `legalNameZh`; `legalNameZhHans` is OpenCC-derived
 * later inside {@link syncHkgxMembers}.
 *
 * This module is the only place that talks to HKGX, and it is offline-only:
 * it is imported by `scripts/fetch-hkgx-members.ts`, never by API/runtime code
 * (cursor rule 31 §外部參考資料同步 — never call the source at request time).
 *
 * Markup: the member roster is a standard HTML `<table>` whose data rows lead
 * with 行員編號 (cell 0) and the company name (cell 1). We read only the code
 * and the company name; the executive-manager / principal columns are personal
 * names (PII) and are deliberately NOT collected (cursor rule 50). The selector
 * is intentionally `table` (not a specific class) + an `isMemberCode` guard so
 * it tolerates markup changes and skips non-data rows (status-legend tables,
 * header rows).
 *
 * NOTE (ADR-0050 D5): the HKGX page uses a 6-column layout with PII-adjacent
 * edge cases (individual members surface a principal name in the name column).
 * A full live re-scrape that handles those is a Phase 2 follow-up; the committed
 * `hkgx-members.json` is the current source of truth.
 */

import { load as cheerioLoad } from 'cheerio';

import type { HkgxMemberData } from './types.js';

const MEMBER_LIST_EN_URL = 'https://hkgx.com.hk/en/member/memberlist';
const MEMBER_LIST_ZH_URL = 'https://hkgx.com.hk/hk/member/memberlist';

const USER_AGENT = 'Mozilla/5.0 (OpenTrade-HKGX-Seed/1.0)';

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
    throw new Error(`HKGX returned ${res.status} for ${url}`);
  }
  return res.text();
}

/**
 * Parse an HKGX member-list edition into a `memberCode -> companyName` map.
 * Rows whose first cell is not a numeric member code (e.g. the header row or
 * the status-legend tables) are skipped, so malformed `<thead>`/`<tbody>`
 * nesting and the surrounding non-roster tables are tolerated.
 */
function parseEdition(html: string): Map<string, string> {
  const $ = cheerioLoad(html);
  const byCode = new Map<string, string>();

  $('table tr').each((_, tr) => {
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
 * Fetch the HKGX roster as {@link HkgxMemberData}. Every current member is
 * ACTIVE; SUSPENDED / REVOKED overrides are layered on by the fetch script
 * from the previously-committed JSON (see `scripts/fetch-hkgx-members.ts`).
 */
export async function fetchHkgxMembers(): Promise<HkgxMemberData[]> {
  const [enHtml, zhHtml] = await Promise.all([
    fetchHtml(MEMBER_LIST_EN_URL),
    fetchHtml(MEMBER_LIST_ZH_URL),
  ]);

  const enByCode = parseEdition(enHtml);
  const zhByCode = parseEdition(zhHtml);

  const members: HkgxMemberData[] = [];
  for (const [memberCode, legalNameEn] of enByCode) {
    members.push({
      memberCode,
      slug: `hkgx-${memberCode}`,
      legalNameEn,
      legalNameZh: zhByCode.get(memberCode) ?? null,
      status: 'ACTIVE',
      source: 'hkgx',
    });
  }

  members.sort((a, b) => a.memberCode.localeCompare(b.memberCode));
  return members;
}

export { MEMBER_LIST_EN_URL, MEMBER_LIST_ZH_URL };
