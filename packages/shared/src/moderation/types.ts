/**
 * Content-moderation shared types (per ADR-0034).
 *
 * Framework-free: no Prisma, no Next, no Hono. The DB enum `ModerationCategory`
 * is the source of truth for the value set; this module mirrors it so the pure
 * matching engine ({@link ./moderate}) and the front-end can agree without
 * importing `@opentrade/db` at runtime.
 *
 * The four categories are CONTENT-NEUTRAL by construction: there is deliberately
 * no "negative sentiment" category. Criticism is always allowed (rule 00 / 52).
 */

/** The four moderation categories, in a stable order. Mirrors the DB enum. */
export const MODERATION_CATEGORIES = ['PROFANITY', 'ATTACK', 'CONTACT', 'ILLEGAL'] as const;

/** Union of the four moderation categories. */
export type ModerationCategory = (typeof MODERATION_CATEGORIES)[number];

/**
 * Narrowing guard: is `value` one of the four categories? Use at trust
 * boundaries (admin input, query params) before treating a string as a
 * {@link ModerationCategory}.
 */
export const isModerationCategory = (value: unknown): value is ModerationCategory =>
  typeof value === 'string' && (MODERATION_CATEGORIES as readonly string[]).includes(value);

/**
 * A single blocklist entry fed to the engine. `term` is either a literal
 * substring (when `isRegex` is falsy) or a JavaScript regex source string
 * (when `isRegex` is true). This is the curated blocklist text, never user
 * content.
 */
export type ModerationTermInput = {
  readonly category: ModerationCategory;
  readonly term: string;
  readonly isRegex?: boolean;
};

/**
 * One matched blocklist entry. `term` is the BLOCKLIST term/pattern that fired
 * — NEVER the user's matched substring — so it is safe to surface and is free
 * of user PII (rule 50).
 */
export type ModerationViolation = {
  readonly category: ModerationCategory;
  readonly term: string;
};

/** Outcome of moderating a piece of text against a blocklist. */
export type ModerationResult = {
  /** True when no blocklist entry matched. */
  readonly ok: boolean;
  /** Every blocklist entry that matched (deduplicated by category + term). */
  readonly violations: readonly ModerationViolation[];
  /** Distinct categories that matched, in {@link MODERATION_CATEGORIES} order. */
  readonly categories: readonly ModerationCategory[];
};
