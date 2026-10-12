import React, { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Database, Download, HardDrive, RefreshCw, ShieldAlert, Trash2, Upload, Zap } from 'lucide-react';
import { Button, Input, LoadingState } from '../common/Primitives';
import { maintenanceApi, type MaintenanceOverview } from '../../api/maintenance';
import { useApp } from '../../context/AppContext';
import { runtime } from '../../config/runtime';
import { formatPersianIsoDateTime } from '../../utils/date';
import { formatBytesFa } from '../../utils/bytes';

/**
 * «فایل‌ها، پشتیبان و نگهداری» — تب تنظیمات برای کارهایی که پیش‌تر فقط با SSH
 * انجام می‌شد: تغییر محل ذخیرهٔ فایل‌ها، ساخت و دانلود پشتیبان پایگاه‌داده و
 * بازگردانی آن. همهٔ اعداد از سرور خوانده می‌شوند؛ هیچ مقدار نمایشی ساختگی نیست.
 */
export function StorageBackupPanel() {
  const { notify, notifyApiError } = useApp();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);

  const [filesRoot, setFilesRoot] = useState('');
  const [relocateOnSave, setRelocateOnSave] = useState(true);
  const [label, setLabel] = useState('');
  const [withFiles, setWithFiles] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<string | null>(null);
  const [restoreConfirm, setRestoreConfirm] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [automation, setAutomation] = useState<string | null>(null);

  const overview = useQuery({
    queryKey: ['maintenance', 'overview'],
    queryFn: ({ signal }) => maintenanceApi.overview(signal),
    enabled: !runtime.demoMode,
    staleTime: 15_000,
  });

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['maintenance', 'overview'] });
  const data: MaintenanceOverview | undefined = overview.data?.data;

  const run = async (key: string, action: () => Promise<string>, scope: string, title: string) => {
    setBusy(key);
    try {
      const message = await action();
      notify({ type: 'success', title, message });
      refresh();
    } catch (error) {
      notifyApiError(scope, error, title);
    } finally {
      setBusy(null);
    }
  };

  if (runtime.demoMode) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-2xs">
        در حالت نمایشی، نگهداری پایگاه‌داده و فایل‌ها غیرفعال است. روی نصب واقعی، همین صفحه پشتیبان‌گیری و بازگردانی را انجام می‌دهد.
      </div>
    );
  }

  if (overview.isPending) return <LoadingState label="در حال خواندن وضعیت ذخیره‌سازی…" />;

  if (overview.isError || !data) {
    return (
      <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-2xs">
        <p className="text-sm font-bold text-rose-700">وضعیت نگهداری سامانه خوانده نشد.</p>
        <p className="text-xs leading-6 text-slate-500">اتصال سرور و مجوز «مدیریت تنظیمات» را بررسی کنید و دوباره تلاش کنید.</p>
        <Button variant="secondary" onClick={() => void overview.refetch()}><RefreshCw className="h-4 w-4" />تلاش مجدد</Button>
      </div>
    );
  }

  const { storage, database, backups, backup_root: backupRoot, limits } = data;
  const sourceLabel = storage.source === 'settings' ? 'تنظیمات همین پنل' : storage.source === 'env' ? 'متغیر محیطی هاست' : 'پیش‌فرض سامانه';
  const uploadLimit = Math.min(limits.upload_max_filesize || 0, limits.post_max_size || 0);

  return (
    <div className="space-y-5">
      {/* ── محل ذخیرهٔ فایل‌ها ── */}
      <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-2xs sm:p-6">
        <header className="flex items-start gap-3 border-b border-slate-100 pb-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-indigo-100 bg-indigo-50 text-indigo-600"><HardDrive className="h-5 w-5" /></span>
          <div>
            <h3 className="text-sm font-black text-slate-900">محل ذخیرهٔ فایل‌ها</h3>
            <p className="mt-1 text-[11px] text-slate-500">فایل‌های آپلودی باید بیرون از پوشهٔ نرم‌افزار بمانند تا به‌روزرسانی سامانه آن‌ها را پاک نکند. مسیر را همین‌جا تعیین کنید؛ نیازی به SSH نیست.</p>
          </div>
        </header>

        <div className="grid gap-3 text-xs sm:grid-cols-2">
          <InfoRow label="مسیر فعلی" value={<bdi className="font-mono text-[11px]">{storage.files_root}</bdi>} />
          <InfoRow label="منبع این مسیر" value={sourceLabel} />
          <InfoRow label="وضعیت نوشتن" value={storage.writable ? <span className="text-emerald-700">قابل نوشتن</span> : <span className="text-rose-700">بدون دسترسی نوشتن</span>} />
          <InfoRow label="فضای آزاد" value={formatBytesFa(storage.free_bytes ?? 0, 'نامشخص', 0)} />
          <InfoRow label="جایگاه" value={storage.inside_application ? <span className="text-amber-700">داخل پوشهٔ نرم‌افزار</span> : <span className="text-emerald-700">بیرون از نرم‌افزار</span>} />
          <InfoRow label="فایل‌های مسیر قبلی" value={`${storage.legacy_files.toLocaleString('fa-IR')} فایل · ${formatBytesFa(storage.legacy_bytes)}`} />
        </div>

        {storage.inside_application && (
          <p className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-[11px] leading-6 text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            این مسیر داخل پوشهٔ نرم‌افزار است؛ با به‌روزرسانی ممکن است از دست برود. مسیر پیشنهادی زیر بیرون از نرم‌افزار است.
          </p>
        )}

        <div className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-slate-700">مسیر تازهٔ فایل‌ها</span>
              <Input dir="ltr" value={filesRoot} onChange={event => setFilesRoot(event.target.value)} placeholder={storage.suggested_root} className="font-mono text-left" disabled={busy !== null} />
            </label>
            <Button variant="secondary" disabled={busy !== null || !storage.suggested_root} onClick={() => setFilesRoot(storage.suggested_root)}>مسیر پیشنهادی</Button>
          </div>
          <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600">
            <input type="checkbox" checked={relocateOnSave} onChange={event => setRelocateOnSave(event.target.checked)} disabled={busy !== null} />
            فایل‌های موجود هم به مسیر تازه منتقل شوند
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              action="save"
              loading={busy === 'storage'}
              disabled={busy !== null || !filesRoot.trim()}
              onClick={() => void run('storage', async () => {
                const result = await maintenanceApi.updateStorage(filesRoot.trim(), relocateOnSave);
                setFilesRoot(result.data.files_root);
                return result.message || 'محل ذخیرهٔ فایل‌ها ثبت شد.';
              }, 'storage', 'ثبت محل ذخیرهٔ فایل‌ها')}
            >ثبت مسیر</Button>
            {storage.pending_relocation > 0 && (
              <Button
                variant="secondary"
                loading={busy === 'relocate'}
                disabled={busy !== null}
                onClick={() => void run('relocate', async () => {
                  const result = await maintenanceApi.relocateStorage({ apply: true, limit: 200 });
                  return result.message || `انتقال انجام شد؛ ${result.data.processed.toLocaleString('fa-IR')} فایل بررسی شد.`;
                }, 'storage', 'انتقال فایل‌های موجود')}
              ><RefreshCw className="h-4 w-4" />ادامهٔ انتقال فایل‌ها ({(storage.pending_relocation).toLocaleString('fa-IR')})</Button>
            )}
          </div>
          <p className="text-[10px] leading-5 text-slate-500">انتقال در بسته‌های ۲۰۰ فایلی انجام می‌شود و هر بار تکرارشدنی است؛ تا وقتی همهٔ فایل‌ها منتقل نشده‌اند، دکمهٔ ادامه نمایش داده می‌شود.</p>
        </div>
      </section>

      {/* ── پشتیبان پایگاه‌داده ── */}
      <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-2xs sm:p-6">
        <header className="flex items-start gap-3 border-b border-slate-100 pb-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-indigo-100 bg-indigo-50 text-indigo-600"><Database className="h-5 w-5" /></span>
          <div>
            <h3 className="text-sm font-black text-slate-900">پشتیبان و بازگردانی پایگاه‌داده</h3>
            <p className="mt-1 text-[11px] text-slate-500">پشتیبان با PHP ساخته می‌شود (بدون mysqldump) و می‌توانید آن را از مرورگر دانلود یا از رایانه بارگذاری کنید. پیش از هر بازگردانی، یک پشتیبان ایمنی از وضعیت فعلی گرفته می‌شود.</p>
          </div>
        </header>

        <div className="grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
          <InfoRow label="پایگاه‌داده" value={`${database.driver}${database.name ? ` · ${database.name}` : ''}`} />
          <InfoRow label="حجم پایگاه‌داده" value={formatBytesFa(database.bytes ?? 0, 'نامشخص', 0)} />
          <InfoRow label="جدول‌ها" value={database.tables.toLocaleString('fa-IR')} />
          <InfoRow label="ردیف‌ها" value={database.rows.toLocaleString('fa-IR')} />
        </div>

        {database.table_names?.length ? (
          <details className="rounded-2xl border border-slate-100 bg-slate-50 p-3 text-[11px] text-slate-600">
            <summary className="cursor-pointer font-bold text-slate-700">فهرست جدول‌های پایگاه‌داده ({database.table_names.length.toLocaleString('fa-IR')})</summary>
            <p className="mt-2 flex flex-wrap gap-1.5" dir="ltr">
              {database.table_names.map(name => <span key={name} className="rounded-lg bg-white px-2 py-1 font-mono text-[10px] text-slate-500">{name}</span>)}
            </p>
          </details>
        ) : null}

        <div className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-slate-700">برچسب پشتیبان (اختیاری)</span>
              <Input value={label} onChange={event => setLabel(event.target.value)} maxLength={32} placeholder="نمونه: قبل از بازگردانی محتوا" disabled={busy !== null} />
            </label>
            <Button
              variant="secondary"
              loading={busy === 'backup'}
              disabled={busy !== null}
              onClick={() => void run('backup', async () => {
                const result = await maintenanceApi.createBackup({ label: label.trim() || undefined, include_files: withFiles });
                setLabel('');
                return result.message || 'پشتیبان ساخته شد.';
              }, 'maintenance', 'ساخت پشتیبان')}
            ><RefreshCw className="h-4 w-4" />ساخت پشتیبان تازه</Button>
          </div>
          <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600">
            <input type="checkbox" checked={withFiles} onChange={event => setWithFiles(event.target.checked)} disabled={busy !== null} />
            فایل‌های آپلودی هم آرشیو شوند (حجیم‌تر و کندتر)
          </label>
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-200/70 pt-3">
            <input
              ref={fileInput}
              type="file"
              accept=".gz,application/gzip"
              className="hidden"
              onChange={event => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (!file) return;
                void run('upload', async () => {
                  const result = await maintenanceApi.uploadBackup(file);
                  return result.message || 'فایل پشتیبان بارگذاری شد.';
                }, 'maintenance', 'بارگذاری پشتیبان');
              }}
            />
            <Button variant="secondary" loading={busy === 'upload'} disabled={busy !== null} onClick={() => fileInput.current?.click()}><Upload className="h-4 w-4" />بارگذاری فایل پشتیبان</Button>
            <span className="text-[10px] text-slate-500">
              پوشهٔ پشتیبان: <bdi className="font-mono">{backupRoot.path}</bdi> — نگه‌داشت {backupRoot.keep.toLocaleString('fa-IR')} نسخهٔ آخر
              {backupRoot.inside_application ? ' (داخل نرم‌افزار؛ مسیر را بیرون ببرید)' : ''}
              {uploadLimit > 0 ? ` · حد بارگذاری ${formatBytesFa(uploadLimit, '—')}` : ''}
            </span>
          </div>
        </div>

        {backups.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500">هنوز پشتیبانی ساخته نشده است.</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr><th className="p-3">فایل</th><th className="p-3">زمان</th><th className="p-3">حجم</th><th className="p-3">ردیف</th><th className="p-3">وضعیت</th><th className="p-3">عملیات</th></tr>
              </thead>
              <tbody>
                {backups.map(item => (
                  <React.Fragment key={item.file}>
                    <tr className="border-t border-slate-100">
                      <td className="p-3"><bdi className="font-mono text-[10px] text-slate-600">{item.file}</bdi></td>
                      <td className="p-3 text-slate-500">{formatPersianIsoDateTime(item.created_at)}</td>
                      <td className="p-3 text-slate-500">{formatBytesFa(item.bytes)}</td>
                      <td className="p-3 text-slate-500">{item.rows === null || item.rows === undefined ? '—' : item.rows.toLocaleString('fa-IR')}</td>
                      <td className="p-3">
                        {item.verified === true && <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />سالم</span>}
                        {item.verified === false && <span className="inline-flex items-center gap-1 text-rose-700"><ShieldAlert className="h-3.5 w-3.5" />مطابقت ندارد</span>}
                        {item.verified === null || item.verified === undefined ? <span className="text-slate-400">بدون اثر انگشت</span> : null}
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Button variant="ghost" className="!px-2 !py-1 text-[11px]" loading={busy === `download:${item.file}`} disabled={busy !== null} onClick={() => void run(`download:${item.file}`, async () => { await maintenanceApi.downloadBackup(item.file); return 'فایل پشتیبان در مرورگر دانلود شد.'; }, 'maintenance', 'دانلود پشتیبان')}>دانلود</Button>
                          <Button variant="ghost" className="!px-2 !py-1 text-[11px] text-rose-700" disabled={busy !== null} onClick={() => { setRestoreTarget(item.file); setRestoreConfirm(''); }}>بازگردانی</Button>
                          <Button
                            variant="ghost"
                            className="!px-2 !py-1 text-[11px] text-rose-700"
                            disabled={busy !== null}
                            onClick={() => {
                              if (!window.confirm(`فایل پشتیبان «${item.file}» پاک شود؟`)) return;
                              void run(`delete:${item.file}`, async () => {
                                const result = await maintenanceApi.deleteBackup(item.file);
                                return result.message || 'پشتیبان حذف شد.';
                              }, 'maintenance', 'حذف پشتیبان');
                            }}
                          ><Trash2 className="h-3.5 w-3.5" />حذف</Button>
                        </div>
                      </td>
                    </tr>
                    {restoreTarget === item.file && (
                      <tr className="border-t border-rose-100 bg-rose-50/60">
                        <td colSpan={6} className="p-4">
                          <div className="space-y-3">
                            <p className="flex items-start gap-2 text-[11px] font-bold leading-6 text-rose-900">
                              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                              بازگردانی، دادهٔ فعلی سامانه را با محتوای این پشتیبان جانشین می‌کند. پیش از اجرا، یک پشتیبان ایمنی خودکار ساخته می‌شود. برای تأیید، نام فایل را دقیقاً بنویسید.
                            </p>
                            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                              <label className="block space-y-1.5">
                                <span className="text-[11px] font-bold text-slate-700">تأیید نام فایل</span>
                                <Input dir="ltr" value={restoreConfirm} onChange={event => setRestoreConfirm(event.target.value)} placeholder={item.file} className="font-mono text-left" disabled={busy !== null} />
                              </label>
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  variant="danger"
                                  loading={busy === `restore:${item.file}`}
                                  disabled={busy !== null || restoreConfirm.trim() !== item.file}
                                  onClick={() => void run(`restore:${item.file}`, async () => {
                                    const result = await maintenanceApi.restoreBackup(item.file, restoreConfirm.trim());
                                    setRestoreTarget(null);
                                    setRestoreConfirm('');
                                    return result.message || 'بازگردانی انجام شد.';
                                  }, 'maintenance', 'بازگردانی پایگاه‌داده')}
                                >بازگردانی</Button>
                                <Button variant="secondary" disabled={busy !== null} onClick={() => { setRestoreTarget(null); setRestoreConfirm(''); }}>انصراف</Button>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── به‌روزرسانی دستی ── */}
      <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-2xs sm:p-6">
        <header className="flex items-start gap-3 border-b border-slate-100 pb-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-indigo-100 bg-indigo-50 text-indigo-600"><Zap className="h-5 w-5" /></span>
          <div>
            <h3 className="text-sm font-black text-slate-900">به‌روزرسانی خودکار، به‌صورت دستی</h3>
            <p className="mt-1 text-[11px] text-slate-500">اگر هاست شما cron یا زمان‌بند ندارد، این دکمه همان کارهای زمان‌بندی‌شده را انجام می‌دهد: هم‌گام‌سازی وضعیت «تأخیر»، ساخت یادآوری‌های سرسید‌شده و ارسال صف بله. تکرار آن اعلان تکراری نمی‌سازد.</p>
          </div>
        </header>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            loading={busy === 'automation'}
            disabled={busy !== null}
            onClick={() => {
              setAutomation(null);
              void run('automation', async () => {
                const result = await maintenanceApi.runAutomation();
                const { deadlines, notifications, bale } = result.data;
                setAutomation(
                  `وضعیت تأخیر: ${deadlines.due.toLocaleString('fa-IR')} پرونده سرسید‌شده · یادآوری‌ها: ${notifications.reminders.toLocaleString('fa-IR')} مورد` +
                  (bale.enabled ? ` · صف بله: ${bale.sent.toLocaleString('fa-IR')} ارسال` : ' · ربات بله فعال نیست'),
                );
                return result.message || 'به‌روزرسانی انجام شد.';
              }, 'maintenance', 'به‌روزرسانی خودکار');
            }}
          ><Zap className="h-4 w-4" />اجرای به‌روزرسانی</Button>
          {automation && <span className="text-[11px] font-bold text-slate-600">{automation}</span>}
        </div>
      </section>

      <p className="px-1 text-[10px] leading-5 text-slate-500">
        برای بازگردانی از خط فرمان هم می‌توانید از <bdi className="font-mono">php artisan tadbir:restore &lt;file&gt; --confirm=&lt;name&gt;</bdi> استفاده کنید؛ مسیر پشتیبان در همین صفحه نمایش داده می‌شود.
      </p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 px-3.5 py-3">
      <span className="block text-[10px] font-bold text-slate-500">{label}</span>
      <span className="mt-1 block break-words text-xs font-bold text-slate-800">{value}</span>
    </div>
  );
}
