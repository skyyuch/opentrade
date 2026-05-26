/**
 * Auth gate for the merchant console — role-based layout.
 *
 * Supports two auth paths (per ADR-0024):
 *   1. Username/password login (primary for admin) — NO Privy dependency
 *   2. Privy social/wallet login (for broker owners) — isolated component
 *
 * This component does NOT call usePrivy() directly. All Privy hooks are
 * isolated in PrivyLoginButton, wrapped in PrivyErrorBoundary, so that
 * credential login always works even when Privy is unavailable.
 */

'use client';

import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  Building2,
  Eye,
  EyeOff,
  Fingerprint,
  LayoutGrid,
  LogOut,
  MessageSquareText,
  Settings,
  ShieldAlert,
  Shield,
  Star,
  Store,
  Users,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';

import { localizedBrokerName } from '@opentrade/shared';

import { useCurrentUser } from '../../hooks/useCurrentUser';
import { useOpenTradeAuth } from '../../hooks/useOpenTradeAuth';
import { Link, usePathname } from '../../i18n/navigation';
import { loginWithCredentials } from '../../lib/api/client';
import { PrivyLoginButton } from '../auth/PrivyLoginButton';
import { PrivyErrorBoundary } from '../providers/PrivyErrorBoundary';

import { LocaleSwitcher } from './LocaleSwitcher';

import type { FormEvent, ReactNode } from 'react';

type Props = {
  children: ReactNode;
};

type NavItem = {
  href: string;
  path: string;
  icon: typeof LayoutGrid;
  label: string;
  end?: boolean;
};

