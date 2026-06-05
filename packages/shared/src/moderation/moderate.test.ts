/**
 * Tests for the content-moderation engine (ADR-0034). The most important suite
 * is "content-neutrality": the gate MUST NOT block negative opinion. If that
 * ever fails, the platform has become a censor of negative reviews — a rule 00
 * red line.
 */

import { describe, expect, it } from 'vitest';

import { BASELINE_MODERATION_TERMS } from './baseline.js';
import { moderateContent } from './moderate.js';
import { MODERATION_CATEGORIES, isModerationCategory, type ModerationTermInput } from './types.js';

const profanity: readonly ModerationTermInput[] = [{ category: 'PROFANITY', term: 'fuck' }];

describe('moderateContent — literal ASCII matching', () => {
  it('flags the plain term', () => {
    const result = moderateContent('what the fuck is this', profanity);
    expect(result.ok).toBe(false);
    expect(result.categories).toEqual(['PROFANITY']);
    expect(result.violations).toEqual([{ category: 'PROFANITY', term: 'fuck' }]);
  });

  it('catches gap / separator evasion (f u c k, f.u.c.k)', () => {
    expect(moderateContent('f u c k you', profanity).ok).toBe(false);
    expect(moderateContent('f.u.c.k', profanity).ok).toBe(false);
  });

  it('catches full-width and zero-width evasion', () => {
    expect(moderateContent('ＦＵＣＫ', profanity).ok).toBe(false); // full-width NFKC
    expect(moderateContent('fu\u200Bck', profanity).ok).toBe(false); // zero-width space
  });

  it('does NOT false-positive on Scunthorpe (boundary anchoring)', () => {
    const terms: readonly ModerationTermInput[] = [{ category: 'PROFANITY', term: 'cunt' }];
    expect(moderateContent('I live in Scunthorpe', terms).ok).toBe(true);
    expect(moderateContent('you cunt', terms).ok).toBe(false);
  });
});

describe('moderateContent — CJK substring matching', () => {
  it('flags a Cantonese profanity', () => {
    expect(moderateContent('你個仆街', [{ category: 'PROFANITY', term: '仆街' }]).ok).toBe(false);
  });

  it('catches separator evasion in CJK (仆 街)', () => {
    expect(moderateContent('仆 街', [{ category: 'PROFANITY', term: '仆街' }]).ok).toBe(false);
  });
});

describe('moderateContent — regex terms (CONTACT)', () => {
  const contact = BASELINE_MODERATION_TERMS.filter((t) => t.category === 'CONTACT');

  it('flags Telegram / WhatsApp / WeChat solicitation', () => {
    expect(moderateContent('加我 t.me/scamgroup', contact).ok).toBe(false);
    expect(moderateContent('whatsapp me now', contact).ok).toBe(false);
    expect(moderateContent('加微信 abc', contact).ok).toBe(false);
  });

  it('flags an @handle and a URL', () => {
    expect(moderateContent('follow @tradingguru here', contact).ok).toBe(false);
    expect(moderateContent('see https://scam.example', contact).ok).toBe(false);
  });

  it('flags an HK-style 8-digit phone but not a longer id', () => {
    expect(moderateContent('call 91234567', contact).ok).toBe(false);
    expect(moderateContent('order 1234567890123', contact).ok).toBe(true);
  });

  it('never throws on an invalid regex term', () => {
    const bad: readonly ModerationTermInput[] = [
      { category: 'CONTACT', term: '([', isRegex: true },
    ];
    expect(() => moderateContent('anything', bad)).not.toThrow();
    expect(moderateContent('anything', bad).ok).toBe(true);
  });
});

describe('moderateContent — content neutrality (RED LINE)', () => {
  // These are legitimate negative reviews. They MUST pass against the full
  // baseline. Blocking any of them is a rule 00 / rule 52 violation.
  const negativeReviews = [
    '這間券商是騙子，收費刪負評',
    '服務很爛，介面又差，千祈唔好用',
    '黑店，避雷，我虧了很多錢',
    '出金很慢，客服態度差勁，伏到爆',
    'This broker is a scam, terrible service, lost all my money',
  ];

  for (const review of negativeReviews) {
    it(`allows negative opinion: "${review.slice(0, 16)}…"`, () => {
      const result = moderateContent(review, BASELINE_MODERATION_TERMS);
      expect(result.ok).toBe(true);
      expect(result.violations).toEqual([]);
    });
  }
});

describe('moderateContent — aggregation', () => {
  it('deduplicates and orders categories canonically', () => {
    const terms: readonly ModerationTermInput[] = [
      { category: 'ILLEGAL', term: '起底' },
      { category: 'PROFANITY', term: 'fuck' },
      { category: 'PROFANITY', term: 'shit' },
    ];
    const result = moderateContent('fuck this shit, 我要起底你', terms);
    expect(result.ok).toBe(false);
    // PROFANITY before ILLEGAL per MODERATION_CATEGORIES order.
    expect(result.categories).toEqual(['PROFANITY', 'ILLEGAL']);
    expect(result.violations).toHaveLength(3);
  });

  it('returns ok for clean text', () => {
    expect(moderateContent('great execution and low fees', BASELINE_MODERATION_TERMS).ok).toBe(
      true,
    );
  });
});

describe('isModerationCategory', () => {
  it('accepts every category and rejects others', () => {
    for (const category of MODERATION_CATEGORIES) {
      expect(isModerationCategory(category)).toBe(true);
    }
    expect(isModerationCategory('SENTIMENT')).toBe(false);
    expect(isModerationCategory(null)).toBe(false);
  });
});
