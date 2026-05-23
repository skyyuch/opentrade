/**
 * Route guard for broker-owner-only pages.
 *
 * Client component that checks if the user has a claimed broker.
 */

'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { useCurrentUser } from '../../hooks/useCurrentUser';

import type { ReactNode } from 'react';

type Props = { children: ReactNode; locale: string };

export function BrokerGuard({ children, locale }: Props): ReactNode {
  const { isBrokerOwner, isLoading, user } = useCurrentUser();
  const router = useRouter();
  const t = useTranslations();

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
      </div>
    );
  }

  if (!user || !isBrokerOwner) {
    router.replace(`/${locale}`);
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-sm text-muted-foreground">{t('auth.loginSubtitle')}</p>
      </div>
    );
  }

  return <>{children}</>;
}
