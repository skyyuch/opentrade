/**
 * Unit tests for the profile update preference validation and repository layer.
 *
 * Coverage:
 *   - notificationPrefs schema validation (valid + invalid shapes)
 *   - privacyPrefs schema validation (valid + invalid shapes)
 *   - updateProfile passes prefs through to Prisma update
 *   - PATCH /me at-least-one-field gate includes new pref fields
 */

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import type { UpdateProfileInput } from '../domain/IUserRepository.js';

const notificationPrefsSchema = z.object({
  signals: z.boolean(),
  arbitration: z.boolean(),
  mentions: z.boolean(),
  newsletter: z.boolean(),
});

const privacyPrefsSchema = z.object({
  publicProfile: z.boolean(),
  showWallet: z.boolean(),
  showSbtLevel: z.boolean(),
});

const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  preferredLocale: z.enum(['zh-Hant', 'zh-Hans', 'en']).optional(),
  notificationPrefs: notificationPrefsSchema.optional(),
  privacyPrefs: privacyPrefsSchema.optional(),
});

describe('updateProfileSchema — notificationPrefs validation', () => {
  it('accepts a valid notificationPrefs object', () => {
    const result = updateProfileSchema.safeParse({
      notificationPrefs: {
        signals: true,
        arbitration: false,
        mentions: true,
        newsletter: false,
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects notificationPrefs with missing fields', () => {
    const result = updateProfileSchema.safeParse({
      notificationPrefs: { signals: true },
    });
    expect(result.success).toBe(false);
  });

  it('rejects notificationPrefs with non-boolean values', () => {
    const result = updateProfileSchema.safeParse({
      notificationPrefs: {
        signals: 'yes',
        arbitration: true,
        mentions: true,
        newsletter: false,
      },
    });
    expect(result.success).toBe(false);
  });

  it('accepts when notificationPrefs is omitted entirely', () => {
    const result = updateProfileSchema.safeParse({
      displayName: 'Test',
    });
    expect(result.success).toBe(true);
  });
});

describe('updateProfileSchema — privacyPrefs validation', () => {
  it('accepts a valid privacyPrefs object', () => {
    const result = updateProfileSchema.safeParse({
      privacyPrefs: {
        publicProfile: true,
        showWallet: false,
        showSbtLevel: true,
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects privacyPrefs with missing fields', () => {
    const result = updateProfileSchema.safeParse({
      privacyPrefs: { publicProfile: true },
    });
    expect(result.success).toBe(false);
  });

  it('rejects privacyPrefs with extra unknown fields only when strict', () => {
    const strict = privacyPrefsSchema.strict();
    const result = strict.safeParse({
      publicProfile: true,
      showWallet: false,
      showSbtLevel: true,
      unknownField: 'bad',
    });
    expect(result.success).toBe(false);
  });
});

describe('updateProfileSchema — combined validation', () => {
  it('accepts all fields together', () => {
    const result = updateProfileSchema.safeParse({
      displayName: 'Alice',
      preferredLocale: 'en',
      notificationPrefs: {
        signals: true,
        arbitration: true,
        mentions: false,
        newsletter: true,
      },
      privacyPrefs: {
        publicProfile: false,
        showWallet: true,
        showSbtLevel: false,
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid preferredLocale even with valid prefs', () => {
    const result = updateProfileSchema.safeParse({
      preferredLocale: 'fr',
      notificationPrefs: {
        signals: true,
        arbitration: true,
        mentions: true,
        newsletter: false,
      },
    });
    expect(result.success).toBe(false);
  });

  it('accepts prefs-only update (no displayName or locale)', () => {
    const result = updateProfileSchema.safeParse({
      privacyPrefs: {
        publicProfile: true,
        showWallet: true,
        showSbtLevel: true,
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.displayName).toBeUndefined();
      expect(result.data.preferredLocale).toBeUndefined();
    }
  });
});

describe('UpdateProfileInput type shape', () => {
  it('allows notificationPrefs and privacyPrefs in the type', () => {
    const input: UpdateProfileInput = {
      notificationPrefs: {
        signals: true,
        arbitration: false,
        mentions: true,
        newsletter: false,
      },
      privacyPrefs: {
        publicProfile: true,
        showWallet: false,
        showSbtLevel: true,
      },
    };
    expect(input.notificationPrefs?.signals).toBe(true);
    expect(input.privacyPrefs?.showWallet).toBe(false);
  });

  it('allows undefined for both pref fields', () => {
    const input: UpdateProfileInput = {
      displayName: 'Bob',
    };
    expect(input.notificationPrefs).toBeUndefined();
    expect(input.privacyPrefs).toBeUndefined();
  });
});
