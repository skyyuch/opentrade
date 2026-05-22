'use client';

import { usePrivy } from '@privy-io/react-auth';
import { Globe, Menu, X } from 'lucide-react';
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
  const localeRef = useRef<HTMLDivElement>(null);

  const walletAddress = user?.wallet?.address;

  const toggleMobile = useCallback(() => {
    setMobileOpen((prev) => !prev);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (localeRef.current && !localeRef.current.contains(e.target as Node)) {
        setLocaleOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-50 border-b border-white/5 bg-transparent backdrop-blur-md">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        {/* Logo */}
        <Link href="/" className="text-lg font-bold tracking-tight text-foreground">
          OpenTrade
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map(({ href, key }) => {
            const isActive = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                className={`relative px-4 py-2 text-sm font-medium transition-colors ${
                  isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t(key)}
                {isActive && (
                  <span className="absolute bottom-0 left-4 right-4 h-0.5 rounded-full bg-amber-400" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Right side: locale switcher + auth */}
        <div className="hidden items-center gap-4 md:flex">
          {/* Locale switcher (globe icon + dropdown) */}
          <div ref={localeRef} className="relative">
            <button
              type="button"
              onClick={() => setLocaleOpen((prev) => !prev)}
              className="rounded-md p-2 text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Switch language"
            >
              <Globe className="size-4" />
            </button>
            {localeOpen && (
              <div className="absolute right-0 top-full mt-1 min-w-[140px] rounded-md border border-border bg-background py-1 shadow-lg">
                {LOCALES.map(({ code, label }) => (
                  <Link
                    key={code}
                    href={pathname}
                    locale={code}
                    onClick={() => setLocaleOpen(false)}
                    className="block px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {label}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {authenticated ? (
            <div className="flex items-center gap-3">
              {walletAddress && (
                <span className="rounded-md bg-muted px-2.5 py-1 text-xs font-mono text-muted-foreground">
                  {shortenAddress(walletAddress)}
                </span>
              )}
              <Link
                href="/settings"
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {t('settings')}
              </Link>
              <button
                type="button"
                onClick={() => void logout()}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {t('logout')}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void login()}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
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
        <div className="border-t border-border px-4 py-4 md:hidden">
          <nav className="flex flex-col gap-3">
            {NAV_LINKS.map(({ href, key }) => {
              const isActive = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  className={`text-sm font-medium ${
                    isActive ? 'text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  {t(key)}
                </Link>
              );
            })}
          </nav>
          {/* Mobile locale switcher */}
          <div className="mt-4 flex items-center gap-3 border-t border-border pt-4">
            <Globe className="size-4 text-muted-foreground" />
            {LOCALES.map(({ code, label }) => (
              <Link
                key={code}
                href={pathname}
                locale={code}
                onClick={() => setMobileOpen(false)}
                className="text-xs text-muted-foreground"
              >
                {label}
              </Link>
            ))}
          </div>

          {/* Mobile auth */}
          <div className="mt-4 border-t border-border pt-4">
            {authenticated ? (
              <div className="flex flex-col gap-2">
                {walletAddress && (
                  <span className="text-xs font-mono text-muted-foreground">
                    {shortenAddress(walletAddress)}
                  </span>
                )}
                <Link
                  href="/settings"
                  onClick={() => setMobileOpen(false)}
                  className="text-sm text-muted-foreground"
                >
                  {t('settings')}
                </Link>
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="text-left text-sm text-muted-foreground"
                >
                  {t('logout')}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void login()}
                className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white"
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
