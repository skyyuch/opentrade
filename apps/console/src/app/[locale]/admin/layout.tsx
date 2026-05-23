/**
 * Layout for all /[locale]/admin/* pages.
 * Wraps children in AdminGuard for role-based access control.
 */

import { AdminGuardWrapper } from './AdminGuardWrapper';

import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

const AdminLayout = async ({ children, params }: Props): Promise<ReactNode> => {
  const { locale } = await params;
  return <AdminGuardWrapper locale={locale}>{children}</AdminGuardWrapper>;
};

export default AdminLayout;
