/**
 * Offline fetcher for CGSE (Chinese Gold & Silver Exchange Society) bullion
 * dealers. Scrapes the public member-list page (English + Traditional Chinese
 * editions) and writes a normalised JSON file to
 * `seed-data/cgse-members.json`. Per ADR-0045 D5.
 *
 * Run via:
 *   pnpm --filter @opentrade/db fetch:cgse
 *
 * Workflow: a developer runs this, reviews the git diff, and commits — so every
 * membership change is an auditable diff and a markup change fails loudly in
 * front of a human, not silently in production. The runtime never calls CGSE
 * (cursor rule 31 §外部參考資料同步).
 *
 * Status overrides: CGSE has no structured watch/suspended list (suspensions
 * appear in unstructured announcements). Every scraped member is ACTIVE; any
 * SUSPENDED / REVOKED status previously curated into the committed JSON is
 * preserved here across re-scrapes so a re-fetch never silently re-activates a
 * dealer a human marked down.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fetchCgseMembers } from '../src/cgse/scrape.js';

import type { CgseMemberData, CgseMemberStatus } from '../src/cgse/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const OUT_PATH = resolve(__dirname, '../seed-data/cgse-members.json');

/** Build a `memberCode -> status` map of curated non-ACTIVE overrides. */
function loadStatusOverrides(): Map<string, CgseMemberStatus> {
  const overrides = new Map<string, CgseMemberStatus>();
  if (!existsSync(OUT_PATH)) return overrides;
  try {
    const existing = JSON.parse(readFileSync(OUT_PATH, 'utf-8')) as CgseMemberData[];
    for (const member of existing) {
      if (member.status !== 'ACTIVE') overrides.set(member.memberCode, member.status);
    }
  } catch {
    console.log('  ⚠ Could not parse existing cgse-members.json — ignoring overrides.');
  }
  return overrides;
}

async function main(): Promise<void> {
  console.log('Fetching CGSE member list (English + Traditional Chinese editions)...');
  const members = await fetchCgseMembers();
  console.log(`  Scraped ${members.length} members.`);

  const overrides = loadStatusOverrides();
  if (overrides.size > 0) {
    console.log(`  Preserving ${overrides.size} curated non-ACTIVE status override(s).`);
  }

  let withZh = 0;
  for (const member of members) {
    const override = overrides.get(member.memberCode);
    if (override) member.status = override;
    if (member.legalNameZh) withZh++;
  }

  const statusCounts = members.reduce<Record<string, number>>((acc, m) => {
    acc[m.status] = (acc[m.status] ?? 0) + 1;
    return acc;
  }, {});

  console.log(`  Traditional Chinese names matched: ${withZh}/${members.length}`);
  console.log(`  Status distribution: ${JSON.stringify(statusCounts)}`);

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(members, null, 2) + '\n', 'utf-8');
  console.log(`\nWritten ${members.length} members to ${OUT_PATH}`);
}

try {
  await main();
} catch (err) {
  console.error('Fetch failed:', err);
  process.exitCode = 1;
}
