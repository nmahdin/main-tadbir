import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  DatabaseZap,
  Info,
  RefreshCw,
  SearchCheck,
  ShieldCheck,
} from 'lucide-react';
import { integrityApi } from '../../api/integrity';
import { useApp } from '../../context/AppContext';
import type { IntegrityFinding } from '../../types';
import { Button, EmptyState, ErrorState, LoadingState, Select } from '../common/Primitives';
import { DataTable, FilterBar, Pagination } from '../common/WorkspacePatterns';

const severityLabels: Record<string, string> = {
  critical: 'بحرانی',
  warning: 'هشدار',
  info: 'اطلاع',
};

const typeLabels: Record<string, string> = {
  project: 'پروژه',
  task: 'تسک',
  content: 'محتوا',
  series: 'مجموعه محتوا',
  asset: 'دارایی',
  user: 'کاربر',
  workflow: 'جریان کار',
  meeting: 'جلسه',
  idea: 'ایده',
};

export const IntegrityView: React.FC = () => {
  const { hasPermission } = useApp();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [severity, setSeverity] = useState('');

  const query = useQuery({
    queryKey: ['integrity', severity, page],
    queryFn: () => integrityApi.list(severity, page),
    enabled: hasPermission('integrity.view'),
  });

  if (!hasPermission('integrity.view')) {
    return (
      <div className="mx-auto max-w-3xl p-6 sm:p-8">
        <ErrorState error="اجازه مشاهده تنظیمات و گزارش یکپارچگی را ندارید." title="دسترسی محدود است." />
      </div>
    );
  }

  const summary = query.data?.meta.summary;
  const findings = query.data?.data || [];
  const filterCount = Number(Boolean(severity));

  return (
    <div dir="rtl" className="mx-auto max-w-7xl space-y-5 p-4 text-right sm:p-6 lg:p-8">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-md shadow-indigo-200">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">سلامت و یکپارچگی داده</h1>
            <p className="mt-1 text-xs text-slate-600 sm:text-sm">گزارش فقط‌خواندنی برای شناسایی پیوندهای ناقص و ناسازگاری‌های سامانه</p>
          </div>
        </div>
        <Button variant="secondary" loading={query.isFetching} onClick={() => query.refetch()}>
          <RefreshCw className="h-4 w-4" />بازبینی دوباره
        </Button>
      </header>

      <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-[11px] leading-5 text-sky-800">
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p><b>این بخش فقط گزارش می‌دهد.</b> هیچ رکوردی در این صفحه به‌صورت خودکار اصلاح یا حذف نمی‌شود؛ برای بررسی هر یافته وارد رکورد اصلی شوید.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard label="کل یافته‌ها" value={query.data?.meta?.total || 0} icon={<DatabaseZap />} tone="indigo" />
        <SummaryCard label="بحرانی" value={summary?.critical || 0} icon={<CircleAlert />} tone="rose" />
        <SummaryCard label="هشدار" value={summary?.warning || 0} icon={<AlertTriangle />} tone="amber" />
        <SummaryCard label="اطلاع" value={summary?.info || 0} icon={<Info />} tone="sky" />
      </div>

      <FilterBar>
        <div className="flex min-w-44 items-center gap-2 text-[11px] font-bold text-slate-600">
          <SearchCheck className="h-4 w-4 text-indigo-500" />فیلتر یافته‌ها
        </div>
        <Select
          aria-label="فیلتر شدت یافته"
          value={severity}
          onChange={event => { setSeverity(event.target.value); setPage(1); }}
          className="min-w-36"
        >
          <option value="">همه شدت‌ها</option>
          <option value="critical">بحرانی</option>
          <option value="warning">هشدار</option>
          <option value="info">اطلاع</option>
        </Select>
        {filterCount > 0 && (
          <Button variant="ghost" size="sm" onClick={() => { setSeverity(''); setPage(1); }}>پاک‌کردن فیلتر</Button>
        )}
      </FilterBar>

      {query.isLoading && <LoadingState label="در حال بررسی یکپارچگی داده‌ها…" />}
      {query.isError && <ErrorState error={query.error} onRetry={() => query.refetch()} title="گزارش یکپارچگی دریافت نشد." />}
      {!query.isLoading && !query.isError && (
        <DataTable label="یافته‌های یکپارچگی داده">
          <thead className="bg-slate-50 text-[11px] font-bold text-slate-500">
            <tr>
              <th className="w-28 text-right">شدت</th>
              <th className="text-right">یافته</th>
              <th className="w-52 text-right">رکورد</th>
              <th className="w-28" />
            </tr>
          </thead>
          <tbody>
            {findings.map((finding, index) => (
              <tr key={`${finding.code}-${finding.type}-${finding.id}-${index}`} className="last:border-b-0 hover:bg-slate-50/70">
                <td><SeverityBadge severity={finding.severity} /></td>
                <td>
                  <p className="font-bold leading-6 text-slate-800">{finding.message}</p>
                  <p className="mt-1 font-mono text-[10px] text-slate-400" dir="ltr">{finding.code}</p>
                </td>
                <td>
                  <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-600">
                    {typeLabels[finding.type] || finding.type}
                  </span>
                  <p className="mt-1.5 max-w-44 truncate font-mono text-[10px] text-slate-400" dir="ltr">{finding.id}</p>
                </td>
                <td>
                  <Button variant="ghost" size="sm" onClick={() => navigate(finding.link)}>
                    مشاهده<ArrowLeft className="h-3.5 w-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
            {!findings.length && (
              <tr>
                <td colSpan={4} className="py-12 text-center">
                  <EmptyState title={filterCount ? 'یافته‌ای مطابق فیلترها وجود ندارد.' : 'ناهماهنگی شناخته‌شده‌ای پیدا نشد.'}>
                    <p className="mt-2 text-xs text-slate-500">{filterCount ? 'فیلتر را تغییر دهید یا پاک کنید.' : 'پیوندهای بررسی‌شده در وضعیت سالم قرار دارند.'}</p>
                  </EmptyState>
                </td>
              </tr>
            )}
          </tbody>
        </DataTable>
      )}
      <Pagination meta={query.data?.meta} busy={query.isFetching} onPage={setPage} />

      {!query.isLoading && !query.isError && !findings.length && filterCount === 0 && (
        <div className="flex items-center justify-center gap-2 text-[11px] font-bold text-emerald-700">
          <CheckCircle2 className="h-4 w-4" />آخرین بررسی با موفقیت انجام شد.
        </div>
      )}
    </div>
  );
};

function SeverityBadge({ severity }: { severity: IntegrityFinding['severity'] }) {
  const styles = severity === 'critical'
    ? 'border-rose-200 bg-rose-50 text-rose-700'
    : severity === 'warning'
      ? 'border-amber-200 bg-amber-50 text-amber-700'
      : 'border-sky-200 bg-sky-50 text-sky-700';
  return <span className={`inline-flex rounded-lg border px-2.5 py-1 text-[10px] font-extrabold ${styles}`}>{severityLabels[severity]}</span>;
}

function SummaryCard({ label, value, icon, tone }: { label: string; value: number; icon: React.ReactNode; tone: 'indigo' | 'rose' | 'amber' | 'sky' }) {
  const styles = {
    indigo: 'bg-indigo-50 text-indigo-600',
    rose: 'bg-rose-50 text-rose-600',
    amber: 'bg-amber-50 text-amber-600',
    sky: 'bg-sky-50 text-sky-600',
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
      <div className={`flex h-9 w-9 items-center justify-center rounded-xl [&>svg]:h-4 [&>svg]:w-4 ${styles[tone]}`}>{icon}</div>
      <p className="mt-3 text-[10px] font-bold text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-black text-slate-900">{value.toLocaleString('fa-IR')}</p>
    </div>
  );
}

export default IntegrityView;