export const AuthGate = ({ children }: Props): ReactNode => {
  const { isAuthenticated, setToken, clearToken, hydrated } = useOpenTradeAuth();
  const { user, isAdmin, isBrokerOwner, claimedBroker, isLoading } = useCurrentUser();
  const t = useTranslations();
  const locale = useLocale();
  const localePath = usePathname();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCredentialLogin = async (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;

    setIsSubmitting(true);
    setLoginError('');

    try {
      const res = await loginWithCredentials(username.trim(), password);
      setToken(res.accessToken, res.userId, res.expiresIn, 'manual');
    } catch {
      setLoginError(t('auth.loginFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!hydrated || (isAuthenticated && isLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#050608]">
        <div className="size-6 animate-spin rounded-full border-2 border-white/20 border-t-[#00FF88]" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center bg-[#050608] px-4 text-white overflow-hidden">
        <div className="fixed right-[-5%] top-[-10%] h-[600px] w-[600px] rounded-full bg-[#00FF88]/10 blur-[120px] pointer-events-none" />
        <div className="fixed bottom-[-10%] left-[-5%] h-[500px] w-[500px] rounded-full bg-blue-600/10 blur-[100px] pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center gap-6 text-center w-full max-w-sm">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5 border border-white/10">
            <Shield className="size-8 text-[#00FF88]" aria-hidden />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{t('auth.loginTitle')}</h1>
          <p className="max-w-md text-sm text-white/50">{t('auth.loginSubtitle')}</p>

          {/* Credential login form — no Privy dependency */}
          <form
            onSubmit={(e) => void handleCredentialLogin(e)}
            className="flex w-full flex-col gap-3"
          >
            <div>
              <label htmlFor="username" className="mb-1 block text-left text-xs text-white/50">
                {t('auth.username')}
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t('auth.usernamePlaceholder')}
                autoComplete="username"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-white/30 outline-none transition-colors focus:border-[#00FF88]/50 focus:ring-1 focus:ring-[#00FF88]/30"
              />
            </div>
            <div>
              <label htmlFor="password" className="mb-1 block text-left text-xs text-white/50">
                {t('auth.password')}
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('auth.passwordPlaceholder')}
                  autoComplete="current-password"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 pr-10 text-sm text-white placeholder-white/30 outline-none transition-colors focus:border-[#00FF88]/50 focus:ring-1 focus:ring-[#00FF88]/30"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {loginError ? <p className="text-xs text-red-400">{loginError}</p> : null}

            <button
              type="submit"
              disabled={isSubmitting || !username.trim() || !password.trim()}
              className="rounded-lg bg-[#00FF88] px-6 py-2.5 text-sm font-bold text-[#050608] transition-all hover:bg-[#00FF88]/90 hover:shadow-lg hover:shadow-[#00FF88]/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="size-4 animate-spin rounded-full border-2 border-[#050608]/20 border-t-[#050608]" />
                </span>
              ) : (
                t('auth.loginWithCredentials')
              )}
            </button>
          </form>

          {/* Privy login — isolated with error boundary */}
          <PrivyErrorBoundary fallback={null}>
            <PrivyLoginButton />
          </PrivyErrorBoundary>
        </div>
      </div>
    );
  }

  const hasConsoleAccess = isAdmin || isBrokerOwner;

  if (!hasConsoleAccess) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center bg-[#050608] px-4 text-white overflow-hidden">
        <div className="fixed right-[-5%] top-[-10%] h-[600px] w-[600px] rounded-full bg-red-500/5 blur-[120px] pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center gap-6 text-center w-full max-w-md">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/10 border border-red-500/20">
            <ShieldAlert className="size-8 text-red-400" aria-hidden />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{t('auth.unauthorizedTitle')}</h1>
          <p className="text-sm text-white/50 leading-relaxed">{t('auth.unauthorizedMessage')}</p>
          <button
            type="button"
            onClick={clearToken}
            className="rounded-lg border border-white/10 bg-white/5 px-6 py-2.5 text-sm font-medium text-white transition-all hover:bg-white/10"
          >
            {t('auth.backToLogout')}
          </button>
        </div>
      </div>
    );
  }

  const adminNav: NavItem[] = [
    {
      href: '/admin',
      path: '/admin',
      icon: LayoutGrid,
      label: t('nav.adminDashboard'),
      end: true,
    },
    {
      href: '/admin/claims',
      path: '/admin/claims',
      icon: BadgeCheck,
      label: t('nav.claims'),
    },
    {
      href: '/admin/verifications',
      path: '/admin/verifications',
      icon: Fingerprint,
      label: t('nav.verifications'),
    },
    { href: '/admin/users', path: '/admin/users', icon: Users, label: t('nav.users') },
    {
      href: '/admin/reviews',
      path: '/admin/reviews',
      icon: Star,
      label: t('nav.reviews'),
    },
    {
      href: '/admin/complaints',
      path: '/admin/complaints',
      icon: AlertTriangle,
      label: t('nav.complaints'),
    },
    {
      href: '/admin/brokers',
      path: '/admin/brokers',
      icon: Building2,
      label: t('nav.brokers'),
    },
    {
      href: '/admin/system',
      path: '/admin/system',
      icon: Activity,
      label: t('nav.system'),
    },
  ];

  const brokerNav: NavItem[] = [
    {
      href: '/broker',
      path: '/broker',
      icon: LayoutGrid,
      label: t('nav.brokerDashboard'),
      end: true,
    },
    {
      href: '/broker/profile',
      path: '/broker/profile',
      icon: Store,
      label: t('nav.profile'),
    },
    {
      href: '/broker/reviews',
      path: '/broker/reviews',
      icon: MessageSquareText,
      label: t('nav.brokerReviews'),
    },
  ];

  let navItems: NavItem[];
  let accentColor: string;
  let roleBadge: { text: string; color: string };

  if (isAdmin) {
    navItems = adminNav;
    accentColor = '#00FF88';
    roleBadge = { text: 'ADMIN', color: 'bg-[#00FF88]/20 text-[#00FF88]' };
  } else {
    navItems = brokerNav;
    accentColor = '#3b82f6';
    roleBadge = { text: 'BROKER', color: 'bg-blue-500/20 text-blue-400' };
  }

  const displayName = user?.displayName ?? user?.walletAddress?.slice(0, 8) ?? '';

  return (
    <div className="flex h-screen w-full bg-[#050608] text-white">
      {/* Sidebar */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-white/5 bg-black/40 z-10">
        <div className="flex items-center gap-3 border-b border-white/5 p-6">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-[#00FF88] font-black text-xl text-[#050608]">
            O
          </div>
          <span className="font-bold tracking-widest text-lg">OpenTrade</span>
          <span className={`ml-auto rounded px-2 py-0.5 text-[10px] font-bold ${roleBadge.color}`}>
            {roleBadge.text}
          </span>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-6">
          {navItems.map((item) => {
            const isActive = item.end
              ? localePath === item.path
              : localePath === item.path || localePath.startsWith(`${item.path}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-4 py-3 transition-colors ${
                  isActive ? 'font-medium' : 'text-white/60 hover:bg-white/5 hover:text-white'
                }`}
                style={
                  isActive ? { backgroundColor: `${accentColor}1A`, color: accentColor } : undefined
                }
              >
                <item.icon size={18} aria-hidden />
                <span className="text-sm">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="space-y-2 border-t border-white/5 p-4">
          {claimedBroker ? (
            <div className="mb-2 px-4">
              {/* Per cursor rule 51: localised broker name. */}
              <p className="truncate text-xs text-white/40">
                {localizedBrokerName(claimedBroker, locale)}
              </p>
            </div>
          ) : null}
          <Link
            href="/settings"
            className="flex items-center gap-3 rounded-lg px-4 py-3 text-white/50 transition-colors hover:bg-white/5 hover:text-white"
          >
            <Settings size={20} aria-hidden />
            <span className="text-sm font-medium">{t('nav.settings')}</span>
          </Link>
          <button
            type="button"
            onClick={clearToken}
            className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-white/50 transition-colors hover:bg-white/5 hover:text-white"
          >
            <LogOut size={20} aria-hidden />
            <span className="text-sm font-medium">{t('nav.logout')}</span>
          </button>
          {displayName ? (
            <div className="px-4 pt-2">
              <p className="truncate text-xs text-white/30">{displayName}</p>
            </div>
          ) : null}
        </div>
      </aside>

      {/* Main Content */}
      <main className="relative flex-1 overflow-y-auto z-0">
        <div className="fixed right-[-5%] top-[-10%] h-[600px] w-[600px] rounded-full bg-[#00FF88]/5 blur-[120px] pointer-events-none z-0" />
        <div className="relative z-10">
          <div className="flex justify-end px-8 pt-4">
            <LocaleSwitcher />
          </div>
          <div className="px-8 pb-8">{children}</div>
        </div>
      </main>
    </div>
  );
};
