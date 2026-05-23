/**
 * Layout for all /[locale]/broker/* pages.
 * Wraps children in BrokerGuard for role-based access control.
 */

import { BrokerGuardWrapper } from './BrokerGuardWrapper';

import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

const BrokerLayout = async ({ children, params }: Props): Promise<ReactNode> => {
  const { locale } = await params;
  return <BrokerGuardWrapper locale={locale}>{children}</BrokerGuardWrapper>;
};

export default BrokerLayout;
