/**
 * Auth gate for the merchant console — role-based layout.
 *
 * After authentication, determines what sidebar nav to show based on
 * the user's role (admin vs broker owner vs regular user).
 */

'use client';

import { usePrivy } from '@privy-io/react-auth';
import {
  Activity,
  Building2,
  CheckCircle,
  FileText,
  LayoutDashboard,
  LogOut,
  Settings,
  Shield,
  ShieldCheck,
  Star,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { useCurrentUser } from '../../hooks/useCurrentUser';

import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
  locale: string;
};

type NavItem = {
  href: string;
  icon: typeof LayoutDashboard;
  labelKey: string;
};

export const AuthGate = ({ children, locale }: Props): ReactNode => {
  const { ready, authenticated, login, logout, user: privyUser } = usePrivy();
  const { user, isAdmin, isBrokerOwner, claimedBroker, isLoading } = useCurrentUser();
  const t = useTranslations();
  const pathname = usePathname();

  if (!ready || (authenticated && isLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
      </div>
    );
  }

  if (!authenticated) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-4">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-muted">
            <ShieldCheck className="size-8 text-muted-foreground" aria-hidden />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('auth.loginTitle')}</h1>
          <p className="max-w-md text-sm text-muted-foreground">{t('auth.loginSubtitle')}</p>
        </div>
        <button
          type="button"
          onClick={() => void login()}
          className="rounded-lg bg-foreground px-6 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          {t('auth.loginButton')}
        </button>
      </main>
    );
  }

  const adminNav: NavItem[] = [
    { href: `/${locale}/admin`, icon: LayoutDashboard, labelKey: 'nav.adminDashboard' },
    { href: `/${locale}/admin/claims`, icon: CheckCircle, labelKey: 'nav.claims' },
    { href: `/${locale}/admin/verifications`, icon: Shield, labelKey: 'nav.verifications' },
    { href: `/${locale}/admin/users`, icon: Users, labelKey: 'nav.users' },
    { href: `/${locale}/admin/reviews`, icon: Star, labelKey: 'nav.reviews' },
    { href: `/${locale}/admin/brokers`, icon: Building2, labelKey: 'nav.brokers' },
    { href: `/${locale}/admin/system`, icon: Activity, labelKey: 'nav.system' },
  ];

  const brokerNav: NavItem[] = [
    { href: `/${locale}/broker`, icon: LayoutDashboard, labelKey: 'nav.brokerDashboard' },
    { href: `/${locale}/broker/profile`, icon: FileText, labelKey: 'nav.profile' },
    { href: `/${locale}/broker/reviews`, icon: Star, labelKey: 'nav.brokerReviews' },
  ];

  const defaultNav: NavItem[] = [
    { href: `/${locale}`, icon: LayoutDashboard, labelKey: 'nav.dashboard' },
    { href: `/${locale}/brokers`, icon: Building2, labelKey: 'nav.brokers' },
  ];

  let navItems: NavItem[];
  if (isAdmin) {
    navItems = adminNav;
  } else if (isBrokerOwner) {
    navItems = brokerNav;
  } else {
    navItems = defaultNav;
  }

  const displayEmail = privyUser?.email?.address
    ? `${privyUser.email.address.slice(0, 3)}***`
    : undefined;
  const displayRole = user?.role ?? '';

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 flex-col border-r border-border bg-card">
        <div className="border-b border-border px-4 py-4">
          <p className="text-sm font-semibold tracking-tight">OpenTrade</p>
          <p className="text-xs text-muted-foreground">Console</p>
        </div>

        <nav className="flex flex-1 flex-col gap-1 p-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? 'bg-muted font-medium text-foreground'
                    : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                }`}
              >
                <item.icon className="size-4" aria-hidden />
                {t(item.labelKey)}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border p-3">
          <div className="mb-2 flex items-center justify-between">
            {displayEmail ? (
              <p className="truncate text-xs text-muted-foreground">{displayEmail}</p>
            ) : null}
            {displayRole ? (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {displayRole}
              </span>
            ) : null}
          </div>
          {claimedBroker ? (
            <p className="mb-2 truncate text-xs text-muted-foreground">
              {claimedBroker.displayName}
            </p>
          ) : null}
          <div className="flex gap-1">
            <Link
              href={`/${locale}/settings`}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Settings className="size-3.5" aria-hidden />
              {t('nav.settings')}
            </Link>
            <button
              type="button"
              onClick={() => void logout()}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <LogOut className="size-3.5" aria-hidden />
              {t('nav.logout')}
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
};
