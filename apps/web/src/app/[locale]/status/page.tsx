/**
 * `/status` — public liveness page mirroring `apps/api`'s `/v1/health`.
 *
 * First non-placeholder surface in `apps/web`: validates the entire
 * web -> shared -> api wire end to end (env loading, typed client,
 * shared DTO, Tailwind tokens, three-locale routing). Phase 1+ replaces
 * the demo `<Button>` showcase with real CTAs once review / KOL flows
 * land — the page itself stays as the operational dashboard.
 *
 * Server Component by design: the API probe runs on every request with
 * `next: { revalidate: 0 }` so the dashboard never serves stale data.
 * The single client island is `<RefreshButton>` for `router.refresh()`.
 *
 * Failure mode: if the API is unreachable (network error or non-2xx
 * envelope) we render a clearly distinct "API unreachable" card — we do
 * NOT throw, because the dashboard is most useful precisely when the
 * upstream is broken.
 */

import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { RefreshButton } from '../../../components/status/RefreshButton';
import { ApiClientError, fetchHealth } from '../../../lib/api/client';

import type { DependencyHealthDto, HealthReportDto, HealthStatus } from '@opentrade/shared';
import type { ReactNode } from 'react';

type Props = {
  params: Promise<{ locale: string }>;
};

type ProbeResult =
  | { kind: 'success'; report: HealthReportDto }
  | { kind: 'error'; status: number | null; code: string; requestId?: string };

const probeApi = async (): Promise<ProbeResult> => {
  try {
    const report = await fetchHealth({ next: { revalidate: 0 } });
    return { kind: 'success', report };
  } catch (err) {
    if (err instanceof ApiClientError) {
      const result: ProbeResult = {
        kind: 'error',
        status: err.status,
        code: err.code,
      };
      if (err.requestId !== undefined) {
        return { ...result, requestId: err.requestId };
      }
      return result;
    }
    return { kind: 'error', status: null, code: 'API_UNREACHABLE' };
  }
};

