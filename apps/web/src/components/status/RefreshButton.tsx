/**
 * Client wrapper for the status-page refresh button.
 *
 * Per cursor rule 21 the page itself stays a Server Component; only this
 * one button needs `'use client'` because it dispatches `router.refresh()`
 * — which is the App Router's official way to re-execute the current
 * route's server data fetches without a full navigation.
 */

'use client';

import { RefreshCw } from 'lucide-react';
import { useTransition } from 'react';

import { Button } from '@opentrade/ui/primitives';

import { useRouter } from '../../i18n/navigation';

type Props = {
  label: string;
};

export const RefreshButton = ({ label }: Props) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleClick = (): void => {
    startTransition(() => {
      router.refresh();
    });
  };

  return (
    <Button
      intent="outline"
      size="sm"
      onClick={handleClick}
      loading={isPending}
      leadingIcon={<RefreshCw className="size-4" aria-hidden />}
    >
      {label}
    </Button>
  );
};
