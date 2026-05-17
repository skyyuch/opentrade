/**
 * Locale-aware navigation primitives.
 *
 * Re-export `Link`, `redirect`, `usePathname`, `useRouter`, and `getPathname`
 * from next-intl's factory so they understand `routing.localePrefix`. Always
 * import navigation through this module — never from `next/link` or
 * `next/navigation` directly — otherwise the locale prefix logic is bypassed
 * and links break for non-default locales.
 */

import { createNavigation } from 'next-intl/navigation';

import { routing } from './routing';

export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
