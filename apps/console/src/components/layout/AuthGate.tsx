/**
 * Auth gate for the merchant console.
 *
 * Wraps all console content — unauthenticated visitors see a login CTA
 * instead. Once logged in, the sidebar nav + content layout renders.
 */

'use client';

import { usePrivy } from '@privy-io/react-auth';
import { Building2, LayoutDashboard, LogOut, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
  locale: string;
};

export const AuthGate = ({ children, locale }: Props): ReactNode => {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const t = useTranslations();
  const pathname = usePathname();

  if (!ready) {
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

  const navItems = [
    { href: `/${locale}`, icon: LayoutDashboard, label: t('nav.dashboard') },
    { href: `/${locale}/brokers`, icon: Building2, label: t('nav.brokers') },
  ];

  const displayEmail = user?.email?.address ? `${user.email.address.slice(0, 3)}***` : undefined;

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
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border p-3">
          {displayEmail ? (
            <p className="mb-2 truncate text-xs text-muted-foreground">{displayEmail}</p>
          ) : null}
          <button
            type="button"
            onClick={() => void logout()}
            className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <LogOut className="size-3.5" aria-hidden />
            {t('nav.logout')}
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
};
