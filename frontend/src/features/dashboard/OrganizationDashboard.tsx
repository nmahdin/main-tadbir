import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Activity, Building2, CreditCard, FolderKanban, MailPlus, Settings2, Users,
} from 'lucide-react';
import { useEnvironment } from '../../app/providers/EnvironmentContext';
import { formatPersianDate } from '../../shared/lib/date';
import { dashboardApi } from './dashboardApi';
import {
  ActivityList, DashboardHeader, KpiCard, SubscriptionStateBadge, UnavailableWidget,
  WidgetCard, WidgetEmpty, WidgetError, WidgetSkeleton, faNum, limitLabel,
} from './widgets';

/**
 * UX-02-2 organization management dashboard. Management-only data
 * (members, invitations, subscription/entitlements, management
 * audit) — never workspace project activity. Sections the server
 * withholds (null) render as honest unavailable states; a missing
 * subscription is shown as exactly that.
 */
export function OrganizationDashboard({ organizationId }: { organizationId: number }) {
  const { current } = useEnvironment();
  const summaryQuery = useQuery({
    queryKey: ['dashboard-summary', 'organization', organizationId],
    queryFn: () => dashboardApi.organizationSummary(organizationId),
  });
  const summary = summaryQuery.data?.data;
  const subscription = summary?.subscription;

  return (
    <section className="mx-auto max-w-7xl space-y-5 p-3 sm:p-6 lg:p-8" dir="rtl">
      <DashboardHeader
        eyebrow="مدیریت سازمان"
        title={current?.name || 'داشبورد سازمان'}
        description="خلاصهٔ مدیریتی سازمان: اعضا، فضاهای کاری، اشتراک و سهمیه‌ها، دعوت‌ها و تازه‌ترین فعالیت‌های مدیریتی."
      >
        <Link to="/scoped-settings" className="flex shrink-0 items-center gap-2 rounded-xl bg-white/15 px-4 py-2.5 text-xs font-black text-white backdrop-blur-sm transition hover:bg-white/25">
          <Settings2 className="h-4 w-4" aria-hidden />
          تنظیمات سازمان
        </Link>
      </DashboardHeader>

      {summaryQuery.isError && (
        <div className="rounded-3xl border border-slate-200 bg-white p-5">
          <WidgetError onRetry={() => void summaryQuery.refetch()} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {summaryQuery.isPending ? (
          <><WidgetSkeleton rows={1} /><WidgetSkeleton rows={1} /><WidgetSkeleton rows={1} /><WidgetSkeleton rows={1} /></>
        ) : (
          <>
            {summary?.members
              ? <KpiCard icon={Users} label="اعضای فعال سازمان" value={faNum(summary.members.active)} hint="عضویت‌های فعال در این سازمان" />
              : <UnavailableWidget title="اعضای سازمان" description="برای مشاهدهٔ شمار اعضا، مجوز «مشاهدهٔ اعضای سازمان» لازم است." icon={Users} />}
            {summary?.workspaces
              ? <KpiCard icon={FolderKanban} label="فضاهای کاری سازمان" value={faNum(summary.workspaces.total)} hint="همهٔ فضاهای کاری این سازمان" />
              : <UnavailableWidget title="فضاهای کاری" description="این بخش با مجوز مشاهدهٔ سازمان نمایش داده می‌شود." icon={FolderKanban} />}
            {summary?.invitations
              ? <KpiCard icon={MailPlus} label="دعوت‌های در انتظار" value={faNum(summary.invitations.pending)} hint="دعوت‌های صادرشده و هنوز پذیرفته‌نشده" to="/invitations/manage" />
              : <UnavailableWidget title="دعوت‌ها" description="برای مشاهدهٔ دعوت‌ها، مجوز «مدیریت اعضای سازمان» لازم است." icon={MailPlus} />}
            {subscription
              ? (
                <div data-elevation="standalone" className="ui-standalone-card rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: 'var(--color-surface-muted)', color: 'var(--color-primary)' }}>
                      <CreditCard className="h-5 w-5" aria-hidden />
                    </span>
                    <SubscriptionStateBadge state={subscription.state} />
                  </div>
                  <p className="mt-3 text-sm font-bold text-slate-700">اشتراک سازمان</p>
                  <p className="mt-1 text-[11px] leading-5 text-slate-500">
                    {subscription.plan ? <>طرح <span dir="ltr" className="font-bold">{subscription.plan.key}</span> · نسخهٔ {faNum(subscription.plan.version)}</> : 'طرحی تخصیص داده نشده است'}
                  </p>
                </div>
              )
              : <UnavailableWidget title="اشتراک سازمان" description="این بخش با مجوز مشاهدهٔ سازمان نمایش داده می‌شود." icon={CreditCard} />}
          </>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <WidgetCard title="اشتراک و سهمیه‌ها" description="وضعیت واقعی اشتراک از داده‌های C5؛ سقف‌ها هرگز حدس زده نمی‌شوند" icon={CreditCard}>
          {summaryQuery.isPending ? <WidgetSkeleton /> : !subscription
            ? <WidgetEmpty text="نمایش اشتراک برای نقش شما مجاز نیست." />
            : subscription.state === 'missing'
              ? <WidgetEmpty text={summary?.pending_free_activation ? 'اشتراک رایگان این سازمان در انتظار انتشار بسته توسط مدیر سامانه است؛ پس از انتشار، به‌صورت خودکار فعال می‌شود و نیازی به اقدام شما نیست.' : 'هنوز اشتراکی برای این سازمان ثبت نشده است. تخصیص اشتراک از مدیریت پلتفرم انجام می‌شود.'} />
              : (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                    <SubscriptionStateBadge state={subscription.state} />
                    {subscription.expires_at && <span>پایان: {formatPersianDate(subscription.expires_at)}</span>}
                    {subscription.state === 'grace' && subscription.grace_ends_at && <span>پایان ارفاق: {formatPersianDate(subscription.grace_ends_at)}</span>}
                  </div>
                  {subscription.limits.length === 0
                    ? <WidgetEmpty text="برای این طرح سقفی ثبت نشده است." />
                    : (
                      <ul className="space-y-3">
                        {subscription.limits.map(limit => {
                          const percent = !limit.is_unlimited && limit.limit_value && limit.usage !== null && limit.limit_value > 0
                            ? Math.min(100, Math.round((limit.usage / limit.limit_value) * 100))
                            : null;
                          return (
                            <li key={limit.resource_key}>
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-bold text-slate-700">{limitLabel(limit.resource_key)}</span>
                                <span className="text-slate-500">
                                  {limit.usage === null ? 'مصرف نامشخص' : `${faNum(limit.usage)} از ${limit.is_unlimited ? 'نامحدود' : faNum(limit.limit_value)}`}
                                </span>
                              </div>
                              {percent !== null && (
                                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={`مصرف ${limitLabel(limit.resource_key)}`}>
                                  <span className="block h-full rounded-full" style={{ width: `${percent}%`, background: 'var(--color-primary)' }} />
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                </div>
              )}
        </WidgetCard>

        <WidgetCard title="دعوت‌های اخیر" description="آخرین دعوت‌های صادرشده برای این سازمان" icon={MailPlus} to="/invitations/manage" linkLabel="مدیریت دعوت‌ها">
          {summaryQuery.isPending ? <WidgetSkeleton /> : summary?.invitations
            ? (summary.invitations.recent.length === 0
              ? <WidgetEmpty text="هنوز دعوتی صادر نشده است." />
              : (
                <ul className="divide-y divide-slate-100">
                  {summary.invitations.recent.map(item => (
                    <li key={item.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                      <span dir="ltr" className="truncate text-xs font-bold text-slate-700">{item.email}</span>
                      <span className="shrink-0 text-[11px] text-slate-500">
                        {item.state === 'pending' ? 'در انتظار' : item.state === 'accepted' ? 'پذیرفته‌شده' : item.state === 'expired' ? 'منقضی' : 'لغوشده'}
                      </span>
                    </li>
                  ))}
                </ul>
              ))
            : <WidgetEmpty text="برای مشاهدهٔ دعوت‌ها، مجوز «مدیریت اعضای سازمان» لازم است." />}
        </WidgetCard>

        <WidgetCard title="فعالیت‌های مدیریتی اخیر" description="رویدادهای مدیریتی همین سازمان (نه فعالیت پروژه‌ها)" icon={Activity}>
          {summaryQuery.isPending ? <WidgetSkeleton /> : summary?.recent_activity
            ? <ActivityList items={summary.recent_activity} />
            : <WidgetEmpty text="برای مشاهدهٔ فعالیت‌های مدیریتی، مجوز «مشاهدهٔ اعضای سازمان» لازم است." />}
        </WidgetCard>

        <WidgetCard title="درگاه‌های مدیریت" description="دسترسی سریع به بخش‌های مدیریتی مجاز" icon={Building2}>
          <div className="grid grid-cols-2 gap-2">
            <Link to="/scoped-settings" className="rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-black text-slate-700 hover:bg-slate-50">تنظیمات سازمان</Link>
            <Link to="/invitations/manage" className="rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-black text-slate-700 hover:bg-slate-50">مدیریت دعوت‌ها</Link>
            <Link to="/dashboard" className="rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-black text-slate-700 hover:bg-slate-50">کارتابل من</Link>
            <Link to="/select-environment" className="rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-black text-slate-700 hover:bg-slate-50">تغییر محیط</Link>
          </div>
          <p className="mt-4 text-[10px] leading-5 text-slate-400">هر درگاه هنگام ورود، مجوز مربوط به خودش را دوباره بررسی می‌کند.</p>
        </WidgetCard>
      </div>
    </section>
  );
}
