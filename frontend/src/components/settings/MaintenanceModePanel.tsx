import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, ShieldCheck, Wrench } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { settingsApi } from '../../api/settings';
import { apiErrorMessage } from '../../api/errors';

interface MaintenanceValue {
  enabled: boolean;
  message: string;
  startedAt?: string | null;
  updatedBy?: string | null;
}

const EMPTY: MaintenanceValue = { enabled: false, message: '', startedAt: null, updatedBy: null };
const DEFAULT_MESSAGE = 'سامانه در حال به‌روزرسانی و تعمیر است؛ لطفاً چند دقیقهٔ دیگر دوباره تلاش کنید.';

/** نمایشِ زمانِ شروع تعمیر به وقت محلی؛ مقدار نامعتبر نمایش داده نمی‌شود. */
function readableDate(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

/**
 * پنل «حالت تعمیر» در تنظیمات.
 *
 * روشن‌کردن این گزینه همهٔ کاربرانِ بدون نقش «مدیریت کل سیستم» را از سامانه
 * بیرون می‌گذارد؛ بنابراین تنها همان نقش این پنل را تغییر می‌دهد، پیش از روشن
 * شدن یک مرحلهٔ تأیید وجود دارد و پیامِ نمایشیِ صفحهٔ تعمیر هم همین‌جا نوشته
 * می‌شود تا کاربران بدانند سامانه چه زمانی برمی‌گردد.
 */
export const MaintenanceModePanel: React.FC = () => {
  const { currentUser, notify } = useApp();
  const isSystemAdmin = currentUser.role === 'admin';

  const [value, setValue] = useState<MaintenanceValue>(EMPTY);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setLoadError('');
    void settingsApi.get<MaintenanceValue>('maintenance')
      .then(response => {
        if (!active) return;
        const next = { ...EMPTY, ...(response.data.value || {}) };
        setValue(next);
        setMessage(next.message || '');
      })
      .catch(error => { if (active) setLoadError(apiErrorMessage(error, 'دریافت وضعیت حالت تعمیر ناموفق بود.')); })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, []);

  const save = async (nextEnabled: boolean) => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const response = await settingsApi.update<MaintenanceValue>('maintenance', {
        enabled: nextEnabled,
        message: message.trim(),
      });
      const next = { ...EMPTY, ...(response.data.value || {}) };
      setValue(next);
      setMessage(next.message || '');
      setIsConfirming(false);
      notify({
        type: 'success',
        title: nextEnabled ? 'حالت تعمیر روشن شد' : 'حالت تعمیر خاموش شد',
        message: nextEnabled
          ? 'تنها کاربران با نقش مدیریت کل سیستم می‌توانند وارد شوند؛ بقیه صفحهٔ تعمیر را می‌بینند.'
          : 'دسترسی همهٔ کاربران به سامانه بازگشت.',
      });
    } catch (error) {
      notify({
        type: 'error',
        title: 'ذخیرهٔ حالت تعمیر انجام نشد',
        message: apiErrorMessage(error, 'ذخیرهٔ وضعیت حالت تعمیر ناموفق بود.'),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const startedAt = readableDate(value.startedAt);

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-3xl border border-slate-200 bg-white p-5 shadow-2xs">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-amber-50 text-amber-600 ring-1 ring-amber-100">
          <Wrench className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-extrabold text-slate-900">حالت تعمیر سامانه</h3>
          <p className="mt-1 text-xs leading-6 text-slate-500">
            با روشن‌بودن این گزینه، همهٔ کاربران به‌جز نقش «مدیریت کل سیستم» نمی‌توانند وارد شوند یا از سامانه
            استفاده کنند و به‌جای آن، صفحهٔ حالت تعمیر را می‌بینند. نشست‌های بازِ کاربران عادی هم بسته می‌شود.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 rounded-3xl border border-slate-200 bg-white p-8 text-xs text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          <span>در حال دریافت وضعیت حالت تعمیر…</span>
        </div>
      ) : loadError ? (
        <div className="rounded-3xl border border-rose-200 bg-rose-50 p-5 text-xs leading-6 text-rose-700" role="alert">
          {loadError}
        </div>
      ) : !isSystemAdmin ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-5 text-xs leading-6 text-slate-600">
          فقط کاربران با نقش «مدیریت کل سیستم» می‌توانند حالت تعمیر را روشن یا خاموش کنند.
          {value.enabled && <p className="mt-2 font-bold text-amber-700">وضعیت کنونی: حالت تعمیر فعال است.</p>}
        </div>
      ) : (
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
          <div className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 ${
            value.enabled ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'
          }`}>
            <div className="flex items-center gap-2 text-xs font-bold">
              {value.enabled
                ? <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />
                : <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />}
              <span className={value.enabled ? 'text-amber-800' : 'text-emerald-800'}>
                {value.enabled ? 'حالت تعمیر فعال است؛ فقط مدیر کل سیستم دسترسی دارد.' : 'حالت تعمیر خاموش است؛ همهٔ کاربران دسترسی دارند.'}
              </span>
            </div>
            <div className="text-[11px] text-slate-500 space-y-0.5 text-left">
              {startedAt && <p>شروع: {startedAt}</p>}
              {value.updatedBy && <p>آخرین تغییر: {value.updatedBy}</p>}
            </div>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-slate-700">پیام صفحهٔ تعمیر</span>
            <textarea
              value={message}
              onChange={event => setMessage(event.target.value)}
              rows={3}
              maxLength={500}
              placeholder={DEFAULT_MESSAGE}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-6 text-slate-800 outline-hidden focus:border-indigo-400 focus:bg-white"
            />
            <span className="mt-1 block text-[11px] text-slate-400">
              این متن برای کاربران نمایش داده می‌شود؛ اگر خالی بماند، متن پیش‌فرضِ «{DEFAULT_MESSAGE}» نشان داده می‌شود.
            </span>
          </label>

          {isConfirming ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 space-y-3" role="alertdialog" aria-label="تأیید روشن‌شدن حالت تعمیر">
              <p className="text-xs leading-6 text-rose-800">
                با تأیید، همهٔ کاربران به‌جز شما (مدیریت کل سیستم) از سامانه بیرون می‌مانند و تا خاموش‌کردن این گزینه
                فقط شما می‌توانید وارد شوید. ادامه می‌دهید؟
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void save(true)}
                  disabled={isSaving}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-60"
                >
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Wrench className="h-4 w-4" aria-hidden="true" />}
                  <span>بله، حالت تعمیر را روشن کن</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsConfirming(false)}
                  disabled={isSaving}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                >
                  انصراف
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {value.enabled ? (
                <>
                  <button
                    type="button"
                    onClick={() => void save(false)}
                    disabled={isSaving}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
                    <span>خاموش کردن حالت تعمیر</span>
                  </button>
                  {message.trim() !== (value.message || '').trim() && (
                    <button
                      type="button"
                      onClick={() => void save(true)}
                      disabled={isSaving}
                      className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                    >
                      ذخیرهٔ پیام جدید
                    </button>
                  )}
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsConfirming(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-white shadow-md shadow-amber-200 hover:bg-amber-600"
                >
                  <Wrench className="h-4 w-4" aria-hidden="true" />
                  <span>روشن کردن حالت تعمیر</span>
                </button>
              )}
            </div>
          )}

          <p className="flex items-start gap-1.5 text-[11px] leading-5 text-slate-400">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>این گزینه روی ورود، نشست‌های باز و همهٔ درخواست‌های API اعمال می‌شود؛ خروج از حساب برای کاربران مسدود همیشه ممکن است.</span>
          </p>
        </div>
      )}
    </div>
  );
};