const StatusPage = async (props: Props): Promise<ReactNode> => {
  const params = await props.params;
  setRequestLocale(params.locale);

  const t = await getTranslations('status');
  const result = await probeApi();
  const checkedAt = new Date();
  const formattedCheckedAt = new Intl.DateTimeFormat(params.locale, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(checkedAt);

  return (
    <main className="container mx-auto flex flex-col gap-8 px-4 py-12 md:py-16">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {t('eyebrow')}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{t('title')}</h1>
          <p className="max-w-2xl text-sm text-muted-foreground md:text-base">{t('subtitle')}</p>
        </div>
        <RefreshButton label={t('refresh')} />
      </header>

      {result.kind === 'success' ? (
        <SuccessView t={t} report={result.report} formattedCheckedAt={formattedCheckedAt} />
      ) : (
        <ErrorView t={t} result={result} formattedCheckedAt={formattedCheckedAt} />
      )}

      <footer className="text-xs text-muted-foreground">{t('disclaimer')}</footer>
    </main>
  );
};

export default StatusPage;

// ---------------------------------------------------------------------------
// Sub-views (kept inline; promoted to packages/ui only once a second page
// needs the same shape per ADR-0009 Storybook-first rule).
// ---------------------------------------------------------------------------

type StatusTranslator = Awaited<ReturnType<typeof getTranslations<'status'>>>;

type SuccessViewProps = {
  t: StatusTranslator;
  report: HealthReportDto;
  formattedCheckedAt: string;
};

const SuccessView = ({ t, report, formattedCheckedAt }: SuccessViewProps): ReactNode => (
  <section className="flex flex-col gap-6">
    <OverallCard t={t} status={report.status} uptimeSeconds={report.uptimeSeconds} />
    <DependenciesCard t={t} dependencies={report.dependencies} />
    <p className="text-xs text-muted-foreground">
      {t('lastChecked', { value: formattedCheckedAt })}
    </p>
  </section>
);

type OverallCardProps = {
  t: StatusTranslator;
  status: HealthStatus;
  uptimeSeconds: number;
};

const OverallCard = ({ t, status, uptimeSeconds }: OverallCardProps): ReactNode => (
  <article className="flex flex-col gap-4 rounded-lg border border-border bg-card p-6 shadow-sm md:flex-row md:items-center md:justify-between">
    <div className="flex items-center gap-4">
      <StatusIcon status={status} />
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {t('overall')}
        </p>
        <p className="text-2xl font-semibold">{t(`states.${status}`)}</p>
      </div>
    </div>
    <div className="flex flex-col items-start gap-1 md:items-end">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {t('uptime')}
      </p>
      <p className="font-mono text-lg">{formatUptime(uptimeSeconds, t)}</p>
    </div>
  </article>
);

type DependenciesCardProps = {
  t: StatusTranslator;
  dependencies: DependencyHealthDto[];
};

const DependenciesCard = ({ t, dependencies }: DependenciesCardProps): ReactNode => (
  <article className="flex flex-col gap-4 rounded-lg border border-border bg-card p-6 shadow-sm">
    <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
      {t('dependencies')}
    </h2>
    <ul className="flex flex-col divide-y divide-border">
      {dependencies.map((dep) => (
        <li
          key={dep.name}
          className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
        >
          <div className="flex items-center gap-3">
            <StatusIcon status={dep.status} />
            <span className="font-medium">{translateDependency(t, dep.name)}</span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            {dep.latencyMs !== undefined ? (
              <span className="font-mono text-muted-foreground">{dep.latencyMs} ms</span>
            ) : null}
            <span className={statusBadgeClass(dep.status)}>{t(`states.${dep.status}`)}</span>
          </div>
        </li>
      ))}
    </ul>
  </article>
);

type ErrorViewProps = {
  t: StatusTranslator;
  result: Extract<ProbeResult, { kind: 'error' }>;
  formattedCheckedAt: string;
};

const ErrorView = ({ t, result, formattedCheckedAt }: ErrorViewProps): ReactNode => (
  <article className="flex flex-col gap-4 rounded-lg border border-danger/40 bg-danger/5 p-6 shadow-sm">
    <div className="flex items-center gap-3">
      <XCircle className="size-6 text-danger" aria-hidden />
      <h2 className="text-xl font-semibold text-danger">{t('errors.unreachableTitle')}</h2>
    </div>
    <p className="text-sm text-foreground">{t('errors.unreachableHint')}</p>
    <dl className="grid grid-cols-1 gap-2 text-xs text-muted-foreground sm:grid-cols-2">
      <div className="flex gap-2">
        <dt className="font-medium uppercase tracking-wider">{t('errors.code')}</dt>
        <dd className="font-mono">{result.code}</dd>
      </div>
      {result.status !== null ? (
        <div className="flex gap-2">
          <dt className="font-medium uppercase tracking-wider">{t('errors.status')}</dt>
          <dd className="font-mono">{result.status}</dd>
        </div>
      ) : null}
      {result.requestId !== undefined ? (
        <div className="flex gap-2 sm:col-span-2">
          <dt className="font-medium uppercase tracking-wider">{t('errors.requestId')}</dt>
          <dd className="font-mono">{result.requestId}</dd>
        </div>
      ) : null}
      <div className="flex gap-2 sm:col-span-2">
        <dt className="font-medium uppercase tracking-wider">{t('checkedAtLabel')}</dt>
        <dd>{formattedCheckedAt}</dd>
      </div>
    </dl>
  </article>
);

const StatusIcon = ({ status }: { status: HealthStatus }): ReactNode => {
  if (status === 'OK') {
    return <CheckCircle2 className="size-6 text-success" aria-hidden />;
  }
  if (status === 'DEGRADED') {
    return <AlertTriangle className="size-6 text-warning" aria-hidden />;
  }
  return <XCircle className="size-6 text-danger" aria-hidden />;
};

const statusBadgeClass = (status: HealthStatus): string => {
  const base = 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium';
  if (status === 'OK') return `${base} bg-success/10 text-success`;
  if (status === 'DEGRADED') return `${base} bg-warning/10 text-warning`;
  return `${base} bg-danger/10 text-danger`;
};

const formatUptime = (seconds: number, t: StatusTranslator): string => {
  const total = Math.max(0, Math.floor(seconds));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remSeconds = total % 60;
  if (days > 0) return t('uptimeDhms', { d: days, h: hours, m: minutes, s: remSeconds });
  if (hours > 0) return t('uptimeHms', { h: hours, m: minutes, s: remSeconds });
  if (minutes > 0) return t('uptimeMs', { m: minutes, s: remSeconds });
  return t('uptimeS', { s: remSeconds });
};

const translateDependency = (t: StatusTranslator, name: string): string => {
  // next-intl throws on missing keys at runtime; gate with a key list so a
  // future dependency added on the API side doesn't crash the page.
  const known: Record<string, string> = {
    database: t('deps.database'),
  };
  return known[name] ?? name;
};
