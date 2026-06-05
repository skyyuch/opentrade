/**
 * Pure content-moderation engine (per ADR-0034, layer 1).
 *
 * `moderateContent(text, terms)` checks free text against a blocklist and
 * returns a structured result. It is framework-free and DB-free: the caller
 * supplies the term list (the API passes DB-managed terms; the web client
 * passes the bundled BASELINE). The server is always the authority (rule 30);
 * the client uses this only for advisory UX.
 *
 * Design notes:
 *   - Normalisation folds full-width → half-width (NFKC), lower-cases, and
 *     strips zero-width characters, defeating common look-alike evasion.
 *   - ASCII literal terms match with WORD BOUNDARIES and tolerate small gaps,
 *     so "f u c k" / "f.u.c.k" are caught while "Scunthorpe" is NOT (the
 *     classic false-positive). CJK literal terms use substring matching on
 *     both the normalised and the separator-stripped ("compact") text.
 *   - The engine NEVER throws on user input: an invalid regex term is skipped.
 *
 * Returned `violations[].term` is the BLOCKLIST entry, never the user's text,
 * so logging it is PII-safe (rule 50).
 */

import {
  MODERATION_CATEGORIES,
  type ModerationCategory,
  type ModerationResult,
  type ModerationTermInput,
  type ModerationViolation,
} from './types';

const ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF]/g;
/** Whitespace + punctuation + symbols, used to build the "compact" form. */
const SEPARATORS = /[\s\p{P}\p{S}]+/gu;
/** A term made entirely of ASCII letters/digits gets boundary-aware matching. */
const ASCII_WORD = /^[a-z0-9]+$/;

/** NFKC + strip zero-width + lower-case. */
const normalizeText = (text: string): string =>
  text.normalize('NFKC').replace(ZERO_WIDTH, '').toLowerCase();

/** Remove all whitespace/punctuation/symbols (catches "幹 你" → "幹你"). */
const compactText = (normalized: string): string => normalized.replace(SEPARATORS, '');

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Build a boundary-anchored, gap-tolerant matcher for an ASCII term. Allows up
 * to three non-alphanumeric chars between letters (so "f u c k" matches) but
 * requires non-alphanumeric boundaries on both ends (so "cunt" does not match
 * inside "scunthorpe").
 */
const asciiMatcher = (normTerm: string): RegExp => {
  const body = normTerm
    .split('')
    .map((char) => escapeRegExp(char))
    .join('[^a-z0-9]{0,3}');
  return new RegExp(`(?<![a-z0-9])${body}(?![a-z0-9])`, 'u');
};

const matchesTerm = (term: ModerationTermInput, normalized: string, compact: string): boolean => {
  if (term.term.length === 0) return false;

  if (term.isRegex === true) {
    try {
      return new RegExp(term.term, 'iu').test(normalized);
    } catch {
      // Invalid pattern (should be validated upstream); never break a submit.
      return false;
    }
  }

  const normTerm = normalizeText(term.term);
  if (normTerm.length === 0) return false;

  if (ASCII_WORD.test(normTerm)) {
    return asciiMatcher(normTerm).test(normalized);
  }

  if (normalized.includes(normTerm)) return true;
  const compactTerm = compactText(normTerm);
  return compactTerm.length > 0 && compact.includes(compactTerm);
};

/**
 * Check `text` against `terms`.
 *
 * @param text  Free text to moderate (e.g. review title + body).
 * @param terms Blocklist entries to match against.
 * @returns A {@link ModerationResult}; `ok` is true when nothing matched.
 */
export const moderateContent = (
  text: string,
  terms: readonly ModerationTermInput[],
): ModerationResult => {
  const normalized = normalizeText(text);
  const compact = compactText(normalized);

  const violations: ModerationViolation[] = [];
  const seen = new Set<string>();

  for (const term of terms) {
    if (!matchesTerm(term, normalized, compact)) continue;
    const key = `${term.category}:${term.term}`;
    if (seen.has(key)) continue;
    seen.add(key);
    violations.push({ category: term.category, term: term.term });
  }

  const matchedCategories = new Set<ModerationCategory>(violations.map((v) => v.category));
  const categories = MODERATION_CATEGORIES.filter((c) => matchedCategories.has(c));

  return { ok: violations.length === 0, violations, categories };
};
