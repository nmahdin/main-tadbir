import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Activity, AlertTriangle, BarChart3, Building2, CreditCard, HeartPulse, ShieldCheck, Users,
} from 'lucide-react';
import { BackendStatusPanel } from './BackendStatusPanel';
import { dashboardApi } from './dashboardApi';
import {
  ActivityList, DashboardHeader, KpiCard, UnavailableWidget, WidgetCard, WidgetEmpty,
  WidgetError, WidgetSkeleton, faNum,
} from './widgets';

/**
 * UX-02-2 platform management dashboard. Every number comes from
 * the permission-gated summary endpoint; sections without the
 * matching platform permission render as honest unavailable
 * states. Operational monitoring that belongs to OPS-01 is shown
 * as not-yet-available — never as fabricated health.
 */
export function PlatformDashboard() {
  const summaryQuery = useQuery({
    queryKey: ['dashboard-summary', 'platform'],
    queryFn: () => dashboardApi.platformSummary(),
  });
  const summary = summaryQuery.data?.data;

  const attention: { label: string; value: number }[] = [];
  if (summary?.organizations && summary.organizations.suspended > 0) {
    attention.push({ label: 'سازمان تعلیق‌شده نیازمند تعیین تکلیف', value: summary.organizations.suspended });
  }
  if (summary?.organizations && summary.organizations.without_subscription > 0) {
    attention.push({ label: 'سازمان بدون اشتراک ثبت‌شده', value: summary.organizations.without_subscription });
  }
  if (summary?.subscriptions && summary.subscriptions.expiring_within_30_days > 0) {
    attention.push({ label: 'اشتراک فعالِ در حال اتمام (۳۰ روز آینده)', value: summary.subscriptions.expiring_within_30_days });
  }
  if (summary?.subscriptions && summary.subscriptions.grace > 0) {
    attention.push({ label: 'اشتراک در دورهٔ ارفاق', value: summary.subscriptions.grace });
  }

  return (
    <section className="mx-auto max-w-7xl space-y-5 p-3 sm:p-6 lg:p-8" dir="rtl">
      <DashboardHeader
        eyebrow="مدیریت پلتفرم"
        title="داشبورد پلتفرم"
        description="شاخص‌های اصلی پلتفرم، موارد نیازمند توجه و تازه‌ترین فعالیت‌های مدیریتی؛ فقط بر پایهٔ داده‌هایی که مجوز مشاهدهٔ آن‌ها را دارید."
      />

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
            {summary?.organizations
              ? <KpiCard icon={Building2} label="سازمان‌ها" value={faNum(summary.organizations.total)} hint={`${faNum(summary.organizations.active)} فعال · ${faNum(summary.organizations.suspended)} تعلیق‌شده`} />
              : <UnavailableWidget title="سازمان‌ها" description="برای مشاهدهٔ شمار سازمان‌ها، مجوز «مشاهدهٔ سازمان‌های پلتفرم» لازم است." icon={Building2} />}
            {summary?.users
              ? <KpiCard icon={Users} label="کاربران" value={faNum(summary.users.total)} hint="همهٔ کاربران ثبت‌شدهٔ سامانه" />
              : <UnavailableWidget title="کاربران" description="برای مشاهدهٔ شمار کاربران، مجوز «مشاهدهٔ کاربران پلتفرم» لازم است." icon={Users} />}
            {summary?.subscriptions
              ? <KpiCard icon={CreditCard} label="اشتراک‌های فعال" value={faNum(summary.subscriptions.active)} hint={`از مجموع ${faNum(summary.subscriptions.total)} اشتراک ثبت‌شده`} />
              : <UnavailableWidget title="اشتراک‌ها" description="برای مشاهدهٔ وضعیت اشتراک‌ها، مجوز «مدیریت اشتراک‌های پلتفرم» لازم است." icon={CreditCard} />}
            {summary?.subscriptions
              ? <KpiCard icon={AlertTriangle} label="در حال اتمام (۳۰ روز)" value={faNum(summary.subscriptions.expiring_within_30_days)} hint="اشتراک‌های فعالی که نزدیک پایان‌اند" />
              : <UnavailableWidget title="در حال اتمام" description="بدون مجوز اشتراک‌ها قابل محاسبه نیست." icon={AlertTriangle} />}
          </>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <WidgetCard title="نیازمند توجه" description="مواردی که از داده‌های واقعی پلتفرم استخراج شده‌اند" icon={AlertTriangle}>
          {summaryQuery.isPending ? <WidgetSkeleton /> : attention.length === 0
            ? <WidgetEmpty text="در حال حاضر مورد فوری‌ای برای پیگیری وجود ندارد." />
            : (
              <ul className="divide-y divide-slate-100">
                {attention.map(item => (
                  <li key={item.label} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <span className="text-xs font-bold text-slate-700">{item.label}</span>
                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-black text-amber-700">{faNum(item.value)}</span>
                  </li>
                ))}
              </ul>
            )}
        </WidgetCard>

        <WidgetCard title="فعالیت‌های مدیریتی اخیر" description="تازه‌ترین رویدادهای ثبت‌شده در ممیزی پلتفرم" icon={Activity}>
          {summaryQuery.isPending ? <WidgetSkeleton /> : summary?.recent_activity
            ? <ActivityList items={summary.recent_activity} />
            : <WidgetEmpty text="برای مشاهدهٔ ممیزی، مجوز «مشاهدهٔ ممیزی پلتفرم» لازم است." />}
        </WidgetCard>

        <WidgetCard title="سلامت زیرساخت" description="وضعیت زندهٔ اتصال API و پایگاه داده" icon={HeartPulse}>
          <BackendStatusPanel />
        </WidgetCard>

        <UnavailableWidget
          title="پایش خطاها و رویدادهای عملیاتی"
          description="زیرساخت پایش خطا و هشدارهای عملیاتی (OPS-01) هنوز راه‌اندازی نشده است؛ به همین دلیل هیچ وضعیت ساختگی‌ای نمایش داده نمی‌شود."
          icon={ShieldCheck}
        />

        <WidgetCard title="تحلیل و امنیت" description="درگاه‌های مدیریتی مرتبط" icon={BarChart3}>
          <ul className="space-y-2 text-xs font-bold text-slate-600">
            <li className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5">
              <span>تنظیمات و مدیریت پلتفرم</span>
              <Link to="/scoped-settings" className="font-black" style={{ color: 'var(--color-primary)' }}>تنظیمات پلتفرم</Link>
            </li>
            <li className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5">
              <span>گزارش‌ها و تحلیل‌های سامانه</span>
              <Link to="/analytics" className="font-black" style={{ color: 'var(--color-primary)' }}>تحلیل‌ها</Link>
            </li>
          </ul>
          <p className="mt-3 text-[10px] leading-5 text-slate-400">دسترسی هر درگاه طبق مجوزهای خودِ آن بخش بررسی می‌شود.</p>
        </WidgetCard>
      </div>
    </section>
  );
}
