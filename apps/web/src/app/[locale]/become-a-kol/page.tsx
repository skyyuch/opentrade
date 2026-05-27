/**
 * Marketing landing page for KOL outreach (Phase 2 UI Polish S3).
 *
 * Implements ADR-0036 D1.1 "Hybrid KOL registration flow": one unified
 * account system (Privy user + wallet + SBTs) but with a dedicated
 * /become-a-kol entry point tailored for KOL marketing campaigns
 * (YouTube descriptions, Instagram bios, KOL outreach DMs, etc.).
 *
 * The page gracefully renders one of six UX states derived from the
 * combination of Privy `authenticated`, `User.sbtTier`, and
 * `Kol.status` (per the ADR-0036 D1.1 state table):
 *
 *   1. Unauthenticated                  → "Get Started" → /auth?returnUrl
 *   2. Authenticated, no L2 SBT         → link to /verify
 *   3. Authenticated, L2, no application → "Apply now" → /kol/onboarding
 *   4. Application PENDING               → review-in-progress card
 *   5. Application APPROVED              → "Enter KOL Console" → /kol
 *   6. Application REJECTED              → rejection reason + reapply
 *
 * Per ADR-0036 D1.1 + cursor rule 00: the rejection card surfaces the
 * admin moderator's `adminNote` (persisted by the C1 commit in this
 * session — `feat(api,db): persist Kol.adminNote for rejected
 * applications`). The applicant can read the reason and resubmit
 * informed rather than blindly retrying.
 *
 * Per ADR-0036 D1: open onboarding — no minimum follower count, no
 * mandatory professional certification gate. Credentials (CFA, SFC
 * Type 4/9) are *optional* and shown as differentiation badges on the
 * applicant's KOL profile post-approval.
 *
 * Per rule 50: this is a public marketing page; no PII rendered, no
 * accessToken required until the user is already authenticated. The
 * `fetchMyProfile` + `fetchMyKolProfile` calls are gated behind the
 * Privy `authenticated` flag and Privy + OpenTrade JWT exchange.
 *
 * Per rule 00: NO investment advice; copy stays mechanical
 * (transparency, win rates, KOL value proposition) and never tells
 * users to buy/sell anything.
 *
 * Design: dark `#050608` glassmorphic surface matching the /auth route
 * (S2) and mobile nav overlay (S1) so the brand surface stays cohesive
 * across the auth funnel.
 */

'use client';

