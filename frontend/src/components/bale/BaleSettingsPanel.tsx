import React, { useEffect, useState } from 'react';
import { Bot, RefreshCw, ShieldCheck } from 'lucide-react';
import { baleApi, BaleState } from '../../api/bale';
import { ApiResponse } from '../../api/client';

const labels: Record<string, string> = { connected: 'متصل', failed: 'ناموفق', untested: 'تست‌نشده', not_configured: 'تنظیم‌نشده' };
const date = (value: string | null) => value ? new Date(value).toLocaleString('fa-IR') : '—';
const button = 'rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold disabled:opacity-40 hover:bg-slate-50';

export function BaleSettingsPanel() {
  const [state, setState] = useState<BaleState | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const apply = (s: BaleState) => { setState(s); setEnabled(s.enabled); };
  useEffect(() => {
    let active = true;
    baleApi.settings().then(r => { if (active) apply(r.data); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, []);
  const run = async (operation: () => Promise<ApiResponse<BaleState>>, message: string) => {
    setBusy(true); setError(''); setNotice('');
    try { const response = await operation(); apply(response.data); setNotice(message); }
    catch (e) {
      setError(e instanceof Error ? e.message : 'عملیات ناموفق بود.');
      try { apply((await baleApi.settings()).data); } catch { /* keep the actionable original error */ }
    } finally { setBusy(false); }
  };
  return <section className="mt-6 border-t border-slate-200 pt-6 space-y-4" dir="rtl">
    <div className="flex items-center gap-3"><span className="p-3 rounded-2xl bg-emerald-50 text-emerald-700"><Bot size={24}/></span><div><h3 className="font-bold text-slate-900">ربات بله</h3><p className="text-xs text-slate-500 mt-1">اتصال امن حساب‌ها و عملیات وظایف • نسخهٔ پایه</p></div><span className="mr-auto rounded-full px-3 py-1 text-xs bg-slate-100">{state ? labels[state.connection_status] : 'در حال دریافت'}</span></div>
    <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 text-xs leading-7 text-amber-900">
      <strong>هاست بدون Cron و SSH:</strong> در حالت دستی، پیام‌های کاربران فقط با دکمهٔ «پردازش یک نوبت» دریافت و پاسخ داده می‌شوند؛ بستن پنل، پردازش خودکار ایجاد نمی‌کند. برای فعالیت پیوسته باید زمان‌بند بیرونی، مسیر محافظت‌شده را فراخوانی کند.
      <p>یادآوری جلسه، ارسال خودکار اعلان، ثبت دارایی و انتشار کانال هنوز در این نسخه فعال نیستند.</p>
    </div>
    {error && <p role="alert" className="text-sm text-rose-700 bg-rose-50 p-3 rounded-xl">{error}</p>}
    {notice && <p role="status" className="text-sm text-emerald-700">{notice}</p>}
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={enabled} disabled={busy || !state} onChange={e => setEnabled(e.target.checked)}/>فعال‌بودن ربات</label>
    <label className="block text-xs font-bold text-slate-700">توکن ربات (فقط ثبت یا تعویض)
      <input type="password" autoComplete="new-password" spellCheck={false} dir="ltr" value={token} onChange={e => setToken(e.target.value)} disabled={busy || !state} placeholder={state?.has_token ? '•••••••• — ذخیره شده؛ برای حفظ مقدار خالی بگذارید' : 'توکن را وارد کنید'} className="mt-2 w-full rounded-xl border border-slate-200 p-3 font-mono text-sm"/>
    </label>
    <p className="flex gap-2 text-xs text-slate-500"><ShieldCheck size={15}/>توکن رمزگذاری می‌شود و دوباره از API خوانده نمی‌شود. مقدار در مرورگر ذخیره نخواهد شد.</p>
    <div className="flex flex-wrap gap-2">
      <button className={button+' bg-indigo-600 text-white hover:bg-indigo-700'} disabled={busy || !state} onClick={() => { const value = token.trim(); setToken(''); void run(() => baleApi.save(enabled, value), 'تنظیمات ذخیره شد. پس از تغییر توکن، تست بات را اجرا کنید.'); }}>ذخیره تنظیمات</button>
      <button className={button} disabled={busy || !state?.has_token} onClick={() => void run(baleApi.test, 'getMe و getWebhookInfo با موفقیت بررسی شدند؛ هیچ پیامی برای اعضا ارسال نشد.')}>تست واقعی بات</button>
      <button className={button} disabled={busy || !state?.enabled || state.connection_status !== 'connected'} onClick={() => void run(baleApi.process, 'یک نوبت محدود پردازش انجام شد. برای پیام‌های باقی‌مانده دوباره اجرا کنید.')}>پردازش یک نوبت</button>
      <button className={button} disabled={busy} onClick={() => void run(baleApi.settings, 'وضعیت به‌روز شد.')} aria-label="به‌روزرسانی وضعیت"><RefreshCw size={15}/></button>
    </div>
    <div className="bg-slate-50 rounded-2xl p-4 text-xs leading-7">
      <strong>Webhook عمومی: غیرفعال امنیتی</strong>
      <p>تا تأیید روش رسمی احراز اصالت بله، هیچ درخواست ورودی Webhook پردازش نمی‌شود. دریافت از API رسمی با getUpdates انجام می‌شود.</p>
      {state?.remote_webhook_present && <div className="mt-2 text-amber-800">یک Webhook قبلاً روی ربات ثبت شده و مانع دریافت پیام است. <button className={button} disabled={busy} onClick={() => { if (window.confirm('Webhook فعلی حذف شود؟ دریافت توسط سرویس قبلی متوقف خواهد شد.')) void run(baleApi.polling, 'Webhook قبلی حذف شد؛ دریافت کوتاه فعال است.'); }}>حذف Webhook قبلی</button></div>}
    </div>
    {state && <>
      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
        {[
          ['آخرین تست', date(state.last_test_at)], ['آخرین پردازش', date(state.last_tick_at)], ['آخرین دریافت', date(state.last_received_at)],
          ['آخرین ارسال موفق', date(state.last_sent_at)], ['حساب‌های متصل', String(state.linked_users)],
          ['پیام‌های در انتظار', String(state.outbox_counts.pending || 0)], ['ناموفق / نامشخص', `${state.outbox_counts.failed || 0} / ${state.outbox_counts.unknown || 0}`],
          ['زمان‌بند بیرونی', state.runner_recent ? 'اخیراً اجرا شده' : state.runner_configured ? 'کلید تنظیم شده؛ اجرای اخیر تأیید نشده' : 'تنظیم نشده'],
        ].map(([key, value]) => <div key={key} className="p-3 rounded-xl border border-slate-100"><dt className="text-slate-500">{key}</dt><dd className="mt-2 font-bold">{value}</dd></div>)}
      </dl>
      {(state.last_error || state.last_test_error) && <p className="text-xs text-rose-700">آخرین خطای امن: {state.last_error || state.last_test_error}</p>}
      {state.recent_errors.length > 0 && <details className="text-xs"><summary className="cursor-pointer">خطاهای اخیر ارسال</summary><ul className="mt-2 space-y-2">{state.recent_errors.map(e => <li key={e.id}>#{e.id} — {e.status} — {e.error_code}</li>)}</ul><p className="mt-2">پیام با نتیجهٔ نامشخص خودکار تکرار نمی‌شود؛ ممکن است بله آن را دریافت کرده باشد.</p></details>}
      <button className={button+' text-rose-700'} disabled={busy || !state.has_token} onClick={() => { if (window.confirm('توکن حذف و اتصال همه کاربران قطع شود؟ این کار قابل بازگشت نیست.')) void run(baleApi.remove, 'اتصال ربات و کاربران حذف شد.'); }}>حذف اتصال ربات</button>
      {error && state.has_token && <button className={button+' text-rose-700 mr-2'} disabled={busy} onClick={() => { if (window.confirm('فقط توکن و اتصال‌های محلی حذف شوند؟ Webhook احتمالی بله حذف نخواهد شد. برای ابطال واقعی توکن باید از مدیریت ربات بله استفاده کنید.')) void run(baleApi.removeLocal, 'اتصال محلی حذف شد. حذف Webhook و ابطال توکن در بله تأیید نشده است.'); }}>حذف محلی در صورت عدم دسترسی به بله</button>}
    </>}
  </section>;
}
