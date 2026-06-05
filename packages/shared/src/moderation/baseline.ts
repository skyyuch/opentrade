/**
 * BASELINE moderation blocklist (per ADR-0034).
 *
 * A deliberately MODEST, content-neutral starter set. It serves two roles:
 *   1. Seed for the DB-managed wordlist on a cold/empty `moderation_terms` table.
 *   2. The list the web client mirrors for advisory UX (it cannot read the DB).
 *
 * IMPORTANT — this is NOT a finished list. Cantonese profanity and evolving
 * solicitation phrasing need ongoing native-speaker curation (rule 51 culture
 * note). Operators extend the live list from the console (Phase B); this file
 * stays a sane default.
 *
 * Content-neutrality is a HARD red line (rule 00 / rule 52): this list MUST NOT
 * contain opinion/criticism words (e.g. 騙 / 爛 / 差 / 避雷 / 黑店 / 伏 / 虧錢).
 * Blocking those would turn the platform into a censor of negative reviews.
 *
 * By necessity a profanity filter contains vulgar terms; their presence here is
 * data, not endorsement.
 */

import type { ModerationTermInput } from './types.js';

export const BASELINE_MODERATION_TERMS: readonly ModerationTermInput[] = [
  // --- PROFANITY (English; ASCII → boundary-aware, gap-tolerant) ---
  { category: 'PROFANITY', term: 'fuck' },
  { category: 'PROFANITY', term: 'motherfucker' },
  { category: 'PROFANITY', term: 'shit' },
  { category: 'PROFANITY', term: 'bullshit' },
  { category: 'PROFANITY', term: 'cunt' },
  { category: 'PROFANITY', term: 'bitch' },
  { category: 'PROFANITY', term: 'asshole' },
  { category: 'PROFANITY', term: 'dickhead' },

  // --- PROFANITY (Cantonese / Chinese; multi-char to avoid false positives) ---
  { category: 'PROFANITY', term: '仆街' },
  { category: 'PROFANITY', term: '冚家鏟' },
  { category: 'PROFANITY', term: '冚家拎' },
  { category: 'PROFANITY', term: '屌你老母' },
  { category: 'PROFANITY', term: '屌你' },
  { category: 'PROFANITY', term: '屌佢' },
  { category: 'PROFANITY', term: '笨柒' },
  { category: 'PROFANITY', term: '戇鳩' },
  { category: 'PROFANITY', term: 'on9' },

  // --- ATTACK (personal insults / dehumanising; NOT criticism of service) ---
  { category: 'ATTACK', term: '智障' },
  { category: 'ATTACK', term: '低能' },
  { category: 'ATTACK', term: '腦殘' },
  { category: 'ATTACK', term: '賤人' },
  { category: 'ATTACK', term: '死全家' },
  { category: 'ATTACK', term: 'retard' },
  { category: 'ATTACK', term: 'faggot' },

  // --- CONTACT (off-platform solicitation / ads; regex) ---
  { category: 'CONTACT', term: 'https?://\\S+', isRegex: true },
  { category: 'CONTACT', term: 'www\\.[a-z0-9-]+\\.[a-z]{2,}', isRegex: true },
  {
    category: 'CONTACT',
    term: '\\b[a-z0-9-]+\\.(?:com|net|org|io|xyz|me|cc|vip|top|club)\\b',
    isRegex: true,
  },
  { category: 'CONTACT', term: 't\\.me/\\S+', isRegex: true },
  { category: 'CONTACT', term: 'wa\\.me/\\S+', isRegex: true },
  { category: 'CONTACT', term: '@[a-z][a-z0-9_]{3,}', isRegex: true },
  { category: 'CONTACT', term: '(?:微信|wechat|weixin|加微)', isRegex: true },
  { category: 'CONTACT', term: '(?:whatsapp|whats\\s?app)', isRegex: true },
  { category: 'CONTACT', term: '(?:telegram|電報群|电报群)', isRegex: true },
  { category: 'CONTACT', term: '(?:line\\s?id|加\\s?line)', isRegex: true },
  // HK-style 8-digit phone (avoids matching inside longer digit runs).
  { category: 'CONTACT', term: '(?<!\\d)[2-9]\\d{7}(?!\\d)', isRegex: true },

  // --- ILLEGAL (threats / incitement / doxxing; literal) ---
  { category: 'ILLEGAL', term: '起底' },
  { category: 'ILLEGAL', term: '人肉搜尋' },
  { category: 'ILLEGAL', term: '洗黑錢' },
  { category: 'ILLEGAL', term: '寄刀片' },
  { category: 'ILLEGAL', term: '殺死你' },
  { category: 'ILLEGAL', term: '買兇' },

  // --- PII (a third party's actual identifiers exposed as content; ADR-0044) ---
  // Baseline ships ONLY the HKID number shape (1–2 letters + 6 digits + a check
  // digit/'A', the check char optionally in brackets, e.g. A123456(7)). It is
  // distinctive enough not to collide with stock codes / account numbers, and is
  // boundary-anchored so it does not fire inside a longer alphanumeric run.
  // Residential-address patterns are intentionally NOT baseline (too false-positive
  // prone) and are left to operator-curated terms.
  {
    category: 'PII',
    term: '(?<![a-z0-9])[a-z]{1,2}\\d{6}\\(?[0-9a]\\)?(?![a-z0-9])',
    isRegex: true,
  },
];
