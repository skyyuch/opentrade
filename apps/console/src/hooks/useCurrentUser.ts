/**
 * Hook that fetches the current user profile from the OpenTrade API.
 *
 * Exposes role-based helpers so layout components can determine which
 * sidebar/nav to render without prop-drilling.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';

import { fetchCurrentUser } from '../lib/api/client';

import { useOpenTradeAuth } from './useOpenTradeAuth';

import type { CurrentUserResponse } from '../lib/api/client';

type CurrentUser = CurrentUserResponse['user'];
type ClaimedBroker = CurrentUserResponse['claimedBroker'];

export function useCurrentUser() {
  const { getAccessToken, isExchanging } = useOpenTradeAuth();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [claimedBroker, setClaimedBroker] = useState<ClaimedBroker>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) {
      setUser(null);
      setClaimedBroker(null);
      setIsLoading(false);
      return;
    }

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
    if (!isExchanging) {
      void refresh();
    }
  }, [isExchanging, refresh]);

  const isAdmin = user?.role === 'ADMIN';
  const isBrokerOwner = claimedBroker !== null;

  return {
    user,
    claimedBroker,
    isAdmin,
    isBrokerOwner,
    isLoading: isLoading || isExchanging,
    error,
    refresh,
  } as const;
}
