/**
 * Port for password hashing and verification.
 *
 * Infrastructure adapters implement this with bcrypt/argon2/etc.
 * Tests can inject a stub that returns predictable results.
 */

export type IPasswordHasher = {
  hash(plaintext: string): Promise<string>;
  verify(plaintext: string, hashed: string): Promise<boolean>;
};
