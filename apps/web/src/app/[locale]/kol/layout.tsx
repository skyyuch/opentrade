'use client';

import { usePrivy } from '@privy-io/react-auth';
import { LayoutDashboard, Loader2, LogIn, Plus, Radio, ShieldAlert, UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { useLoginRedirect } from '../../../hooks/useLoginRedirect';
import { useOpenTradeAuth } from '../../../hooks/useOpenTradeAuth';
import { Link, usePathname } from '../../../i18n/navigation';
import { fetchMyKolProfile } from '../../../lib/api/client';

import type { KolListItem } from '../../../lib/api/client';
import type { ReactNode } from 'react';

type NavItem = {
  href: string;
  labelKey: string;
  icon: typeof LayoutDashboard;
};

const NAV_ITEMS: NavItem[] = [
  { href: '/kol/dashboard', labelKey: 'navDashboard', icon: LayoutDashboard },
  { href: '/kol/signals', labelKey: 'navSignals', icon: Radio },
];

export default function KolConsoleLayout({ children }: { children: ReactNode }) {
  const t = useTranslations('kolConsole');
  const pathname = usePathname();
  const { authenticated } = usePrivy();
  const goLogin = useLoginRedirect();
  const { getAccessToken } = useOpenTradeAuth();

  const [kol, setKol] = useState<KolListItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);

  const isOnboardingPage = pathname.startsWith('/kol/onboarding');

  useEffect(() => {
    if (!authenticated) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      const token = await getAccessToken();
      if (!token) {
        setLoading(false);
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- async race
      if (cancelled) return;
      try {
        const res = await fetchMyKolProfile({ accessToken: token });
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- async race
        if (cancelled) return;
        if (res.kol.status === 'APPROVED') {
          setKol(res.kol);
        } else {
          setDenied(true);
        }
      } catch {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- async race
        if (!cancelled) setDenied(true);
      } finally {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- async race
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authenticated, getAccessToken]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-white/40" />
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
        <LogIn className="h-12 w-12 text-white/30" />
        <h2 className="text-xl font-bold text-white">{t('loginRequired')}</h2>
        <p className="max-w-md text-sm text-white/50">{t('loginRequiredDesc')}</p>
        <button
          onClick={goLogin}
          className="mt-2 rounded-xl bg-[#00FF88] px-6 py-3 font-bold text-black transition-all hover:bg-[#00e67a] hover:shadow-[0_0_20px_rgba(0,255,136,0.3)]"
        >
          {t('loginButton')}
        </button>
      </div>
    );
  }

  if (isOnboardingPage) {
    return (
      <div className="-mt-16 relative min-h-screen pt-16">
        <div className="pointer-events-none fixed right-[-5%] top-[-10%] z-0 h-[700px] w-[700px] rounded-full bg-[#00FF88]/10 blur-[150px]" />
        <div className="pointer-events-none fixed bottom-[-10%] left-[-5%] z-0 h-[600px] w-[600px] rounded-full bg-purple-600/10 blur-[120px]" />
        <div className="relative z-10">
          <main className="mx-auto max-w-4xl p-6 lg:p-10">{children}</main>
        </div>
      </div>
    );
  }

  if (denied) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
        <ShieldAlert className="h-12 w-12 text-orange-400" />
        <h2 className="text-xl font-bold text-white">{t('accessDenied')}</h2>
        <p className="max-w-md text-sm text-white/50">{t('accessDeniedDesc')}</p>
        <div className="mt-2 flex gap-3">
          <Link
            href="/kol/onboarding"
            className="flex items-center gap-2 rounded-xl bg-[#00FF88] px-6 py-3 font-bold text-black transition-all hover:bg-[#00e67a] hover:shadow-[0_0_20px_rgba(0,255,136,0.3)]"
          >
            <UserPlus size={18} />
            {t('applyNow')}
          </Link>
          <Link
            href="/kols"
            className="rounded-xl border border-white/20 px-6 py-3 text-sm font-medium text-white/80 transition-colors hover:bg-white/5"
          >
            {t('backToDirectory')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="-mt-16 relative min-h-screen pt-16">
      <div className="pointer-events-none fixed right-[-5%] top-[-10%] z-0 h-[700px] w-[700px] rounded-full bg-[#00FF88]/10 blur-[150px]" />
      <div className="pointer-events-none fixed bottom-[-10%] left-[-5%] z-0 h-[600px] w-[600px] rounded-full bg-purple-600/10 blur-[120px]" />

      <div className="relative z-10 flex">
        {/* Sidebar */}
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-64 shrink-0 border-r border-white/10 bg-black/40 backdrop-blur-sm lg:block">
          <div className="flex flex-col gap-1 p-4">
            <div className="mb-6 border-b border-white/10 pb-4">
              <p className="text-xs font-bold uppercase tracking-wider text-white/40">
                {t('consoleTitle')}
              </p>
              {kol && (
                <p className="mt-1 truncate text-sm font-medium text-white">{kol.displayName}</p>
              )}
            </div>

            {NAV_ITEMS.map((item) => {
              const active =
                item.href === '/kol/signals'
                  ? pathname === '/kol/signals'
                  : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    active
                      ? 'bg-[#00FF88]/10 text-[#00FF88]'
                      : 'text-white/60 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <Icon size={18} />
                  {t(item.labelKey)}
                </Link>
              );
            })}

            <Link
              href="/kol/signals/new"
              className={`mt-2 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                pathname === '/kol/signals/new'
                  ? 'bg-[#00FF88]/10 text-[#00FF88]'
                  : 'text-white/60 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Plus size={18} />
              {t('newSignal')}
            </Link>
          </div>
        </aside>

        {/* Mobile nav */}
        <div className="sticky top-16 z-20 flex w-full gap-1 border-b border-white/10 bg-black/60 p-2 backdrop-blur-sm lg:hidden">
          {NAV_ITEMS.map((item) => {
            const active =
              item.href === '/kol/signals'
                ? pathname === '/kol/signals'
                : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                  active ? 'bg-[#00FF88]/10 text-[#00FF88]' : 'text-white/60 hover:bg-white/5'
                }`}
              >
                <Icon size={14} />
                {t(item.labelKey)}
              </Link>
            );
          })}
          <Link
            href="/kol/signals/new"
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
              pathname === '/kol/signals/new'
                ? 'bg-[#00FF88]/10 text-[#00FF88]'
                : 'text-white/60 hover:bg-white/5'
            }`}
          >
            <Plus size={14} />
            {t('newSignal')}
          </Link>
        </div>

        {/* Main content */}
        <main className="min-w-0 flex-1 p-6 lg:p-10">{children}</main>
      </div>
    </div>
  );
}
