'use client';

import { BrokerGuard } from '../../../components/guards/BrokerGuard';

import type { ReactNode } from 'react';

type Props = { children: ReactNode; locale: string };

export function BrokerGuardWrapper({ children, locale }: Props): ReactNode {
  return <BrokerGuard locale={locale}>{children}</BrokerGuard>;
}
