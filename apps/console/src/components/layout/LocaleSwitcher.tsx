'use client';

import { Globe } from 'lucide-react';
import { useLocale } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { usePathname, useRouter } from '../../i18n/navigation';

import type { AppLocale } from '../../i18n/routing';

const LOCALE_LABELS: Record<AppLocale, string> = {
  'zh-Hant': '繁體中文',
  'zh-Hans': '简体中文',
  en: 'English',
};

export function LocaleSwitcher(): React.ReactNode {
  const locale = useLocale() as AppLocale;
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSwitch = (newLocale: AppLocale) => {
    router.replace(pathname, { locale: newLocale });
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg px-3 py-2 text-white/60 transition-colors hover:bg-white/5 hover:text-white"
        aria-label="Switch language"
      >
        <Globe size={18} />
        <span className="text-xs font-medium">{LOCALE_LABELS[locale]}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-[140px] overflow-hidden rounded-xl border border-white/10 bg-[#0a0c10] shadow-xl">
          {(Object.entries(LOCALE_LABELS) as [AppLocale, string][]).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => handleSwitch(key)}
              className={`flex w-full items-center px-4 py-2.5 text-sm transition-colors ${
                key === locale
                  ? 'bg-[#00FF88]/10 text-[#00FF88] font-bold'
                  : 'text-white/70 hover:bg-white/5 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