import { usePrivy } from '@privy-io/react-auth';
import {
  ArrowRight,
  BadgeCheck,
  ChevronRight,
  Database,
  Globe,
  Loader2,
  Lock,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserCheck,
  XCircle,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { useLoginRedirect } from '../../../hooks/useLoginRedirect';
import { useOpenTradeAuth } from '../../../hooks/useOpenTradeAuth';
import { Link } from '../../../i18n/navigation';
import { ApiClientError, fetchMyKolProfile, fetchMyProfile } from '../../../lib/api/client';

import type { KolListItem, UserProfile } from '../../../lib/api/client';
import type { ReactNode } from 'react';

type LandingState =
  | { kind: 'loading' }
  | { kind: 'unauthenticated' }
  | { kind: 'no-sbt'; profile: UserProfile }
  | { kind: 'no-application'; profile: UserProfile }
  | { kind: 'pending'; profile: UserProfile; kol: KolListItem }
  | { kind: 'approved'; profile: UserProfile; kol: KolListItem }
  | { kind: 'rejected'; profile: UserProfile; kol: KolListItem };

export default function BecomeAKolPage(): ReactNode {
  const t = useTranslations('becomeAKol');
  const { authenticated, ready } = usePrivy();
  const goLogin = useLoginRedirect();
  const { getAccessToken } = useOpenTradeAuth();

  const [state, setState] = useState<LandingState>({ kind: 'loading' });

  useEffect(() => {
    if (!ready) return;

    if (!authenticated) {
      setState({ kind: 'unauthenticated' });
      return;
    }

    let cancelled = false;
    void (async () => {
      const token = await getAccessToken();
      if (!token || cancelled) {
        return;
      }
      try {
        // Parallel fetch — profile is always required; kol-profile is a
        // 404 for users who haven't applied yet, swallow that one but
        // re-throw any other error so it surfaces as a loading retry.
        const [profileRes, kolRes] = await Promise.all([
          fetchMyProfile({ accessToken: token }),
          fetchMyKolProfile({ accessToken: token }).catch((err: unknown) => {
            if (err instanceof ApiClientError && err.status === 404) {
              return null;
            }
            throw err;
          }),
        ]);
        if (cancelled) return;

        const profile = profileRes.user;
        const kol = kolRes?.kol ?? null;

        if (profile.sbtTier !== 'L2') {
          setState({ kind: 'no-sbt', profile });
          return;
        }
        if (!kol) {
          setState({ kind: 'no-application', profile });
          return;
        }
        if (kol.status === 'PENDING') {
          setState({ kind: 'pending', profile, kol });
        } else if (kol.status === 'APPROVED') {
          setState({ kind: 'approved', profile, kol });
        } else if (kol.status === 'REJECTED') {
          setState({ kind: 'rejected', profile, kol });
        } else {
          // UNCLAIMED / SUSPENDED — treat like "no application" so they
          // can either claim or reapply via /kol/onboarding which has
          // dedicated state handling.
          setState({ kind: 'no-application', profile });
        }
      } catch {
        // Any non-404 error — fall back to unauthenticated CTA so the
        // user can re-login and retry. Keeps the page useful even on
        // transient outages instead of dead-ending in loading state.
        if (!cancelled) {
          setState({ kind: 'unauthenticated' });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authenticated, ready, getAccessToken]);

  return (
    <div className="relative min-h-[calc(100vh-8rem)] overflow-hidden bg-[#050608] text-white">
      {/* Decorative blur background — mirrors /auth (S2) + mobile nav (S1) */}
      <div className="pointer-events-none absolute -left-[10%] -top-[10%] size-[60%] rounded-full bg-[#00FF88]/5 blur-[160px] mix-blend-screen" />
      <div className="pointer-events-none absolute -bottom-[20%] -right-[10%] size-[50%] rounded-full bg-purple-500/10 blur-[150px] mix-blend-screen" />
      <div className="pointer-events-none absolute left-[40%] top-[20%] size-[30%] rounded-full bg-blue-500/5 blur-[120px] mix-blend-screen" />

      <div className="relative mx-auto max-w-5xl px-4 py-16 sm:py-20 lg:py-24">
        <HeroSection t={t} />

        <ValuePropsSection t={t} />

        <div className="mt-16 sm:mt-20">
          <StateSection state={state} t={t} goLogin={goLogin} />
        </div>

        <Disclaimer t={t} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

function HeroSection({ t }: { t: ReturnType<typeof useTranslations> }): ReactNode {
  return (
    <div className="text-center animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-[#00FF88]/30 bg-[#00FF88]/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-[#00FF88]">
        <Sparkles size={14} />
        {t('heroEyebrow')}
      </div>
      <h1 className="mx-auto max-w-3xl text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
        {t('heroTitlePrefix')}{' '}
        <span className="bg-gradient-to-r from-[#00FF88] to-emerald-300 bg-clip-text text-transparent">
          {t('heroTitleHighlight')}
        </span>
      </h1>
      <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-white/60 sm:text-lg">
        {t('heroSubtitle')}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Value props (3 cards)
// ---------------------------------------------------------------------------

function ValuePropsSection({ t }: { t: ReturnType<typeof useTranslations> }): ReactNode {
  const cards = [
    {
      icon: Lock,
      colorClass: 'text-[#00FF88]',
      ringClass: 'ring-[#00FF88]/30',
      bgClass: 'bg-[#00FF88]/10',
      titleKey: 'valueProp1Title',
      descKey: 'valueProp1Desc',
    },
    {
      icon: TrendingUp,
      colorClass: 'text-blue-300',
      ringClass: 'ring-blue-500/30',
      bgClass: 'bg-blue-500/10',
      titleKey: 'valueProp2Title',
      descKey: 'valueProp2Desc',
    },
    {
      icon: Globe,
      colorClass: 'text-purple-300',
      ringClass: 'ring-purple-500/30',
      bgClass: 'bg-purple-500/10',
      titleKey: 'valueProp3Title',
      descKey: 'valueProp3Desc',
    },
  ] as const;

  return (
    <div className="mt-16 grid gap-6 sm:mt-20 sm:grid-cols-3">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.titleKey}
            className="group rounded-2xl border border-white/10 bg-white/[0.02] p-6 backdrop-blur-xl transition-all hover:border-white/20 hover:bg-white/[0.04]"
          >
            <div
              className={`mb-4 inline-flex size-12 items-center justify-center rounded-xl ${card.bgClass} ring-1 ${card.ringClass}`}
            >
              <Icon size={22} className={card.colorClass} />
            </div>
            <h3 className="mb-2 text-lg font-bold text-white">{t(card.titleKey)}</h3>
            <p className="text-sm leading-relaxed text-white/60">{t(card.descKey)}</p>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// State-driven CTA section (the heart of the 6-state machine)
// ---------------------------------------------------------------------------

function StateSection({
  state,
  t,
  goLogin,
}: {
  state: LandingState;
  t: ReturnType<typeof useTranslations>;
  goLogin: () => void;
}): ReactNode {
  if (state.kind === 'loading') {
    return (
      <div className="flex items-center justify-center rounded-3xl border border-white/10 bg-black/40 p-12 backdrop-blur-2xl">
        <Loader2 size={28} className="animate-spin text-white/40" />
      </div>
    );
  }

  if (state.kind === 'unauthenticated') {
    return (
      <StateCard
        icon={UserCheck}
        iconColor="text-[#00FF88]"
        iconBg="bg-[#00FF88]/10"
        iconRing="ring-[#00FF88]/30"
        title={t('stateUnauthTitle')}
        body={t('stateUnauthBody')}
        cta={{
          label: t('stateUnauthCta'),
          onClick: goLogin,
          variant: 'primary',
        }}
      />
    );
  }

  if (state.kind === 'no-sbt') {
    return (
      <StateCard
        icon={ShieldCheck}
        iconColor="text-amber-300"
        iconBg="bg-amber-500/10"
        iconRing="ring-amber-500/30"
        title={t('stateNoSbtTitle')}
        body={t('stateNoSbtBody')}
        cta={{
          label: t('stateNoSbtCta'),
          href: '/verify',
          variant: 'primary',
        }}
      />
    );
  }

  if (state.kind === 'no-application') {
    return (
      <StateCard
        icon={Sparkles}
        iconColor="text-[#00FF88]"
        iconBg="bg-[#00FF88]/10"
        iconRing="ring-[#00FF88]/30"
        title={t('stateNoApplicationTitle')}
        body={t('stateNoApplicationBody')}
        cta={{
          label: t('stateNoApplicationCta'),
          href: '/kol/onboarding',
          variant: 'primary',
        }}
      />
    );
  }

  if (state.kind === 'pending') {
    return (
      <StateCard
        icon={Database}
        iconColor="text-amber-300"
        iconBg="bg-amber-500/10"
        iconRing="ring-amber-500/30"
        title={t('statePendingTitle')}
        body={t('statePendingBody', { name: state.kol.displayName })}
        metadata={
          <p className="mt-3 text-xs text-white/40">
            {t('statePendingSubmittedAt', {
              date: new Date(state.kol.createdAt).toLocaleString(),
            })}
          </p>
        }
      />
    );
  }

  if (state.kind === 'approved') {
    return (
      <StateCard
        icon={BadgeCheck}
        iconColor="text-[#00FF88]"
        iconBg="bg-[#00FF88]/10"
        iconRing="ring-[#00FF88]/30"
        title={t('stateApprovedTitle')}
        body={t('stateApprovedBody', { name: state.kol.displayName })}
        cta={{
          label: t('stateApprovedCta'),
          href: '/kol/dashboard',
          variant: 'primary',
        }}
      />
    );
  }

  // state.kind === 'rejected'
  return (
    <StateCard
      icon={XCircle}
      iconColor="text-red-400"
      iconBg="bg-red-500/10"
      iconRing="ring-red-500/30"
      title={t('stateRejectedTitle')}
      body={t('stateRejectedBody')}
      metadata={
        <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm">
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-red-300">
            <ShieldAlert size={14} />
            {t('stateRejectedReasonHeading')}
          </p>
          <p className="leading-relaxed text-white/80">
            {state.kol.adminNote ?? t('stateRejectedNoReasonFallback')}
          </p>
          <p className="mt-2 text-xs text-white/30">
            {t('stateRejectedReviewedAt', {
              date: new Date(state.kol.createdAt).toLocaleString(),
            })}
          </p>
        </div>
      }
      cta={{
        label: t('stateRejectedCta'),
        href: '/kol/onboarding',
        variant: 'secondary',
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Generic state card (one shared layout for all six states)
// ---------------------------------------------------------------------------

type StateCardCta = {
  label: string;
  variant: 'primary' | 'secondary';
} & ({ href: string; onClick?: never } | { onClick: () => void; href?: never });

function StateCard({
  icon: Icon,
  iconColor,
  iconBg,
  iconRing,
  title,
  body,
  metadata,
  cta,
}: {
  icon: typeof UserCheck;
  iconColor: string;
  iconBg: string;
  iconRing: string;
  title: string;
  body: string;
  metadata?: ReactNode;
  cta?: StateCardCta;
}): ReactNode {
  return (
    <div className="rounded-3xl border border-white/10 bg-black/40 p-8 shadow-2xl backdrop-blur-2xl sm:p-10">
      <div
        className={`mb-5 inline-flex size-14 items-center justify-center rounded-2xl ${iconBg} ring-1 ${iconRing}`}
      >
        <Icon size={28} className={iconColor} />
      </div>
      <h2 className="mb-3 text-2xl font-bold text-white sm:text-3xl">{title}</h2>
      <p className="max-w-2xl text-base leading-relaxed text-white/60">{body}</p>
      {metadata}
      {cta && (
        <div className="mt-6">
          <CtaButton cta={cta} />
        </div>
      )}
    </div>
  );
}

function CtaButton({ cta }: { cta: StateCardCta }): ReactNode {
  const baseClasses =
    'inline-flex items-center gap-2 rounded-xl px-6 py-3 font-bold transition-all';
  const variantClasses =
    cta.variant === 'primary'
      ? 'bg-[#00FF88] text-black hover:scale-[1.02] hover:bg-[#00e67a] hover:shadow-[0_0_20px_rgba(0,255,136,0.35)]'
      : 'border border-white/20 bg-white/5 text-white hover:bg-white/10';

  if ('href' in cta && cta.href) {
    return (
      <Link href={cta.href} className={`${baseClasses} ${variantClasses}`}>
        {cta.label}
        <ArrowRight size={16} />
      </Link>
    );
  }
  return (
    <button type="button" onClick={cta.onClick} className={`${baseClasses} ${variantClasses}`}>
      {cta.label}
      <ChevronRight size={16} />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Disclaimer
// ---------------------------------------------------------------------------

function Disclaimer({ t }: { t: ReturnType<typeof useTranslations> }): ReactNode {
  return (
    <p className="mx-auto mt-16 max-w-2xl text-center text-xs leading-relaxed text-white/30">
      {t('disclaimer')}
    </p>
  );
}
