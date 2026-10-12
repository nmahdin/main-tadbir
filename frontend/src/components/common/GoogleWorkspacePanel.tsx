import React, { useCallback, useEffect, useState } from 'react';
import { Download, ExternalLink, FileSpreadsheet, FileText, LoaderCircle, RefreshCw, Unlink, Upload } from 'lucide-react';
import { ApiError } from '../../api/client';
import { googleWorkspaceApi, GoogleWorkspaceLink } from '../../api/googleWorkspace';
import { useApp } from '../../context/AppContext';

type ResourceKind = 'asset' | 'table';

const formatSyncTime = (value?: string | null) => value
  ? new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  : 'هنوز همگام نشده';

export function GoogleWorkspacePanel({
  resource,
  resourceId,
  initialLink,
  canEdit,
  available,
  onChanged,
}: {
  resource: ResourceKind;
  resourceId: number | string;
  initialLink?: GoogleWorkspaceLink | null;
  canEdit: boolean;
  available: boolean;
  onChanged?: () => void | Promise<void>;
}) {
  const { notify } = useApp();
  const [link, setLink] = useState<GoogleWorkspaceLink | null>(initialLink ?? null);
  const [busy, setBusy] = useState<'status' | 'push' | 'pull' | 'disconnect' | null>('status');
  const endpoint = resource === 'asset' ? googleWorkspaceApi.asset(resourceId) : googleWorkspaceApi.table(resourceId);
  const serviceLabel = resource === 'asset' ? 'Google Docs' : 'Google Sheets';
  const ServiceIcon = resource === 'asset' ? FileText : FileSpreadsheet;

  const refresh = useCallback(async () => {
    setBusy('status');
    try {
      const response = await endpoint.status();
      setLink(response.data.link);
    } catch (error) {
      notify({ type: 'error', title: `دریافت وضعیت ${serviceLabel} ناموفق بود`, message: error instanceof Error ? error.message : undefined });
    } finally {
      setBusy(null);
    }
    // endpoint is intentionally reconstructed from stable scalar props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resource, resourceId]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { if (initialLink !== undefined) setLink(initialLink); }, [initialLink]);

  const push = async (force = false) => {
    setBusy('push');
    try {
      const response = await endpoint.push(force);
      setLink(response.data.link);
      notify({ type: 'success', title: `نسخه به ${serviceLabel} ارسال شد`, message: 'پیوند فایل گوگل روی همین رکورد بومی ثبت و وضعیت همگام‌سازی به‌روز شد.' });
      await onChanged?.();
    } catch (error) {
      if (error instanceof ApiError && error.status === 409 && !force
        && window.confirm(`${error.message}\n\nارسال اجباری، نسخه فعلی گوگل را با نسخه تدبیر جایگزین می‌کند. ادامه می‌دهید؟`)) {
        setBusy(null);
        await push(true);
        return;
      }
      notify({ type: 'error', title: `ارسال به ${serviceLabel} ناموفق بود`, message: error instanceof Error ? error.message : undefined });
    } finally {
      setBusy(null);
    }
  };

  const pull = async (force = false) => {
    setBusy('pull');
    try {
      const response = await endpoint.pull(force);
      setLink(response.data.link);
      const summary = response.data.summary;
      notify({
        type: 'success',
        title: `آخرین تغییرات ${serviceLabel} دریافت شد`,
        message: summary
          ? `${summary.created.toLocaleString('fa-IR')} ردیف جدید، ${summary.updated.toLocaleString('fa-IR')} ردیف به‌روزشده و ${summary.deleted.toLocaleString('fa-IR')} ردیف حذف‌شده در نسخه ممیزی ثبت شد.`
          : 'تغییرات به‌عنوان نسخه جدید و قابل ممیزی در تدبیر ثبت شد.',
      });
      await onChanged?.();
    } catch (error) {
      if (error instanceof ApiError && error.status === 409 && !force
        && window.confirm(`${error.message}\n\nدریافت اجباری، محتوای فعلی گوگل را به‌عنوان نسخه جدید وارد تدبیر می‌کند. ادامه می‌دهید؟`)) {
        setBusy(null);
        await pull(true);
        return;
      }
      notify({ type: 'error', title: `دریافت از ${serviceLabel} ناموفق بود`, message: error instanceof Error ? error.message : undefined });
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async () => {
    if (!link || !window.confirm(`اتصال این رکورد به ${serviceLabel} قطع شود؟ فایل گوگل حذف نخواهد شد.`)) return;
    setBusy('disconnect');
    try {
      await endpoint.disconnect();
      setLink(null);
      notify({ type: 'success', title: 'اتصال Google Workspace قطع شد', message: 'فایل گوگل دست‌نخورده باقی ماند و فقط پیوند آن با تدبیر حذف شد.' });
      await onChanged?.();
    } catch (error) {
      notify({ type: 'error', title: 'قطع اتصال ناموفق بود', message: error instanceof Error ? error.message : undefined });
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50/70 to-emerald-50/40 p-4" aria-label={`اتصال ${serviceLabel}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-blue-600 shadow-sm"><ServiceIcon className="h-5 w-5" /></span>
          <div className="min-w-0">
            <h3 className="text-xs font-black text-slate-900">ویرایش اختیاری با {serviceLabel}</h3>
            <p className="mt-1 text-[10px] leading-5 text-slate-600">نسخه بومی تدبیر مرجع اصلی است؛ ارسال و دریافت فقط با اقدام صریح شما انجام می‌شود.</p>
            {link && <p className="mt-1 truncate text-[10px] font-bold text-emerald-700">متصل به «{link.name}» · {formatSyncTime(link.last_synced_at)}</p>}
          </div>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[9px] font-black ${link ? 'bg-emerald-100 text-emerald-700' : available ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-800'}`}>
          {busy === 'status' ? 'در حال بررسی…' : link ? 'متصل' : available ? 'آماده اتصال' : 'اتصال سرور آماده نیست'}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {link && <a href={link.web_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 py-2 text-[10px] font-bold text-blue-700 hover:bg-blue-50"><ExternalLink className="h-3.5 w-3.5" />بازکردن در Google</a>}
        {canEdit && <button type="button" onClick={() => void push()} disabled={!available || busy !== null} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">{busy === 'push' ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : link ? <RefreshCw className="h-3.5 w-3.5" /> : <Upload className="h-3.5 w-3.5" />}ارسال نسخه به گوگل</button>}
        {canEdit && link && <button type="button" onClick={() => void pull()} disabled={!available || busy !== null} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-[10px] font-bold text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50">{busy === 'pull' ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}دریافت آخرین تغییرات</button>}
        {canEdit && link && <button type="button" onClick={() => void disconnect()} disabled={busy !== null} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-2 text-[10px] font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-50">{busy === 'disconnect' ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Unlink className="h-3.5 w-3.5" />}قطع اتصال</button>}
      </div>
      {!canEdit && <p className="mt-2 text-[9px] text-slate-500">برای ارسال یا دریافت نسخه، مجوز ویرایش این رکورد لازم است.</p>}
    </section>
  );
}
