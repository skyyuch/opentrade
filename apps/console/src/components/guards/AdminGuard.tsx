/**
 * Route guard for admin-only pages.
 *
 * Client component that checks role and redirects non-admins.
 */

'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { useCurrentUser } from '../../hooks/useCurrentUser';

import type { ReactNode } from 'react';

type Props = { children: ReactNode; locale: string };

export function AdminGuard({ children, locale }: Props): ReactNode {
  const { isAdmin, isLoading, user } = useCurrentUser();
  const router = useRouter();
  const t = useTranslations();

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
      </div>
    );
  }

  if (!user || !isAdmin) {
    router.replace(`/${locale}`);
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-sm text-muted-foreground">{t('auth.loginSubtitle')}</p>
      </div>
    );
  }

  return <>{children}</>;
}
