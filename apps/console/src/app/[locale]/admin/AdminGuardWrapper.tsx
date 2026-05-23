'use client';

import { AdminGuard } from '../../../components/guards/AdminGuard';

import type { ReactNode } from 'react';

type Props = { children: ReactNode; locale: string };

export function AdminGuardWrapper({ children, locale }: Props): ReactNode {
  return <AdminGuard locale={locale}>{children}</AdminGuard>;
}
