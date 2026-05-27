/**
 * Full-page authentication route for OpenTrade web (Phase 2 UI Polish S2).
 *
 * Replaces the previous default `usePrivy().login()` modal callsites with a
 * dedicated route that mirrors the Google OpenTrade-UI `Auth.tsx` reference
 * design. Renders five login surfaces:
 *
 *   1. Wallet (primary CTA)        → useConnectWallet()
 *   2. iAM Smart (Coming Soon)     → opens info modal (per ADR-0031 D7 transition)
 *   3. Google                      → useLoginWithOAuth({ provider: 'google' })
 *   4. Apple                       → useLoginWithOAuth({ provider: 'apple' })
 *   5. Email (two-step OTP)        → useLoginWithEmail() sendCode + loginWithCode
 *
 * returnUrl handling:
 *   - Parsed from ?returnUrl= query and validated against an open-redirect
 *     allow-list (same-origin, root-relative `/...` paths only).
 *   - Persisted to sessionStorage before any OAuth redirect so it survives
 *     `window.location.assign(...)` invoked by Privy's `initOAuth`.
 *   - On Privy `authenticated === true` (covers OAuth callback, email OTP,
 *     wallet connect), router.push(safeReturnUrl ?? '/') is called.
 *
 * The OpenTrade JWT exchange is NOT triggered here — `useOpenTradeAuth` runs
 * on every page that needs the OpenTrade JWT and exchanges reactively once
 * Privy `authenticated` flips. /auth only owns the Privy authentication step.
 *
 * Per rule 00: no investment advice; no hard-coded secrets; locale-aware
 * navigation via `next-intl`'s `useRouter`.
 */

'use client';

import {
  usePrivy,
  useConnectWallet,
  useLoginWithEmail,
  useLoginWithOAuth,
} from '@privy-io/react-auth';
import { ArrowRight, Fingerprint, Mail, ShieldCheck, Wallet as WalletIcon, X } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useRouter } from '../../../i18n/navigation';

import type { ReactNode } from 'react';

const RETURN_URL_STORAGE_KEY = 'opentrade.auth.returnUrl';

/**
 * Validate a returnUrl candidate against an open-redirect allow-list.
 *
 * Accepts only same-origin root-relative paths:
 *   - Must start with a single `/`
 *   - Must NOT start with `//` (protocol-relative, redirects off-origin)
 *   - Must NOT start with `/\\` (Windows-style smuggle past naive checks)
 *
 * Rejects: absolute URLs (`https://evil.com`), protocol-relative
 * (`//evil.com`), backslash variants, and empty strings.
 */
function isSafeReturnUrl(candidate: string | null): candidate is string {
  if (!candidate) return false;
  if (!candidate.startsWith('/')) return false;
  if (candidate.startsWith('//') || candidate.startsWith('/\\')) return false;
  return true;
}

const GoogleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      fill="#4285F4"
    />
    <path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.16v2.84C3.99 20.53 7.7 23 12 23z"
      fill="#34A853"
    />
    <path
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.16C1.43 8.55 1 10.22 1 12s.43 3.45 1.16 4.93l3.68-2.84z"
      fill="#FBBC05"
    />
    <path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.16 7.07l3.68 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      fill="#EA4335"
    />
  </svg>
);

const AppleIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M16.142 2.97c-.97.97-1.487 2.274-1.404 3.633 1.25-.05 2.596-.757 3.414-1.743.834-.988 1.403-2.31 1.34-3.616-1.282.025-2.583.742-3.35 1.726zm.268 4.708c-1.332-.05-2.872.842-3.605.842-.716 0-1.973-.808-3.07-.79-1.43.016-2.753.834-3.486 2.106-1.503 2.618-.384 6.488 1.083 8.608.717 1.043 1.567 2.21 2.684 2.175 1.082-.034 1.482-.693 2.798-.693 1.3 0 1.684.676 2.815.658 1.166-.017 1.916-1.077 2.616-2.108.816-1.192 1.15-2.342 1.166-2.4-.025-.008-2.25-.858-2.266-3.416-.017-2.142 1.766-3.167 1.833-3.216-1-1.458-2.55-1.617-3.116-1.666z" />
  </svg>
);

type EmailFormState =
  | { kind: 'collapsed' }
  | { kind: 'inputEmail'; email: string; sending: boolean; error: string | null }
  | { kind: 'inputCode'; email: string; code: string; verifying: boolean; error: string | null };

