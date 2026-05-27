/**
 * Redirect to the full-page `/auth` route, preserving the current URL as
 * `?returnUrl=` so the user can be sent back after successful login.
 *
 * Replaces the previous pattern of calling Privy's `usePrivy().login()`
 * directly (which opened the default modal). The full-page `/auth` route
 * (see `apps/web/src/app/[locale]/auth/page.tsx`) renders the OpenTrade
 * branded login surface with Wallet / iAM Smart (Coming Soon) / Google /
 * Apple / Email login methods.
 *
 * The `pathname` returned by `next-intl/navigation`'s `usePathname` is
 * locale-stripped, and `router.push` from the same module re-adds the
 * current locale prefix. That means `returnUrl=/brokers/01f-limited`
 * survives both the redirect to `/auth` and the redirect back to the
 * originating page in the user's selected locale.
 *
 * The `/auth` page validates `returnUrl` against an open-redirect
 * allow-list (same-origin, root-relative paths only) before invoking
 * `router.push`, so callers do not need to sanitise the path themselves.
 */

'use client';

import { useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

import { usePathname, useRouter } from '../i18n/navigation';

export function useLoginRedirect(): () => void {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return useCallback(() => {
    if (pathname === '/auth') {
      return;
    }
    const search = searchParams.toString();
    const fullPath = search ? `${pathname}?${search}` : pathname;
    router.push(`/auth?returnUrl=${encodeURIComponent(fullPath)}`);
  }, [router, pathname, searchParams]);
}
