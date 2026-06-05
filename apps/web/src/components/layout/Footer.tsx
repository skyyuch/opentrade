import { useTranslations } from 'next-intl';

import { Link } from '../../i18n/navigation';

import type { ReactNode } from 'react';

export const Footer = (): ReactNode => {
  const t = useTranslations('footer');

  return (
    <footer className="border-t border-border bg-background">
      <div className="container mx-auto px-4 py-10">
        {/* Multi-column grid */}
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {/* Column 1: Brand */}
          <div className="flex flex-col gap-3">
            <span className="text-lg font-bold tracking-tight text-foreground">OpenTrade</span>
            <p className="text-sm leading-relaxed text-muted-foreground">{t('mission')}</p>
          </div>

          {/* Column 2: Platform */}
          <div className="flex flex-col gap-3">
            <h4 className="text-sm font-semibold text-foreground">{t('platform')}</h4>
            <nav className="flex flex-col gap-2">
              <Link href="/brokers" className="text-sm text-muted-foreground hover:text-foreground">
                {t('brokers')}
              </Link>
              <Link href="/verify" className="text-sm text-muted-foreground hover:text-foreground">
                {t('verify')}
              </Link>
              <Link
                href="/settings"
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                {t('settings')}
              </Link>
            </nav>
          </div>

          {/* Column 3: Company */}
          <div className="flex flex-col gap-3">
            <h4 className="text-sm font-semibold text-foreground">{t('company')}</h4>
            <nav className="flex flex-col gap-2">
              <Link href="/status" className="text-sm text-muted-foreground hover:text-foreground">
                {t('systemStatus')}
              </Link>
              <Link
                href="/transparency/moderation"
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                {t('moderationAudit')}
              </Link>
            </nav>
          </div>

          {/* Column 4: Legal */}
          <div className="flex flex-col gap-3">
            <h4 className="text-sm font-semibold text-foreground">{t('legal')}</h4>
            <nav className="flex flex-col gap-2">
              <span className="text-sm text-muted-foreground">{t('disclaimer')}</span>
              <span className="text-sm text-muted-foreground">{t('privacy')}</span>
              <span className="text-sm text-muted-foreground">{t('terms')}</span>
            </nav>
          </div>
        </div>

        {/* Bottom section */}
        <div className="mt-10 border-t border-border pt-6">
          <p className="text-xs text-muted-foreground">{t('copyright')}</p>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground/70">
            {t('regulatoryNotice')}
          </p>
        </div>
      </div>
    </footer>
  );
};
