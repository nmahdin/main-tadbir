import React, { useMemo, useState } from 'react';
import { DirtyGuardDialog } from '../../shared/ui/DirtyGuardDialog';
import { anyDirtySource, discardAllDirtySources } from '../../shared/lib/dirtyRegistry';
import { useNavigate } from 'react-router-dom';
import { Briefcase, Building2, Check, ChevronLeft, Globe, House, Search } from 'lucide-react';
import { useEnvironment } from '../../app/providers/EnvironmentContext';
import { useAuth } from '../../app/providers/AuthContext';
import { Button, CardSkeleton, EmptyState, SearchInput } from '../../shared/ui/Primitives';
import { PageSurface } from '../../shared/ui/PageSurface';
import { IllustratedState, InvalidContextState, OfflineState } from '../../shared/ui/IllustratedState';
import { errorStateKind } from '../../shared/lib/errorStates';
import {
  filterPayload,
  groupedWorkspaces,
  hasAnyEnvironment,
  landingPathFor,
  normalizeSearchText,
  sameEnvironment,
  type EnvironmentSelection,
  type OrganizationEnvironment,
  type WorkspaceEnvironment,
} from '../../shared/lib/environments';

/**
 * UX-02-1 full-page environment selector (/select-environment).
 *
 * Lists exactly what GET /core/environments authorizes for this
 * user — platform (when eligible), organizations (active membership),
 * and workspaces (personal and organizational). Search is a
 * client-side convenience over that payload; entering an
 * environment only switches the navigation context (K2) after the
 * provider isolates client caches. (UX-02-3 addendum: no
 * "recently used" section, badges, or grouping on this page.)
 */

function EnvironmentCard({
  selection,
  name,
  standing,
  icon,
  isCurrent,
  onEnter,
}: {
  selection: EnvironmentSelection;
  name: string;
  standing: string;
  icon: React.ReactNode;
  isCurrent: boolean;
  onEnter: (selection: EnvironmentSelection) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onEnter(selection)}
      aria-current={isCurrent || undefined}
      className={`group flex min-h-24 w-full items-center gap-4 rounded-3xl border bg-white p-5 text-right transition hover:border-[var(--color-primary)] sm:p-6 ${isCurrent ? 'border-[var(--color-primary)]' : 'border-slate-200 hover:border-[var(--color-primary)]'}`}
      style={isCurrent ? { background: 'var(--color-surface-muted)' } : undefined}
    >
      <span
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl"
        style={{ background: 'var(--color-surface-muted)', color: 'var(--color-primary)' }}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-black text-slate-900">{name}</span>
        <span className="mt-1 block truncate text-xs font-medium text-slate-500">{standing}</span>
        {isCurrent && (
          <span className="mt-1.5 flex items-center gap-1 text-[11px] font-black" style={{ color: 'var(--color-primary)' }}>
            <Check className="h-3.5 w-3.5" aria-hidden />
            محیط فعلی
          </span>
        )}
      </span>
      <ChevronLeft className="h-5 w-5 shrink-0 text-slate-300 transition group-hover:text-slate-500" aria-hidden />
    </button>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xs font-black tracking-wide text-slate-500">{children}</h2>;
}

