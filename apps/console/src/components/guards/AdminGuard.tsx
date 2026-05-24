/**
 * Route guard for admin-only pages.
 *
 * Client component that checks role and redirects non-admins.
 * Uses next-intl's useRouter so locale prefix follows the
 * `as-needed` policy from routing config.
 */

'use client';

import { useTranslations } from 'next-intl';
import { useEffect } from 'react';

import { useCurrentUser } from '../../hooks/useCurrentUser';
import { useRouter } from '../../i18n/navigation';

import type { ReactNode } from 'react';

type Props = { children: ReactNode; locale: string };

export function AdminGuard({ children }: Props): ReactNode {
  const { isAdmin, isLoading, user } = useCurrentUser();
  const router = useRouter();
  const t = useTranslations();

  useEffect(() => {
    if (!isLoading && (!user || !isAdmin)) {
      router.replace('/');
    }
  }, [isLoading, user, isAdmin, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="size-6 animate-spin rounded-full border-2 border-white/20 border-t-[#00FF88]" />
      </div>
    );
  }

  if (!user || !isAdmin) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-sm text-white/50">{t('auth.loginSubtitle')}</p>
      </div>
    );
  }

  return <>{children}</>;
}
