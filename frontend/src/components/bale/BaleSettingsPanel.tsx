import React, { useEffect, useRef, useState } from 'react';
import { Bot, Copy, ExternalLink, RefreshCw, ShieldCheck } from 'lucide-react';
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
  const webhookInput = useRef<HTMLInputElement>(null);
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
  const copyWebhook = async () => {
    if (!state?.webhook_url) return;
    try {
      await navigator.clipboard.writeText(state.webhook_url);
      setNotice('آدرس کپی شد. توجه: دریافت Webhook هنوز غیرفعال است؛ فعلاً آن را در بله ثبت نکنید.');
    } catch {
      webhookInput.current?.focus();
      webhookInput.current?.select();
      setNotice('کپی خودکار مجاز نبود. آدرس انتخاب شده است؛ آن را دستی کپی کنید. دریافت Webhook هنوز غیرفعال است.');
    }
  };
  return <section className="mt-6 border-t border-slate-200 pt-6 space-y-4" dir="rtl">
    <div className="flex items-center gap-3"><span className="p-3 rounded-2xl bg-emerald-50 text-emerald-700"><Bot size={24}/></span><div><h3 className="font-bold text-slate-900">ربات بله</h3><p className="text-xs text-slate-500 mt-1">اتصال امن، وظایف، اعلان‌ها و ثبت دارایی</p></div><span className="mr-auto rounded-full px-3 py-1 text-xs bg-slate-100">{state ? labels[state.connection_status] : 'در حال دریافت'}</span></div>
    <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 text-xs leading-7 text-amber-900">
      <strong>هاست بدون Cron و SSH:</strong> در حالت دستی، پیام‌های کاربران فقط با دکمهٔ «پردازش یک نوبت» دریافت و پاسخ داده می‌شوند؛ بستن پنل، پردازش خودکار ایجاد نمی‌کند. برای فعالیت پیوسته باید زمان‌بند بیرونی، مسیر محافظت‌شده را فراخوانی کند.
      <p>اعلان جدید هنگام ثبت ارسال می‌شود؛ یادآوری جلسه با دکمهٔ جزئیات جلسه اجرا می‌شود. فرم دارایی به اتصال تیم–جدول نیاز دارد. انتشار کانال هنوز فعال نیست.</p>
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
      <button className={button} disabled={busy || !state?.enabled || state.connection_status !== 'connected'} onClick={() => void run(async () => { await baleApi.deliver(); return baleApi.settings(); }, 'ارسال محدود صف اجرا شد؛ شمارنده‌ها را بررسی کنید. پیام نامشخص دوباره ارسال نمی‌شود.')}>ارسال صف بدون دریافت پیام</button>
      <button className={button} disabled={busy} onClick={() => void run(baleApi.settings, 'وضعیت به‌روز شد.')} aria-label="به‌روزرسانی وضعیت"><RefreshCw size={15}/></button>
    </div>
    <div className="bg-slate-50 rounded-2xl p-4 text-xs leading-7">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong>آدرس و راهنمای تنظیم Webhook</strong>
        <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-amber-800">دریافت غیرفعال</span>
      </div>
      <p id="bale-webhook-warning" className="mt-2">این آدرس هنوز آمادهٔ دریافت پیام نیست و پاسخ 503 می‌دهد؛ فعلاً آن را در بله ثبت نکنید. تا تأیید روش امن احراز اصالت، دریافت پیام با getUpdates انجام می‌شود.</p>
      <label htmlFor="bale-webhook-url" className="mt-3 block font-bold text-slate-700">آدرس عمومی Webhook سامانه</label>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input id="bale-webhook-url" ref={webhookInput} type="text" readOnly dir="ltr" value={state?.webhook_url ?? ''} aria-describedby="bale-webhook-warning" placeholder={state ? 'آدرس HTTPS بک‌اند پیکربندی نشده است' : 'در حال دریافت آدرس…'} className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left font-mono text-xs" onFocus={e => e.currentTarget.select()}/>
        <button type="button" className={button+' inline-flex items-center justify-center gap-2'} disabled={!state?.webhook_url} onClick={() => void copyWebhook()}><Copy size={14}/>کپی آدرس</button>
      </div>
      {state && !state.webhook_url && <p className="mt-2 text-amber-800">در فایل .env، مقدار BALE_PUBLIC_BASE_URL یا APP_URL را روی آدرس HTTPS عمومی بک‌اند قرار دهید. برای بک‌اند جدا از پنل، دامنهٔ API را وارد کنید؛ پسوند /api/v1 لازم نیست.</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <a href="https://docs.bale.ai/#setwebhook" target="_blank" rel="noopener noreferrer" className={button+' inline-flex items-center gap-2 text-indigo-700'}><ExternalLink size={14}/>راهنمای رسمی تنظیم Webhook</a>
        <button type="button" className={button} disabled aria-describedby="bale-webhook-warning">ثبت Webhook در بله — فعلاً غیرفعال</button>
      </div>
      <p className="mt-2 text-slate-500">توکن ربات در این آدرس و لینک راهنما قرار نمی‌گیرد. موفق‌بودن تست ارتباط به معنی فعال‌بودن Webhook نیست.</p>
      {state?.connection_status === 'connected' && state.last_error === 'transport_unknown' && <p className="mt-2 rounded-xl bg-amber-50 p-3 text-amber-900">تست ارتباط موفق بوده، اما دریافت پیام با getUpdates ناموفق شده است. خطای transport_unknown به معنی نبود Webhook نیست و افزودن این آدرس، خطای دریافت را برطرف نمی‌کند؛ بررسی جداگانهٔ درخواست دریافت و زمان انتظار لازم است.</p>}
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
