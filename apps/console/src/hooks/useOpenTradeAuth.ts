/**
 * React hook that bridges Privy authentication to OpenTrade's own JWT.
 *
 * Mirror of apps/web/src/hooks/useOpenTradeAuth.ts — exchanges the Privy
 * access token for an OpenTrade ES256 JWT via POST /v1/auth/exchange.
 * The token is cached in memory and re-exchanged before expiry.
 */

'use client';

import { usePrivy } from '@privy-io/react-auth';
import { useCallback, useEffect, useRef, useState } from 'react';

import { exchangeAuthToken } from '../lib/api/client';

type TokenCache = {
  accessToken: string;
  userId: string;
  expiresAt: number;
};

const REFRESH_BUFFER_MS = 5 * 60 * 1000;

export function useOpenTradeAuth() {
  const { authenticated, getAccessToken: getPrivyToken } = usePrivy();
  const cacheRef = useRef<TokenCache | null>(null);
  const exchangeInFlightRef = useRef<Promise<TokenCache | null> | null>(null);
  const [isExchanging, setIsExchanging] = useState(false);

  useEffect(() => {
    if (!authenticated) {
      cacheRef.current = null;
    }
  }, [authenticated]);

  const doExchange = useCallback(async (): Promise<TokenCache | null> => {
    const privyToken = await getPrivyToken();
    if (!privyToken) return null;

    try {
      const res = await exchangeAuthToken(privyToken);
      const cache: TokenCache = {
        accessToken: res.accessToken,
        userId: res.userId,
        expiresAt: Date.now() + res.expiresIn * 1000,
      };
      cacheRef.current = cache;
      return cache;
    } catch {
      cacheRef.current = null;
      return null;
    }
  }, [getPrivyToken]);

  const getAccessToken = useCallback(async (): Promise<string | null> => {
    if (!authenticated) return null;

    const cached = cacheRef.current;
    if (cached && Date.now() < cached.expiresAt - REFRESH_BUFFER_MS) {
      return cached.accessToken;
    }

    if (exchangeInFlightRef.current) {
      const result = await exchangeInFlightRef.current;
      return result?.accessToken ?? null;
    }

    setIsExchanging(true);
    const promise = doExchange();
    exchangeInFlightRef.current = promise;

    try {
      const result = await promise;
      return result?.accessToken ?? null;
    } finally {
      exchangeInFlightRef.current = null;
      setIsExchanging(false);
    }
  }, [authenticated, doExchange]);

  const userId = cacheRef.current?.userId ?? null;

  return { getAccessToken, isExchanging, userId } as const;
}
