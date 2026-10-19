import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Info } from 'lucide-react';
import { Badge, Skeleton } from '../../shared/ui/Primitives';
import { formatPersianDate } from '../../shared/lib/date';
import type { DashboardActivityItem } from './dashboardApi';

/**
 * UX-02-2 shared Ocean dashboard building blocks. One visual
 * language for all four dashboards: white cards on the canonical
 * app background, token-driven primary accents (var(--color-*)),
 * RTL-first layout. No component here invents data — unavailable
 * sections render an explicit honest state.
 */

export const faNum = (value: number | null | undefined) =>
  value === null || value === undefined ? '—' : value.toLocaleString('fa-IR');

export function DashboardHeader({ eyebrow, title, description, children }: {
  eyebrow: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="relative overflow-hidden rounded-3xl p-6 text-white shadow-lg sm:p-8" style={{ background: 'linear-gradient(to left, var(--color-primary-hover), var(--color-primary))' }}>
      <div className="relative flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-bold text-white/70">{eyebrow}</p>
          <h1 className="mt-1 text-2xl font-black sm:text-3xl">{title}</h1>
          <p className="mt-2 max-w-2xl text-xs leading-6 text-white/80 sm:text-sm">{description}</p>
        </div>
        {children}
      </div>
    </header>
  );
}

export function KpiCard({ icon: Icon, label, value, hint, to }: {
  icon: React.ElementType;
  label: string;
  value: string;
  hint?: string;
  to?: string;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: 'var(--color-surface-muted)', color: 'var(--color-primary)' }}>
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <span className="text-2xl font-black text-slate-900">{value}</span>
      </div>
      <p className="mt-3 text-sm font-bold text-slate-700">{label}</p>
      {hint && <p className="mt-1 text-[11px] leading-5 text-slate-500">{hint}</p>}
    </>
  );
  const className = 'block rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition hover:shadow-md';
  return to ? <Link to={to} className={className}>{body}</Link> : <div className={className}>{body}</div>;
}

export function WidgetCard({ title, description, icon: Icon, to, linkLabel, children }: {
  title: string;
  description?: string;
  icon: React.ElementType;
  to?: string;
  linkLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title} className="flex h-full min-w-0 flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xs">
      <header className="flex items-start justify-between gap-3 border-b border-slate-100 p-4 sm:p-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl" style={{ background: 'var(--color-surface-muted)', color: 'var(--color-primary)' }}>
            <Icon className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-black text-slate-900">{title}</h2>
            {description && <p className="mt-1 text-[11px] leading-5 text-slate-500">{description}</p>}
          </div>
        </div>
      </header>
      <div className="min-w-0 flex-1 p-4 sm:p-5">{children}</div>
      {to && (
        <Link to={to} className="flex items-center justify-center gap-1.5 border-t border-slate-100 px-4 py-3 text-xs font-black hover:bg-slate-50" style={{ color: 'var(--color-primary)' }}>
          {linkLabel || 'مشاهدهٔ کامل'}
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        </Link>
      )}
    </section>
  );
}

/** Honest placeholder for data the platform genuinely cannot show yet. */
export function UnavailableWidget({ title, description, icon: Icon }: {
  title: string;
  description: string;
  icon: React.ElementType;
}) {
  return (
    <section aria-label={title} className="flex h-full min-w-0 flex-col rounded-3xl border border-dashed border-slate-300 bg-slate-50/60 p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-slate-400">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-black text-slate-700">{title}</h2>
          <p className="mt-1 text-[11px] leading-5 text-slate-500">{description}</p>
        </div>
      </div>
      <div className="mt-4">
        <Badge tone="neutral">هنوز در دسترس نیست</Badge>
      </div>
    </section>
  );
}

export function WidgetSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-hidden>
      {Array.from({ length: rows }, (_, index) => <div key={index}><Skeleton className="h-10" /></div>)}
    </div>
  );
}

export function WidgetError({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="py-6 text-center" role="alert">
      <p className="text-xs font-bold text-slate-600">دریافت اطلاعات این بخش ناموفق بود.</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-3 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black hover:bg-slate-50" style={{ color: 'var(--color-primary)' }}>
          تلاش مجدد
        </button>
      )}
    </div>
  );
}

export function WidgetEmpty({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 py-4 text-xs font-medium text-slate-500">
      <Info className="h-4 w-4 shrink-0 text-slate-300" aria-hidden />
      <p>{text}</p>
    </div>
  );
}

const ACTION_LABELS: Record<string, string> = {
  'setting.value_written': 'به‌روزرسانی تنظیمات',
  'setting.value_removed': 'حذف مقدار تنظیمات',
  'setting.policy_updated': 'به‌روزرسانی سیاست تنظیمات',
  'organization.created': 'ایجاد سازمان',
  'organization.suspended': 'تعلیق سازمان',
  'organization.reactivated': 'فعال‌سازی مجدد سازمان',
  'organization.ended': 'پایان سازمان',
  'organization.restored': 'بازگردانی سازمان',
  'subscription.assigned': 'تخصیص اشتراک',
  'subscription.renewed': 'تمدید اشتراک',
  'subscription.plan_changed': 'تغییر طرح اشتراک',
  'invitation.issued': 'صدور دعوت',
  'invitation.revoked': 'لغو دعوت',
  'invitation.accepted': 'پذیرش دعوت',
  'platform.role_assigned': 'تخصیص نقش پلتفرم',
  'platform.assignment_revoked': 'لغو تخصیص نقش پلتفرم',
};

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] || 'رویداد مدیریتی';
}

export function ActivityList({ items }: { items: DashboardActivityItem[] }) {
  if (items.length === 0) return <WidgetEmpty text="هنوز فعالیتی ثبت نشده است." />;
  return (
    <ul className="divide-y divide-slate-100">
      {items.map(item => (
        <li key={item.id} className="flex min-w-0 items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
          <div className="min-w-0">
            <p className="truncate text-xs font-extrabold text-slate-800">{actionLabel(item.action)}</p>
            <p className="mt-0.5 truncate text-[11px] text-slate-500">
              {item.actor_name ? `توسط ${item.actor_name}` : 'سامانه'}
              <span dir="ltr" className="mr-2 text-[10px] text-slate-400">{item.action}</span>
            </p>
          </div>
          {item.created_at && <time className="shrink-0 text-[10px] text-slate-400">{formatPersianDate(item.created_at)}</time>}
        </li>
      ))}
    </ul>
  );
}

export function SubscriptionStateBadge({ state }: { state: string }) {
  const map: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }> = {
    active: { label: 'فعال', tone: 'success' },
    grace: { label: 'دورهٔ ارفاق', tone: 'warning' },
    expired: { label: 'منقضی‌شده', tone: 'danger' },
    not_started: { label: 'شروع‌نشده', tone: 'neutral' },
    missing: { label: 'ثبت نشده', tone: 'neutral' },
    invalid: { label: 'نامعتبر', tone: 'danger' },
  };
  const item = map[state] || { label: state, tone: 'neutral' as const };
  return <Badge tone={item.tone}>{item.label}</Badge>;
}

export const LIMIT_LABELS: Record<string, string> = {
  workspaces: 'فضاهای کاری',
  organization_members: 'اعضای سازمان',
  workspace_members: 'اعضای هر فضای کاری',
  storage_bytes: 'حجم ذخیره‌سازی',
};

export function limitLabel(resourceKey: string): string {
  return LIMIT_LABELS[resourceKey] || resourceKey;
}
