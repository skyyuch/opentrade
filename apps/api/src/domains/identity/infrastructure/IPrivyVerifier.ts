/**
 * Port for Privy token verification.
 *
 * Infrastructure adapters implement this to call the Privy server SDK.
 * Keeping it as a port lets tests inject a stub without touching Privy.
 */

export type PrivyClaims = {
  userId: string;
  walletAddress: string | null;
  email: string | null;
};

export type IPrivyVerifier = {
  verifyToken(accessToken: string): Promise<PrivyClaims>;
};
