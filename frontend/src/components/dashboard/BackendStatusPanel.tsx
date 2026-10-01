import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Database, HelpCircle, RefreshCw, ServerCog, WifiOff } from 'lucide-react';
import { apiConfig } from '../../api/client';
import { healthApi } from '../../api/health';
import { runtime } from '../../config/runtime';
import { Button } from '../common/Primitives';
import {
  describeBackendHealth,
  formatServerTime,
  relativeCheckLabel,
  type BackendState,
  type BackendTile,
} from './backendStatus';

const STATE_STYLES: Record<BackendState, { chip: string; icon: React.ReactNode }> = {
  ok: { chip: 'border-emerald-200 bg-emerald-50 text-emerald-800', icon: <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> },
  down: { chip: 'border-rose-200 bg-rose-50 text-rose-800', icon: <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> },
  unreachable: { chip: 'border-rose-200 bg-rose-50 text-rose-800', icon: <WifiOff className="h-3.5 w-3.5" aria-hidden /> },
  invalid: { chip: 'border-amber-200 bg-amber-50 text-amber-800', icon: <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> },
  unknown: { chip: 'border-slate-200 bg-slate-50 text-slate-700', icon: <HelpCircle className="h-3.5 w-3.5" aria-hidden /> },
};

const StatusTile: React.FC<{ icon: React.ReactNode; title: string; tile: BackendTile }> = ({ icon, title, tile }) => {
  const style = STATE_STYLES[tile.state];

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-xs font-bold text-slate-700">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-50 text-slate-600">{icon}</span>
          {title}
        </span>
        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-black ${style.chip}`}>
          {style.icon}
          {tile.label}
        </span>
      </div>
      <p className="text-[11px] leading-5 text-slate-500">{tile.detail}</p>
    </div>
  );
};

/**
 * کارت پایش سبک بک‌اند روی داشبورد.
 *
 * فقط وضعیت اتصال (API، دیتابیس، زمان سرور) را نشان می‌دهد و هیچ دادهٔ حساسی
 * از سرور نمایش داده نمی‌شود. بررسی خودکار دوره‌ای عمداً وجود ندارد؛ هر بررسی
 * یک درخواست به سرور است و روی هاست اشتراکی نباید بار دائمی بسازد.
 */
export const BackendStatusPanel: React.FC = () => {
  const api = useQuery({
    queryKey: ['backend-status', 'api'],
    queryFn: () => healthApi.api(),
    enabled: !runtime.demoMode,
    retry: false,
    staleTime: 30_000,
  });
  const db = useQuery({
    queryKey: ['backend-status', 'db'],
    queryFn: () => healthApi.db(),
    enabled: !runtime.demoMode,
    retry: false,
    staleTime: 30_000,
  });

  const fetching = !runtime.demoMode && (api.isFetching || db.isFetching);
  const tiles = describeBackendHealth({
    api: { payload: api.data, error: api.error },
    db: { payload: db.data, error: db.error },
  });
  const checkedAt = Math.max(api.dataUpdatedAt, db.dataUpdatedAt);
  const pending = !runtime.demoMode && (api.isPending || db.isPending);

  return (
    <section aria-label="وضعیت سامانه و بک‌اند" className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xs">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-base font-bold tracking-tight text-slate-900">
            <ServerCog className="h-5 w-5 text-sky-600" aria-hidden />
            <span>وضعیت سامانه و بک‌اند</span>
          </h3>
          <p className="mt-1 text-[11px] text-slate-500">
            {runtime.demoMode
              ? 'حالت نمایشی است؛ پایش بک‌اند فقط با اتصال واقعی نمایش داده می‌شود.'
              : pending
                ? 'در حال بررسی اتصال بک‌اند…'
                : `آخرین بررسی: ${relativeCheckLabel(checkedAt)}`}
          </p>
        </div>
        <Button
          variant="secondary"
          loading={fetching}
          disabled={runtime.demoMode}
          onClick={() => { void api.refetch(); void db.refetch(); }}
        >
          <RefreshCw className="h-4 w-4" aria-hidden />
          بررسی مجدد
        </Button>
      </div>

      {pending ? (
        <p role="status" className="rounded-2xl bg-slate-50 p-4 text-xs font-bold text-slate-600">
          در حال بررسی اتصال به بک‌اند…
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-live="polite" aria-busy={fetching}>
          <StatusTile icon={<ServerCog className="h-4 w-4" aria-hidden />} title="اتصال API" tile={tiles.api} />
          <StatusTile icon={<Database className="h-4 w-4" aria-hidden />} title="اتصال دیتابیس" tile={tiles.db} />
          <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4">
            <span className="flex items-center gap-2 text-xs font-bold text-slate-700">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-50 text-slate-600">
                <ServerCog className="h-4 w-4" aria-hidden />
              </span>
              زمان سرور
            </span>
            <p dir="ltr" className="text-[13px] font-black text-slate-900">
              {runtime.demoMode ? '—' : formatServerTime(api.data?.time ?? db.data?.time)}
            </p>
            <p className="text-[11px] leading-5 text-slate-500">زمان گزارش‌شدهٔ سرور به وقت تهران</p>
          </div>
          <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4">
            <span className="flex items-center gap-2 text-xs font-bold text-slate-700">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-50 text-slate-600">
                <WifiOff className="h-4 w-4" aria-hidden />
              </span>
              آدرس API پنل
            </span>
            <p dir="ltr" className="truncate text-[11px] font-bold text-slate-700" title={apiConfig.baseUrl}>
              {apiConfig.baseUrl}
            </p>
            <p className="text-[11px] leading-5 text-slate-500">همان آدرسی که این پنل برای درخواست‌ها استفاده می‌کند</p>
          </div>
        </div>
      )}
    </section>
  );
};
