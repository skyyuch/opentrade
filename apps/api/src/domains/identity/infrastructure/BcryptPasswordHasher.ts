/**
 * Bcrypt-based password hasher (infrastructure adapter).
 *
 * Uses bcryptjs (pure-JS, no native dependency) with cost factor 10.
 */

import bcrypt from 'bcryptjs';

import type { IPasswordHasher } from './IPasswordHasher.js';

const SALT_ROUNDS = 10;

export class BcryptPasswordHasher implements IPasswordHasher {
  async hash(plaintext: string): Promise<string> {
    return bcrypt.hash(plaintext, SALT_ROUNDS);
  }

  async verify(plaintext: string, hashed: string): Promise<boolean> {
    return bcrypt.compare(plaintext, hashed);
  }
}
