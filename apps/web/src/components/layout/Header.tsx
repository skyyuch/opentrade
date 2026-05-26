'use client';

import { usePrivy } from '@privy-io/react-auth';
import { Globe, LogOut, Menu, Settings, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Link, usePathname } from '../../i18n/navigation';

import type { ReactNode } from 'react';

const LOCALES = [
  { code: 'zh-Hant', label: '繁體中文' },
  { code: 'zh-Hans', label: '简体中文' },
  { code: 'en', label: 'English' },
] as const;

const NAV_LINKS = [
  { href: '/brokers', key: 'brokers' },
  { href: '/kols', key: 'kolDirectory' },
  { href: '/verify', key: 'verify' },
] as const;

function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export const Header = (): ReactNode => {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const { authenticated, login, logout, user } = usePrivy();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [localeOpen, setLocaleOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const localeRef = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);

  const walletAddress = user?.wallet?.address;

  const toggleMobile = useCallback(() => {
    setMobileOpen((prev) => !prev);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (localeRef.current && !localeRef.current.contains(e.target as Node)) {
        setLocaleOpen(false);
      }
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) {
        setAccountOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-50 border-b border-white/5 bg-transparent backdrop-blur-md">
      <div className="mx-auto flex h-16 items-center justify-between px-6 lg:px-10">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-[#00FF88] rotate-45">
            <div className="h-4 w-4 -rotate-45 border-2 border-[#050608]" />
          </div>
          <span className="text-2xl font-bold uppercase tracking-tight text-white">OpenTrade</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map(({ href, key }) => {
            const isActive = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                className={`text-sm font-medium transition-colors ${
                  isActive
                    ? 'border-b-2 border-[#00FF88] pb-[3px] text-[#00FF88]'
                    : 'text-white/60 hover:text-[#00FF88]'
                }`}
              >
                {t(key)}
              </Link>
            );
          })}
        </nav>

        {/* Right side: locale, KOL Portal, auth */}
        <div className="hidden items-center gap-4 md:flex">
          {/* Locale switcher */}
          <div ref={localeRef} className="relative">
            <button
              type="button"
              onClick={() => setLocaleOpen((prev) => !prev)}
              className="rounded-md p-2 text-white/40 transition-colors hover:text-white"
              aria-label="Switch language"
            >
              <Globe className="size-4" />
            </button>
            {localeOpen && (
              <div className="absolute right-0 top-full mt-1 min-w-[140px] rounded-md border border-white/10 bg-zinc-900 py-1 shadow-lg">
                {LOCALES.map(({ code, label }) => (
                  <Link
                    key={code}
                    href={pathname}
                    locale={code}
                    onClick={() => setLocaleOpen(false)}
                    className="block px-4 py-2 text-sm text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    {label}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* KOL Portal link */}
          <a
            href="/kol"
            className="hidden text-xs font-mono uppercase text-white/40 transition-colors hover:text-white rounded-full border border-white/10 px-3 py-1.5 lg:block"
          >
            {t('kolPortal')}
          </a>

          {authenticated ? (
            <div ref={accountRef} className="relative">
              <button
                type="button"
                onClick={() => setAccountOpen((prev) => !prev)}
                className="flex items-center gap-2 rounded-full border border-white/10 bg-zinc-800 px-5 py-2 text-sm font-bold text-white transition-all hover:bg-zinc-700"
              >
                <div className="h-5 w-5 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500" />
                {walletAddress ? shortenAddress(walletAddress) : t('settings')}
              </button>
              {accountOpen && (
                <div className="absolute right-0 top-full mt-2 min-w-[180px] overflow-hidden rounded-xl border border-white/10 bg-zinc-900 py-1 shadow-xl">
                  {walletAddress && (
                    <div className="border-b border-white/5 px-4 py-2.5">
                      <span className="block text-[11px] text-white/40">Wallet</span>
                      <span className="font-mono text-xs text-white/70">
                        {shortenAddress(walletAddress)}
                      </span>
                    </div>
                  )}
                  <Link
                    href="/settings"
                    onClick={() => setAccountOpen(false)}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-white/70 transition-colors hover:bg-white/5 hover:text-white"
                  >
                    <Settings size={14} className="text-white/40" />
                    {t('settings')}
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      setAccountOpen(false);
                      void logout();
                    }}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-red-400/80 transition-colors hover:bg-white/5 hover:text-red-400"
                  >
                    <LogOut size={14} />
                    {t('logout')}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void login()}
              className="rounded-full bg-[#00FF88] px-5 py-2.5 text-sm font-bold text-[#050608] transition-all hover:bg-[#00D170]"
            >
              {t('login')}
            </button>
          )}
        </div>

        {/* Mobile hamburger */}
        <button
          type="button"
          onClick={toggleMobile}
          className="inline-flex items-center justify-center rounded-md p-2 text-muted-foreground hover:text-foreground md:hidden"
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {/* Mobile menu panel */}
      {mobileOpen && (
        <div className="border-t border-white/5 px-6 py-4 md:hidden">
          <nav className="flex flex-col gap-3">
            {NAV_LINKS.map(({ href, key }) => {
              const isActive = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  className={`text-sm font-medium ${isActive ? 'text-[#00FF88]' : 'text-white/60'}`}
                >
                  {t(key)}
                </Link>
              );
            })}
            <a
              href="/kol"
              onClick={() => setMobileOpen(false)}
              className="text-sm font-medium text-white/60"
            >
              {t('kolPortal')}
            </a>
          </nav>

          {/* Mobile locale switcher */}
          <div className="mt-4 flex items-center gap-3 border-t border-white/10 pt-4">
            <Globe className="size-4 text-white/40" />
            {LOCALES.map(({ code, label }) => (
              <Link
                key={code}
                href={pathname}
                locale={code}
                onClick={() => setMobileOpen(false)}
                className="text-xs text-white/60"
              >
                {label}
              </Link>
            ))}
          </div>

          {/* Mobile auth */}
          <div className="mt-4 border-t border-white/10 pt-4">
            {authenticated ? (
              <div className="flex flex-col gap-2">
                {walletAddress && (
                  <span className="text-xs font-mono text-white/40">
                    {shortenAddress(walletAddress)}
                  </span>
                )}
                <Link
                  href="/settings"
                  onClick={() => setMobileOpen(false)}
                  className="text-sm text-white/60"
                >
                  {t('settings')}
                </Link>
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="text-left text-sm text-white/60"
                >
                  {t('logout')}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void login()}
                className="w-full rounded-full bg-[#00FF88] px-5 py-2.5 text-sm font-bold text-[#050608]"
              >
                {t('login')}
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
