/**
 * OpenTrade auth context + hook.
 *
 * Provides a single shared auth state across all components via React Context.
 * Token is persisted in sessionStorage so it survives locale switches and
 * soft navigations within the same tab, but is cleared when the tab closes.
 *
 * Hydration strategy: initial state is always null (matching SSR). On mount,
 * useEffect reads sessionStorage and restores the session. AuthGate shows a
 * loading spinner until `hydrated` is true, preventing login-screen flash.
 */

'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

import type { ReactNode } from 'react';

type TokenCache = {
  accessToken: string;
  userId: string;
  expiresAt: number;
  source: 'manual' | 'privy';
};

type OpenTradeAuthState = {
  getAccessToken: () => string | null;
  setToken: (
    accessToken: string,
    userId: string,
    expiresIn: number,
    source: 'manual' | 'privy',
  ) => void;
  clearToken: () => void;
  isAuthenticated: boolean;
  isManualAuth: boolean;
  userId: string | null;
  hydrated: boolean;
};

const REFRESH_BUFFER_MS = 5 * 60 * 1000;
const STORAGE_KEY = 'opentrade_auth';

function readStorage(): TokenCache | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TokenCache;
    if (parsed.expiresAt <= Date.now()) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function saveToStorage(cache: TokenCache): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // Storage full or unavailable
  }
}

function removeStorage(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore
  }
}

const OpenTradeAuthContext = createContext<OpenTradeAuthState | null>(null);

export function OpenTradeAuthProvider({ children }: { children: ReactNode }) {
  const cacheRef = useRef<TokenCache | null>(null);
  const [authSource, setAuthSource] = useState<'manual' | 'privy' | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = readStorage();
    if (stored) {
      cacheRef.current = stored;
      setAuthSource(stored.source);
    }
    setHydrated(true);
  }, []);

  const getAccessToken = useCallback((): string | null => {
    const cached = cacheRef.current;
    if (cached && Date.now() < cached.expiresAt - REFRESH_BUFFER_MS) {
      return cached.accessToken;
    }
    return null;
  }, []);

  const setToken = useCallback(
    (accessToken: string, userId: string, expiresIn: number, source: 'manual' | 'privy') => {
      const cache: TokenCache = {
        accessToken,
        userId,
        expiresAt: Date.now() + expiresIn * 1000,
        source,
      };
      cacheRef.current = cache;
      saveToStorage(cache);
      setAuthSource(source);
    },
    [],
  );

  const clearToken = useCallback(() => {
    cacheRef.current = null;
    removeStorage();
    setAuthSource(null);
  }, []);

  const isAuthenticated = authSource !== null;
  const isManualAuth = authSource === 'manual';
  const userId = cacheRef.current?.userId ?? null;

  return (
    <OpenTradeAuthContext.Provider
      value={{
        getAccessToken,
        setToken,
        clearToken,
        isAuthenticated,
        isManualAuth,
        userId,
        hydrated,
      }}
    >
      {children}
    </OpenTradeAuthContext.Provider>
  );
}

export function useOpenTradeAuth(): OpenTradeAuthState {
  const ctx = useContext(OpenTradeAuthContext);
  if (!ctx) {
    throw new Error('useOpenTradeAuth must be used within OpenTradeAuthProvider');
  }
  return ctx;
}