export default function AuthPage(): ReactNode {
  const t = useTranslations('auth');
  const router = useRouter();
  const searchParams = useSearchParams();
  const { authenticated } = usePrivy();

  const [iamSmartOpen, setIamSmartOpen] = useState(false);
  const [emailState, setEmailState] = useState<EmailFormState>({ kind: 'collapsed' });
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);

  const rawReturnUrl = searchParams.get('returnUrl');
  const safeReturnUrl = useMemo(
    () => (isSafeReturnUrl(rawReturnUrl) ? rawReturnUrl : null),
    [rawReturnUrl],
  );

  /**
   * Persist returnUrl for OAuth roundtrips. `initOAuth` invokes
   * `window.location.assign(...)` which discards in-memory state, so we
   * stash the validated returnUrl in sessionStorage. On callback, this
   * page mounts again and the post-auth effect below reads it back.
   */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (safeReturnUrl) {
      window.sessionStorage.setItem(RETURN_URL_STORAGE_KEY, safeReturnUrl);
    }
  }, [safeReturnUrl]);

  /**
   * Post-auth redirect. Fires for every successful login path (OAuth
   * callback, email OTP, wallet connect) because Privy's `authenticated`
   * flips synchronously after each. Reads returnUrl from sessionStorage
   * first (survives OAuth redirect), falls back to query param, then `/`.
   */
  useEffect(() => {
    if (!authenticated) return;
    let target = '/';
    if (typeof window !== 'undefined') {
      const stored = window.sessionStorage.getItem(RETURN_URL_STORAGE_KEY);
      if (isSafeReturnUrl(stored)) {
        target = stored;
      } else if (safeReturnUrl) {
        target = safeReturnUrl;
      }
      window.sessionStorage.removeItem(RETURN_URL_STORAGE_KEY);
    } else if (safeReturnUrl) {
      target = safeReturnUrl;
    }
    router.replace(target);
  }, [authenticated, router, safeReturnUrl]);

  const { connectWallet } = useConnectWallet({
    onError: () => setWalletError(t('walletError')),
  });

  const { initOAuth, loading: oauthLoading } = useLoginWithOAuth({
    onError: () => setOauthError(t('oauthError')),
  });

  const { sendCode, loginWithCode } = useLoginWithEmail({
    onError: () => {
      setEmailState((prev) =>
        prev.kind === 'inputCode'
          ? { ...prev, verifying: false, error: t('emailErrorVerifyFailed') }
          : prev,
      );
    },
  });

  const handleWallet = useCallback(() => {
    setWalletError(null);
    connectWallet();
  }, [connectWallet]);

  const handleOAuth = useCallback(
    async (provider: 'google' | 'apple') => {
      setOauthError(null);
      try {
        await initOAuth({ provider });
      } catch {
        setOauthError(t('oauthError'));
      }
    },
    [initOAuth, t],
  );

  const handleEmailButton = useCallback(() => {
    setEmailState({ kind: 'inputEmail', email: '', sending: false, error: null });
  }, []);

  const handleEmailSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (emailState.kind !== 'inputEmail') return;
      const email = emailState.email.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setEmailState({ ...emailState, error: t('emailErrorInvalid') });
        return;
      }
      setEmailState({ ...emailState, sending: true, error: null });
      try {
        await sendCode({ email });
        setEmailState({ kind: 'inputCode', email, code: '', verifying: false, error: null });
      } catch {
        setEmailState({ ...emailState, sending: false, error: t('emailErrorSendFailed') });
      }
    },
    [emailState, sendCode, t],
  );

  const handleCodeSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (emailState.kind !== 'inputCode') return;
      const code = emailState.code.trim();
      if (code.length < 4) {
        setEmailState({ ...emailState, error: t('emailErrorVerifyFailed') });
        return;
      }
      setEmailState({ ...emailState, verifying: true, error: null });
      try {
        await loginWithCode({ code });
      } catch {
        setEmailState({ ...emailState, verifying: false, error: t('emailErrorVerifyFailed') });
      }
    },
    [emailState, loginWithCode, t],
  );

  const handleCodeResend = useCallback(async () => {
    if (emailState.kind !== 'inputCode') return;
    setEmailState({ ...emailState, error: null });
    try {
      await sendCode({ email: emailState.email });
    } catch {
      setEmailState({ ...emailState, error: t('emailErrorSendFailed') });
    }
  }, [emailState, sendCode, t]);

  const handleCodeBack = useCallback(() => {
    if (emailState.kind !== 'inputCode') return;
    setEmailState({ kind: 'inputEmail', email: emailState.email, sending: false, error: null });
  }, [emailState]);

  if (authenticated) {
    return (
      <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center bg-[#050608] text-white/60">
        {t('loadingFallback')}
      </div>
    );
  }

  return (
    <div className="relative flex min-h-[calc(100vh-8rem)] items-center justify-center overflow-hidden bg-[#050608] px-4 py-12">
      <div className="pointer-events-none absolute -left-[10%] -top-[10%] size-[50%] rounded-full bg-[#00FF88]/5 blur-[150px] mix-blend-screen" />
      <div className="pointer-events-none absolute -bottom-[10%] -right-[10%] size-[40%] rounded-full bg-blue-500/5 blur-[150px] mix-blend-screen" />

      <div className="z-10 w-full max-w-[480px] animate-in fade-in zoom-in-95 duration-500">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl border border-[#00FF88]/20 bg-[#00FF88]/10 shadow-[0_0_20px_rgba(0,255,136,0.1)]">
            <ShieldCheck size={32} className="text-[#00FF88]" />
          </div>
          <h1 className="mb-2 text-3xl font-extrabold tracking-tight text-white">{t('title')}</h1>
          <p className="text-white/50">{t('subtitle')}</p>
        </div>

        <div className="space-y-4 rounded-3xl border border-white/10 bg-black/60 p-6 shadow-2xl backdrop-blur-2xl sm:p-8">
          <button
            type="button"
            onClick={handleWallet}
            className="flex w-full items-center justify-between rounded-xl bg-[#00FF88] px-6 py-4 font-extrabold text-black transition-all hover:scale-[1.02] hover:bg-[#00e67a]"
          >
            <div className="flex items-center gap-3">
              <WalletIcon size={20} /> {t('walletButton')}
            </div>
            <ArrowRight size={18} />
          </button>

          {walletError && (
            <p className="text-center text-xs text-red-400" role="alert">
              {walletError}
            </p>
          )}

          <div className="flex items-center gap-4 py-3">
            <div className="h-px flex-1 bg-white/10" />
            <div className="text-xs font-bold uppercase tracking-widest text-white/30">
              {t('divider')}
            </div>
            <div className="h-px flex-1 bg-white/10" />
          </div>

          <button
            type="button"
            onClick={() => setIamSmartOpen(true)}
            className="relative flex w-full items-center justify-center gap-3 rounded-xl border border-[#e84a5f]/50 bg-[#e84a5f] px-6 py-4 font-bold text-white shadow-[0_0_15px_rgba(232,74,95,0.2)] transition-colors hover:bg-[#d83f53]"
          >
            <Fingerprint size={20} /> {t('iamSmartButton')}
            <span className="absolute -right-2 -top-2 rounded-full bg-[#050608] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#00FF88] ring-1 ring-[#00FF88]/40">
              {t('iamSmartComingSoon')}
            </span>
          </button>

          <div className="space-y-3 pt-2">
            <button
              type="button"
              onClick={() => void handleOAuth('google')}
              disabled={oauthLoading}
              className="flex w-full items-center justify-center gap-3 rounded-xl bg-white px-6 py-4 font-bold text-black transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <GoogleIcon /> {t('googleButton')}
            </button>
            <button
              type="button"
              onClick={() => void handleOAuth('apple')}
              disabled={oauthLoading}
              className="flex w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-zinc-900 px-6 py-4 font-bold text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <AppleIcon /> {t('appleButton')}
            </button>

            {emailState.kind === 'collapsed' && (
              <button
                type="button"
                onClick={handleEmailButton}
                className="flex w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-zinc-900 px-6 py-4 font-bold text-white transition-colors hover:bg-zinc-800"
              >
                <Mail size={20} /> {t('emailButton')}
              </button>
            )}

            {emailState.kind === 'inputEmail' && (
              <form
                onSubmit={(e) => void handleEmailSubmit(e)}
                className="space-y-3 rounded-xl border border-white/10 bg-zinc-900 p-4"
              >
                <label htmlFor="auth-email" className="block text-xs font-semibold text-white/60">
                  {t('emailButton')}
                </label>
                <input
                  id="auth-email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  inputMode="email"
                  required
                  value={emailState.email}
                  onChange={(e) =>
                    setEmailState({ ...emailState, email: e.target.value, error: null })
                  }
                  placeholder={t('emailPlaceholder')}
                  className="w-full rounded-lg border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-white/30 focus:border-[#00FF88]/40 focus:outline-none focus:ring-1 focus:ring-[#00FF88]/40"
                />
                {emailState.error && (
                  <p className="text-xs text-red-400" role="alert">
                    {emailState.error}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={emailState.sending}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#00FF88] px-5 py-3 text-sm font-bold text-black transition-colors hover:bg-[#00d170] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {emailState.sending ? t('emailSending') : t('emailSendCode')}
                </button>
              </form>
            )}

            {emailState.kind === 'inputCode' && (
              <form
                onSubmit={(e) => void handleCodeSubmit(e)}
                className="space-y-3 rounded-xl border border-white/10 bg-zinc-900 p-4"
              >
                <p className="text-xs text-white/60">
                  {t('emailCodeHint', { email: emailState.email })}
                </p>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  pattern="[0-9]*"
                  maxLength={6}
                  required
                  value={emailState.code}
                  onChange={(e) =>
                    setEmailState({
                      ...emailState,
                      code: e.target.value.replace(/\D/g, ''),
                      error: null,
                    })
                  }
                  placeholder={t('emailCodePlaceholder')}
                  className="w-full rounded-lg border border-white/10 bg-black/40 px-4 py-3 text-center font-mono text-lg tracking-[0.4em] text-white placeholder:text-white/30 focus:border-[#00FF88]/40 focus:outline-none focus:ring-1 focus:ring-[#00FF88]/40"
                />
                {emailState.error && (
                  <p className="text-xs text-red-400" role="alert">
                    {emailState.error}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={emailState.verifying}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#00FF88] px-5 py-3 text-sm font-bold text-black transition-colors hover:bg-[#00d170] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {emailState.verifying ? t('emailVerifying') : t('emailVerify')}
                </button>
                <div className="flex items-center justify-between text-xs">
                  <button
                    type="button"
                    onClick={handleCodeBack}
                    className="text-white/50 transition-colors hover:text-white"
                  >
                    {t('emailBack')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCodeResend()}
                    className="text-[#00FF88] transition-colors hover:text-[#00d170]"
                  >
                    {t('emailResend')}
                  </button>
                </div>
              </form>
            )}

            {oauthError && (
              <p className="text-center text-xs text-red-400" role="alert">
                {oauthError}
              </p>
            )}
          </div>
        </div>

        <p className="mx-auto mt-8 max-w-sm text-center text-xs leading-relaxed text-white/30">
          {t('termsPrefix')}{' '}
          <a href="/terms" className="underline transition-colors hover:text-white">
            {t('termsLink')}
          </a>{' '}
          {t('termsAnd')}{' '}
          <a href="/privacy" className="underline transition-colors hover:text-white">
            {t('privacyLink')}
          </a>
          {t('termsSuffix')}
        </p>
      </div>

      {iamSmartOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-8 backdrop-blur-sm"
          onClick={() => setIamSmartOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="iam-smart-modal-title"
        >
          <div
            className="relative w-full max-w-md rounded-2xl border border-white/10 bg-zinc-900 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setIamSmartOpen(false)}
              className="absolute right-4 top-4 text-white/40 transition-colors hover:text-white"
              aria-label={t('iamSmartModalClose')}
            >
              <X size={18} />
            </button>
            <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-[#e84a5f]/10 ring-1 ring-[#e84a5f]/30">
              <Fingerprint size={22} className="text-[#e84a5f]" />
            </div>
            <h2 id="iam-smart-modal-title" className="mb-2 text-lg font-bold text-white">
              {t('iamSmartModalTitle')}
            </h2>
            <p className="mb-4 text-sm leading-relaxed text-white/60">{t('iamSmartModalBody')}</p>
            <p className="text-xs text-white/40">
              {t('iamSmartModalDocs')}{' '}
              <span className="font-mono text-white/60">{t('iamSmartModalAdrLabel')}</span>
            </p>
            <button
              type="button"
              onClick={() => setIamSmartOpen(false)}
              className="mt-6 w-full rounded-xl bg-white/10 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-white/15"
            >
              {t('iamSmartModalClose')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
