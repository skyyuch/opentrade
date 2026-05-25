/**
 * Isolated Privy login button component.
 *
 * All Privy SDK hooks live here so that if Privy fails to initialize,
 * the error is caught by the PrivyErrorBoundary and the rest of the
 * login page (credential form) continues to work.
 *
 * IMPORTANT: This component does NOT auto-exchange restored Privy sessions.
 * It only exchanges tokens after the user explicitly clicks the login button.
 * This prevents Privy from hijacking the login page when a stale session exists.
 */

'use client';

import { usePrivy } from '@privy-io/react-auth';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef } from 'react';

import { useOpenTradeAuth } from '../../hooks/useOpenTradeAuth';
import { exchangeAuthToken } from '../../lib/api/client';

export const PrivyLoginButton = () => {
  const { ready, authenticated, login, logout, getAccessToken: getPrivyToken } = usePrivy();
  const { setToken, isAuthenticated } = useOpenTradeAuth();
  const t = useTranslations();
  const userClickedLogin = useRef(false);

  useEffect(() => {
    if (!authenticated || isAuthenticated || !userClickedLogin.current) return;

    let cancelled = false;
    const exchange = async () => {
      try {
        const privyToken = await getPrivyToken();
        if (!privyToken || cancelled) return;
        const res = await exchangeAuthToken(privyToken);
        if (!cancelled) {
          setToken(res.accessToken, res.userId, res.expiresIn, 'privy');
        }
      } catch {
        // Exchange failed — user can still try credential login
      } finally {
        userClickedLogin.current = false;
      }
    };

    void exchange();
    return () => {
      cancelled = true;
    };
  }, [authenticated, isAuthenticated, getPrivyToken, setToken]);

  const handlePrivyLogin = useCallback(() => {
    if (authenticated) {
      void logout();
    }
    userClickedLogin.current = true;
    void login();
  }, [authenticated, login, logout]);

  if (!ready) return null;
  if (isAuthenticated) return null;

  return (
    <>
      <div className="flex w-full items-center gap-3">
        <div className="h-px flex-1 bg-white/10" />
        <span className="text-xs text-white/30">{t('auth.orLoginWith')}</span>
        <div className="h-px flex-1 bg-white/10" />
      </div>
      <button
        type="button"
        onClick={handlePrivyLogin}
        className="w-full rounded-lg border border-white/10 bg-white/5 px-6 py-2.5 text-sm font-medium text-white transition-all hover:bg-white/10"
      >
        {t('auth.merchantLogin')}
      </button>
    </>
  );
};
