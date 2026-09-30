import React, { useEffect, useState } from 'react';
import { BaleAutomationsPanel } from './BaleAutomationsPanel';
import { Bot, CheckCircle2, ExternalLink, KeyRound, RefreshCw, RotateCw, ShieldCheck, Unplug, Webhook } from 'lucide-react';
import { baleApi, BaleState } from '../../api/bale';
import { ApiResponse } from '../../api/client';
import { Button, Input, LoadingState } from '../common/Primitives';

const statusLabels: Record<string, string> = {
  connected: 'متصل و آماده', failed: 'اتصال ناموفق', untested: 'در انتظار بررسی', not_configured: 'تنظیم نشده',
};
const date = (value: string | null) => value ? new Date(value).toLocaleString('fa-IR') : 'هنوز ثبت نشده';

export function BaleSettingsPanel() {
  const [state, setState] = useState<BaleState | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const apply = (next: BaleState) => { setState(next); setEnabled(next.enabled); };

  useEffect(() => {
    let active = true;
    baleApi.settings().then(response => { if (active) apply(response.data); }).catch(caught => { if (active) setError(caught instanceof Error ? caught.message : 'دریافت تنظیمات ربات ناموفق بود.'); });
    return () => { active = false; };
  }, []);

  const run = async (operation: () => Promise<ApiResponse<BaleState>>, message: string) => {
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await operation();
      apply(response.data);
      setNotice(message);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'عملیات ربات بله ناموفق بود.');
      try { apply((await baleApi.settings()).data); } catch { /* keep the original actionable error */ }
    } finally { setBusy(false); }
  };

  const saveAutomatic = async () => {
    const value = token.trim();
    setToken('');
    const saved = await baleApi.save(enabled, value || undefined);
    if (!enabled) return saved;
    // حالت دریافت دستی در UI وجود ندارد: ذخیره، تست و ثبت Webhook یک عملیات خودکار است.
    await baleApi.test();
    return baleApi.webhook(false);
  };

  if (!state && !error) return <LoadingState label="در حال دریافت وضعیت ربات بله…" />;

  return <section className="bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-hidden" dir="rtl">
    <header className="p-5 sm:p-6 border-b border-slate-100 bg-gradient-to-l from-emerald-50/80 to-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <span className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-200"><Bot className="w-6 h-6" /></span>
        <div><h3 className="font-black text-slate-900 text-lg">ربات بله</h3><p className="text-xs text-slate-500 mt-1">اعلان‌ها، ورود امن و خودکارسازی عملیات سازمانی</p></div>
      </div>
      <span className={`w-fit rounded-full px-3 py-1.5 text-xs font-bold border ${state?.connection_status === 'connected' && state.remote_webhook_matches ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
        {state ? statusLabels[state.connection_status] : 'در حال دریافت'}
      </span>
    </header>

    <div className="p-5 sm:p-6 space-y-5">
      {error && <p role="alert" className="text-xs leading-6 text-rose-800 bg-rose-50 border border-rose-200 p-3 rounded-xl">{error}</p>}
      {notice && <p role="status" className="text-xs leading-6 text-emerald-800 bg-emerald-50 border border-emerald-200 p-3 rounded-xl">{notice}</p>}

      <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4 flex items-start gap-3">
        <Webhook className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
        <div><strong className="text-xs text-indigo-950">دریافت همیشه خودکار است</strong><p className="text-[11px] leading-6 text-indigo-800 mt-1">پس از ذخیره، اتصال بررسی و Webhook امن به‌طور خودکار ثبت می‌شود. برای دریافت پیام‌ها نیازی به پنل باز، Cron یا پردازش دستی نیست.</p></div>
      </div>

      <div className="grid lg:grid-cols-[1fr_auto] gap-4 items-end">
        <div>
          <label htmlFor="bale-token" className="block text-xs font-bold text-slate-700 mb-1.5">توکن ربات بله</label>
          <div className="relative"><KeyRound className="absolute right-3 top-3 w-4 h-4 text-slate-400" /><Input id="bale-token" type="password" autoComplete="new-password" spellCheck={false} dir="ltr" value={token} onChange={event => setToken(event.target.value)} disabled={busy || !state} placeholder={state?.has_token ? 'توکن ذخیره شده است؛ برای حفظ آن خالی بگذارید' : 'توکن دریافتی از مدیریت ربات بله'} className="pr-9 font-mono text-left" /></div>
          <p className="flex items-center gap-1.5 text-[10px] text-slate-500 mt-2"><ShieldCheck className="w-3.5 h-3.5" />توکن رمزگذاری می‌شود، دوباره نمایش داده نمی‌شود و در مرورگر باقی نمی‌ماند.</p>
        </div>
        <label className={`h-11 rounded-xl border px-4 flex items-center gap-3 text-xs font-bold ${enabled ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-slate-50 text-slate-600'} ${busy ? 'opacity-60' : 'cursor-pointer'}`}>
          <input type="checkbox" checked={enabled} disabled={busy || !state} onChange={event => setEnabled(event.target.checked)} />فعال‌بودن ربات
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button loading={busy} disabled={!state || (enabled && !state.has_token && !token.trim())} onClick={() => void run(saveAutomatic, enabled ? 'ربات بررسی شد و دریافت خودکار با موفقیت فعال است.' : 'ربات غیرفعال شد.')}>ذخیره و فعال‌سازی خودکار</Button>
        <Button variant="secondary" disabled={busy || !state?.has_token} onClick={() => void run(async () => { await baleApi.test(); return baleApi.settings(); }, 'اتصال ربات با موفقیت بررسی شد.')}><CheckCircle2 className="w-4 h-4" />بررسی اتصال</Button>
        <Button variant="secondary" disabled={busy || !state?.enabled || state.connection_status !== 'connected' || !state.webhook_url} onClick={() => { if (window.confirm('آدرس محرمانهٔ دریافت خودکار تعویض شود؟')) void run(() => baleApi.webhook(true), 'آدرس امن جدید ثبت شد.'); }}><RotateCw className="w-4 h-4" />بازسازی Webhook</Button>
        <Button variant="ghost" disabled={busy} aria-label="به‌روزرسانی وضعیت" onClick={() => void run(baleApi.settings, 'وضعیت به‌روز شد.')}><RefreshCw className="w-4 h-4" /></Button>
        <a href="https://docs.bale.ai/#setwebhook" target="_blank" rel="noopener noreferrer" className="ui-button ui-button-ghost"><ExternalLink className="w-4 h-4" />مستندات بله</a>
      </div>

      {state && <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
        <div className="p-3 rounded-2xl border border-slate-100 bg-slate-50"><span className="text-slate-500">دریافت خودکار</span><strong className="block mt-1.5 text-slate-800">{state.remote_webhook_matches ? 'فعال و منطبق' : 'نیازمند فعال‌سازی'}</strong></div>
        <div className="p-3 rounded-2xl border border-slate-100 bg-slate-50"><span className="text-slate-500">آخرین دریافت</span><strong className="block mt-1.5 text-slate-800">{date(state.last_received_at)}</strong></div>
        <div className="p-3 rounded-2xl border border-slate-100 bg-slate-50"><span className="text-slate-500">آخرین ارسال موفق</span><strong className="block mt-1.5 text-slate-800">{date(state.last_sent_at)}</strong></div>
        <div className="p-3 rounded-2xl border border-slate-100 bg-slate-50"><span className="text-slate-500">حساب‌های متصل</span><strong className="block mt-1.5 text-slate-800">{state.linked_users.toLocaleString('fa-IR')} حساب</strong></div>
      </div>}

      {state?.bot_username && <p className="text-xs text-slate-500">شناسه ربات: <a className="font-bold text-indigo-700" href={`https://ble.ir/${state.bot_username}`} target="_blank" rel="noreferrer" dir="ltr">@{state.bot_username}</a></p>}
      {state?.last_error && <p className="text-xs text-rose-700">آخرین وضعیت ناموفق: {state.last_error}</p>}

      {state?.has_token && <div className="pt-4 border-t border-slate-100"><Button variant="ghost" className="text-rose-700" disabled={busy} onClick={() => { if (window.confirm('توکن ربات و اتصال حساب‌های بله حذف شود؟')) void run(baleApi.remove, 'اتصال ربات حذف شد.'); }}><Unplug className="w-4 h-4" />حذف اتصال ربات</Button></div>}

      {state && <BaleAutomationsPanel />}
    </div>
  </section>;
}
