/**
 * Current user context + hook.
 *
 * Fetches user profile ONCE from the API and shares the result across all
 * components via React Context. This prevents AdminGuard, AuthGate, and
 * page components from each fetching independently and having out-of-sync state.
 */

'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

import { fetchCurrentUser } from '../lib/api/client';

import { useOpenTradeAuth } from './useOpenTradeAuth';

import type { CurrentUserResponse } from '../lib/api/client';
import type { ReactNode } from 'react';

type CurrentUser = CurrentUserResponse['user'];
type ClaimedBroker = CurrentUserResponse['claimedBroker'];

type CurrentUserState = {
  user: CurrentUser | null;
  claimedBroker: ClaimedBroker;
  isAdmin: boolean;
  isBrokerOwner: boolean;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const CurrentUserContext = createContext<CurrentUserState | null>(null);

export function CurrentUserProvider({ children }: { children: ReactNode }) {
  const { getAccessToken, isAuthenticated } = useOpenTradeAuth();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [claimedBroker, setClaimedBroker] = useState<ClaimedBroker>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      setUser(null);
      setClaimedBroker(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetchCurrentUser({ accessToken: token });
      setUser(res.user);
      setClaimedBroker(res.claimedBroker);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch user');
      setUser(null);
      setClaimedBroker(null);
    } finally {
      setIsLoading(false);
    }
  }, [getAccessToken]);

  useEffect(() => {
    if (isAuthenticated) {
      void refresh();
    } else {
      setUser(null);
      setClaimedBroker(null);
      setIsLoading(false);
    }
  }, [isAuthenticated, refresh]);

  const isAdmin = user?.role === 'ADMIN';
  const isBrokerOwner = claimedBroker !== null;

  return (
    <CurrentUserContext.Provider
      value={{ user, claimedBroker, isAdmin, isBrokerOwner, isLoading, error, refresh }}
    >
      {children}
    </CurrentUserContext.Provider>
  );
}

export function useCurrentUser(): CurrentUserState {
  const ctx = useContext(CurrentUserContext);
  if (!ctx) {
    throw new Error('useCurrentUser must be used within CurrentUserProvider');
  }
  return ctx;
}