export function SelectEnvironmentPage() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const {
    payload, isLoading, error, refetch, selection, current, switchEnvironment,
    isSwitching, switchProblem, clearSwitchProblem, isOnline,
  } = useEnvironment();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => (payload ? filterPayload(payload, query) : null), [payload, query]);
  const groups = useMemo(() => (filtered ? groupedWorkspaces(filtered) : null), [filtered]);
  const searching = query.trim().length > 0;
  const platformVisible = Boolean(payload?.platform.eligible
    && (!searching || normalizeSearchText('مدیریت پلتفرم').includes(normalizeSearchText(query))));

  const [pendingSwitch, setPendingSwitch] = useState<EnvironmentSelection | null>(null);
  const enter = (next: EnvironmentSelection) => {
    if (sameEnvironment(next, selection)) {
      navigate(landingPathFor(next));
      return;
    }
    if (anyDirtySource()) {
      setPendingSwitch(next);
      return;
    }
    switchEnvironment(next);
  };

  const organizationCard = (organization: OrganizationEnvironment) => (
    <EnvironmentCard
      selection={{ kind: 'organization', id: organization.id }}
      name={organization.name}
      standing={`سازمان · ${organization.role?.name ?? 'عضو سازمان'}`}
      icon={<Building2 className="h-7 w-7" aria-hidden />}
      isCurrent={sameEnvironment({ kind: 'organization', id: organization.id }, selection)}
      onEnter={enter}
    />
  );

  const workspaceCard = (workspace: WorkspaceEnvironment) => (
    <EnvironmentCard
      selection={{ kind: 'workspace', id: workspace.id }}
      name={workspace.name}
      standing={`${workspace.organization_id === null ? 'فضای کاری شخصی' : `فضای کاری ${workspace.organization_name ?? 'سازمانی'}`} · ${workspace.role?.name ?? (workspace.relation === 'owner' ? 'مالک' : 'عضو')}`}
      icon={<Briefcase className="h-7 w-7" aria-hidden />}
      isCurrent={sameEnvironment({ kind: 'workspace', id: workspace.id }, selection)}
      onEnter={enter}
    />
  );

  return (
    <div dir="rtl" className="min-h-screen" style={{ background: 'var(--color-background)' }}>
      <PageSurface containerClassName="max-w-3xl">
       <div>
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold" style={{ color: 'var(--color-primary)' }}>سامانه تدبیر</p>
            <h1 className="mt-1 text-xl font-black text-slate-900">انتخاب محیط</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
              {currentUser.name ? `${currentUser.name}، ` : ''}محیطی را که می‌خواهید در آن کار کنید انتخاب کنید.
              محیط فقط زمینهٔ ناوبری و دسترسی شماست؛ داده‌ها همیشه طبق مجوزهای سرور نمایش داده می‌شوند.
            </p>
          </div>
          <Button type="button" variant="ghost" onClick={() => navigate('/dashboard')}>
            <House className="h-4 w-4" aria-hidden />
            داشبورد
          </Button>
        </header>

        {current && (
          <p className="mt-5 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600" role="status">
            <Check className="h-4 w-4" style={{ color: 'var(--color-primary)' }} aria-hidden />
            محیط فعلی: <strong className="text-slate-800">{current.name}</strong>
            <span className="text-slate-400">({current.standing})</span>
          </p>
        )}

        <div className="mt-5">
          <SearchInput
            value={query}
            onChange={event => setQuery(event.target.value)}
            onClear={() => setQuery('')}
            placeholder="جست‌وجوی سازمان یا فضای کاری…"
            aria-label="جست‌وجوی محیط"
          />
        </div>

        {switchProblem === 'invalid-context' && (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50">
            <InvalidContextState onSelectEnvironment={clearSwitchProblem} />
          </div>
        )}

        <div className="mt-6 space-y-7" aria-busy={isLoading || isSwitching || undefined}>
          {isSwitching && <p role="status" className="text-center text-sm text-slate-500">در حال جابه‌جایی محیط و پاک‌سازی حافظهٔ موقت…</p>}

          {isLoading && (
            <div className="space-y-3" aria-label="در حال بارگذاری محیط‌ها">
              <CardSkeleton />
              <CardSkeleton />
              <CardSkeleton />
            </div>
          )}

          {!isLoading && error !== null && error !== undefined && !payload && (
            !isOnline || errorStateKind(error, isOnline) === 'offline'
              ? <OfflineState onRetry={refetch} />
              : <IllustratedState kind={errorStateKind(error, isOnline)} onRetry={refetch} />
          )}

          {!isLoading && payload && !hasAnyEnvironment(payload) && (
            <EmptyState
              variant="no-results"
              title="محیطی در دسترس نیست"
              description="برای حساب شما هنوز سازمان، فضای کاری یا دسترسی پلتفرمی ثبت نشده است. با مدیر سامانه تماس بگیرید."
            />
          )}

          {!isLoading && filtered && hasAnyEnvironment(filtered) && (
            <>
              {platformVisible && payload && (
                <section className="space-y-3">
                  <SectionTitle>پلتفرم</SectionTitle>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <EnvironmentCard
                      selection={{ kind: 'platform', id: null }}
                      name="مدیریت پلتفرم"
                      standing={`پلتفرم · ${payload.platform.is_primary ? 'مدیر اصلی پلتفرم' : 'مدیر پلتفرم'}`}
                      icon={<Globe className="h-7 w-7" aria-hidden />}
                      isCurrent={sameEnvironment({ kind: 'platform', id: null }, selection)}
                      onEnter={enter}
                    />
                  </div>
                </section>
              )}

              {filtered.organizations.length > 0 && (
                <section className="space-y-3">
                  <SectionTitle>سازمان‌های من</SectionTitle>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {filtered.organizations.map(organization => <React.Fragment key={`organization:${organization.id}`}>{organizationCard(organization)}</React.Fragment>)}
                  </div>
                </section>
              )}

              {groups && groups.personal.length > 0 && (
                <section className="space-y-3">
                  <SectionTitle>فضاهای کاری شخصی</SectionTitle>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {groups.personal.map(workspace => <React.Fragment key={`workspace:${workspace.id}`}>{workspaceCard(workspace)}</React.Fragment>)}
                  </div>
                </section>
              )}

              {groups?.organizations.map(group => (
                <section key={group.organizationId ?? group.organizationName} className="space-y-3">
                  <SectionTitle>{`فضاهای کاری ${group.organizationName}`}</SectionTitle>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {group.items.map(workspace => <React.Fragment key={`workspace:${workspace.id}`}>{workspaceCard(workspace)}</React.Fragment>)}
                  </div>
                </section>
              ))}

              {searching && filtered.organizations.length === 0 && groups?.personal.length === 0 && groups?.organizations.length === 0 && !platformVisible && (
                <EmptyState
                  variant="no-results"
                  title="محیطی با این جست‌وجو یافت نشد"
                  description="نام سازمان یا فضای کاری را بررسی کنید؛ فقط محیط‌هایی نمایش داده می‌شوند که به آن‌ها دسترسی دارید."
                  action={<Button type="button" variant="secondary" onClick={() => setQuery('')}><Search className="h-4 w-4" aria-hidden /> پاک‌کردن جست‌وجو</Button>}
                />
              )}
            </>
          )}
        </div>
       </div>
          <DirtyGuardDialog
          open={!!pendingSwitch}
          onStay={() => setPendingSwitch(null)}
          onSaveAndLeave={() => { const next = pendingSwitch; setPendingSwitch(null); if (next) switchEnvironment(next); }}
          onDiscardAndLeave={() => { const next = pendingSwitch; discardAllDirtySources(); setPendingSwitch(null); if (next) switchEnvironment(next); }}
        />
    </PageSurface>
    </div>
  );
}
