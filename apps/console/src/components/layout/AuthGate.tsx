/**
 * Auth gate for the merchant console — role-based layout.
 *
 * After authentication, determines what sidebar nav to show based on
 * the user's role (admin vs broker owner vs regular user).
 * UI design by Google — dark theme with atmospheric glows.
 */

'use client';

import { usePrivy } from '@privy-io/react-auth';
import {
  Activity,
  BadgeCheck,
  Building2,
  Fingerprint,
  LayoutGrid,
  LogOut,
  MessageSquareText,
  Settings,
  Shield,
  Star,
  Store,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { usePathname } from '../../i18n/navigation';

import { useCurrentUser } from '../../hooks/useCurrentUser';

import { LocaleSwitcher } from './LocaleSwitcher';

import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
  locale: string;
};

type NavItem = {
  href: string;
  path: string;
  icon: typeof LayoutGrid;
  label: string;
  end?: boolean;
};

export const AuthGate = ({ children, locale }: Props): ReactNode => {
  const { ready, authenticated, login, logout } = usePrivy();
  const { user, isAdmin, isBrokerOwner, claimedBroker, isLoading } = useCurrentUser();
  const t = useTranslations();
  const localePath = usePathname();

  if (!ready || (authenticated && isLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#050608]">
        <div className="size-6 animate-spin rounded-full border-2 border-white/20 border-t-[#00FF88]" />
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center bg-[#050608] px-4 text-white overflow-hidden">
        <div className="fixed right-[-5%] top-[-10%] h-[600px] w-[600px] rounded-full bg-[#00FF88]/10 blur-[120px] pointer-events-none" />
        <div className="fixed bottom-[-10%] left-[-5%] h-[500px] w-[500px] rounded-full bg-blue-600/10 blur-[100px] pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center gap-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5 border border-white/10">
            <Shield className="size-8 text-[#00FF88]" aria-hidden />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{t('auth.loginTitle')}</h1>
          <p className="max-w-md text-sm text-white/50">{t('auth.loginSubtitle')}</p>
          <button
            type="button"
            onClick={() => void login()}
            className="rounded-lg bg-[#00FF88] px-6 py-2.5 text-sm font-bold text-[#050608] transition-all hover:bg-[#00FF88]/90 hover:shadow-lg hover:shadow-[#00FF88]/20"
          >
            {t('auth.loginButton')}
          </button>
        </div>
      </div>
    );
  }

  const adminNav: NavItem[] = [
    {
      href: `/${locale}/admin`,
      path: '/admin',
      icon: LayoutGrid,
      label: t('nav.adminDashboard'),
      end: true,
    },
    {
      href: `/${locale}/admin/claims`,
      path: '/admin/claims',
      icon: BadgeCheck,
      label: t('nav.claims'),
    },
    {
      href: `/${locale}/admin/verifications`,
      path: '/admin/verifications',
      icon: Fingerprint,
      label: t('nav.verifications'),
    },
    { href: `/${locale}/admin/users`, path: '/admin/users', icon: Users, label: t('nav.users') },
    {
      href: `/${locale}/admin/reviews`,
      path: '/admin/reviews',
      icon: Star,
      label: t('nav.reviews'),
    },
    {
      href: `/${locale}/admin/brokers`,
      path: '/admin/brokers',
      icon: Building2,
      label: t('nav.brokers'),
    },
    {
      href: `/${locale}/admin/system`,
      path: '/admin/system',
      icon: Activity,
      label: t('nav.system'),
    },
  ];

  const brokerNav: NavItem[] = [
    {
      href: `/${locale}/broker`,
      path: '/broker',
      icon: LayoutGrid,
      label: t('nav.brokerDashboard'),
      end: true,
    },
    {
      href: `/${locale}/broker/profile`,
      path: '/broker/profile',
      icon: Store,
      label: t('nav.profile'),
    },
    {
      href: `/${locale}/broker/reviews`,
      path: '/broker/reviews',
      icon: MessageSquareText,
      label: t('nav.brokerReviews'),
    },
  ];

  const defaultNav: NavItem[] = [
    { href: `/${locale}`, path: '/', icon: LayoutGrid, label: t('nav.dashboard'), end: true },
    { href: `/${locale}/brokers`, path: '/brokers', icon: Building2, label: t('nav.brokers') },
  ];

  let navItems: NavItem[];
  let accentColor: string;
  let roleBadge: { text: string; color: string };

  if (isAdmin) {
    navItems = adminNav;
    accentColor = '#00FF88';
    roleBadge = { text: 'ADMIN', color: 'bg-[#00FF88]/20 text-[#00FF88]' };
  } else if (isBrokerOwner) {
    navItems = brokerNav;
    accentColor = '#3b82f6';
    roleBadge = { text: 'BROKER', color: 'bg-blue-500/20 text-blue-400' };
  } else {
    navItems = defaultNav;
    accentColor = '#00FF88';
    roleBadge = { text: 'USER', color: 'bg-white/10 text-white/70' };
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
              <p className="truncate text-xs text-white/40">{claimedBroker.displayName}</p>
            </div>
          ) : null}
          <Link
            href={`/${locale}/settings`}
            className="flex items-center gap-3 rounded-lg px-4 py-3 text-white/50 transition-colors hover:bg-white/5 hover:text-white"
          >
            <Settings size={20} aria-hidden />
            <span className="text-sm font-medium">{t('nav.settings')}</span>
          </Link>
          <button
            type="button"
            onClick={() => void logout()}
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
