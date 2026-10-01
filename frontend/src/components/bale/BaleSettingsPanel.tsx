import React, { useEffect, useState } from 'react';
import { BaleAutomationsPanel } from './BaleAutomationsPanel';
import {
  Activity, AlertTriangle, Bot, CheckCircle2, Clock3, ExternalLink, KeyRound,
  RotateCw, Send, ShieldCheck, Unplug, Webhook, Workflow,
} from 'lucide-react';
import { baleApi, BaleState } from '../../api/bale';
import { ApiResponse } from '../../api/client';
import { Button, Input, LoadingState } from '../common/Primitives';
import { baleDate, baleDeliveryLabel, baleErrorLabel } from './balePresentation';

const statusLabels: Record<string, string> = {
  connected: 'متصل و آماده', failed: 'اتصال ناموفق', untested: 'در انتظار بررسی', not_configured: 'تنظیم نشده',
};
type BaleTab = 'overview' | 'connection' | 'automations' | 'delivery';
const tabs: { id: BaleTab; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'وضعیت', icon: <Activity className="w-4 h-4" /> },
  { id: 'connection', label: 'اتصال', icon: <Webhook className="w-4 h-4" /> },
  { id: 'automations', label: 'خودکارسازی', icon: <Workflow className="w-4 h-4" /> },
  { id: 'delivery', label: 'گزارش ارسال', icon: <Send className="w-4 h-4" /> },
];

export function BaleSettingsPanel() {
  const [state, setState] = useState<BaleState | null>(null);
  const [activeTab, setActiveTab] = useState<BaleTab>('overview');
  const [enabled, setEnabled] = useState(false);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const apply = (next: BaleState) => { setState(next); setEnabled(next.enabled); };

  useEffect(() => {
    let active = true;
    const refresh = async (announceFailure = false) => {
      try {
        const response = await baleApi.settings();
        if (active) apply(response.data);
      } catch (caught) {
        if (active && announceFailure) setError(caught instanceof Error ? caught.message : 'دریافت تنظیمات ربات ناموفق بود.');
      }
    };
    void refresh(true);
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(false); }, 30_000);
    const visible = () => { if (document.visibilityState === 'visible') void refresh(false); };
    document.addEventListener('visibilitychange', visible);
    return () => { active = false; window.clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, []);

  const run = async (operation: () => Promise<ApiResponse<BaleState>>, message: string) => {
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await operation();
      apply(response.data);
      setNotice(message);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'عملیات ربات بله ناموفق بود.');
      try { apply((await baleApi.settings()).data); } catch { /* preserve the actionable operation error */ }
    } finally { setBusy(false); }
  };

  const saveAutomatic = async () => {
    const value = token.trim();
    const saved = await baleApi.save(enabled, value || undefined);
    if (!enabled) { setToken(''); return saved; }
    await baleApi.test();
    const activated = await baleApi.webhook(false);
    setToken('');
    return activated;
  };

  if (!state && !error) return <LoadingState label="در حال دریافت وضعیت ربات بله…" />;
  if (!state) return <section role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</section>;

  const connected = state.connection_status === 'connected';
  const webhookReady = connected && state.remote_webhook_matches;
  const runnerReady = state.retry_runner_recent;
  const pending = Number(state.outbox_counts.pending ?? 0);
  const failed = Number(state.outbox_counts.failed ?? 0);
  const unknown = Number(state.outbox_counts.unknown ?? 0);

  return <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xs" dir="rtl">
    <header className="flex flex-col justify-between gap-4 border-b border-slate-100 bg-white p-5 sm:flex-row sm:items-center sm:p-6">
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-white"><Bot className="w-6 h-6" /></span>
        <div><h3 className="text-lg font-black text-slate-900">ربات بله</h3><p className="mt-1 text-xs text-slate-500">اعلان، ورود امن و عملیات سازمانی کنترل‌شده</p></div>
      </div>
      <span className={`w-fit rounded-full border px-3 py-1.5 text-xs font-bold ${webhookReady ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
        {statusLabels[state.connection_status] ?? 'وضعیت نامشخص'}
      </span>
    </header>

    <nav aria-label="بخش‌های مدیریت ربات بله" className="flex gap-1 overflow-x-auto border-b border-slate-100 bg-slate-50/70 p-2">
      {tabs.map(tab => <button key={tab.id} type="button" aria-current={activeTab === tab.id ? 'page' : undefined} onClick={() => { setActiveTab(tab.id); setError(''); setNotice(''); }} className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-colors ${activeTab === tab.id ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:bg-white/70'}`}>{tab.icon}{tab.label}</button>)}
    </nav>

    <div className="space-y-5 p-5 sm:p-6">
      {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs leading-6 text-rose-800">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs leading-6 text-emerald-800">{notice}</p>}

      {activeTab === 'overview' && <>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatusCard label="اتصال به بله" value={connected ? 'سالم' : statusLabels[state.connection_status]} good={connected} />
          <StatusCard label="دریافت پیام" value={webhookReady ? 'Webhook فعال' : 'نیازمند ترمیم'} good={webhookReady} />
          <StatusCard label="تلاش مجدد ارسال" value={runnerReady ? 'فعال و اخیر' : 'بدون heartbeat'} good={runnerReady} />
          <StatusCard label="حساب‌های متصل" value={`${state.linked_users.toLocaleString('fa-IR')} حساب`} good={state.linked_users > 0} neutral={state.linked_users === 0} />
        </div>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white" aria-label="کاربران متصل به ربات بله">
          <div className="border-b border-slate-100 px-4 py-3"><h4 className="text-xs font-black text-slate-800">کاربران متصل به ربات</h4><p className="mt-1 text-[10px] text-slate-500">فهرست حساب‌هایی که اتصال شخصی بله را تکمیل کرده‌اند.</p></div>
          {state.linked_accounts.length ? <div className="divide-y divide-slate-100">{state.linked_accounts.map(account => <div key={account.user_id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs"><div><strong className="text-slate-800">{account.name}</strong><span dir="ltr" className="mr-2 font-normal text-slate-400">@{account.username}</span></div><div className="flex items-center gap-3 text-[10px]"><span className={account.notifications_enabled ? 'text-emerald-700' : 'text-slate-400'}>{account.notifications_enabled ? 'اعلان فعال' : 'اعلان خاموش'}</span><time className="text-slate-400">{baleDate(account.linked_at)}</time></div></div>)}</div> : <p className="p-6 text-center text-xs text-slate-500">هنوز کاربری حساب بله خود را متصل نکرده است.</p>}
        </section>

        {!webhookReady && state.enabled && <HealthNotice onClick={() => setActiveTab('connection')} text="دریافت خودکار کامل نیست. اتصال را از تب «اتصال» ترمیم کنید." />}
        {webhookReady && !runnerReady && <HealthNotice text="دریافت Webhook فعال است، اما سرویس زمان‌بندی تلاش مجدد heartbeat اخیر ندارد. تا اجرای scheduler هاست، پیام‌های محدودشده ممکن است در صف بمانند." />}
        {unknown > 0 && <HealthNotice onClick={() => setActiveTab('delivery')} text={`${unknown.toLocaleString('fa-IR')} ارسال نتیجهٔ نامشخص دارد و برای جلوگیری از پیام تکراری خودکار تکرار نشده است.`} />}

        <div className="grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
          <InfoCard label="آخرین دریافت" value={baleDate(state.last_received_at)} />
          <InfoCard label="آخرین ارسال موفق" value={baleDate(state.last_sent_at)} />
          <InfoCard label="آخرین heartbeat" value={baleDate(state.last_external_tick_at)} />
          <InfoCard label="پیام‌های در انتظار" value={pending.toLocaleString('fa-IR')} />
        </div>
        {state.last_error && <p className="rounded-xl bg-rose-50 p-3 text-xs leading-6 text-rose-800">آخرین خطای عملیاتی: {baleErrorLabel(state.last_error)}</p>}
      </>}

      {activeTab === 'connection' && <>
        <div className="flex items-start gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4">
          <Webhook className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" />
          <div><strong className="text-xs text-indigo-950">دریافت پیام فقط با Webhook خودکار انجام می‌شود</strong><p className="mt-1 text-[11px] leading-6 text-indigo-800">ذخیره، آزمون اتصال و ثبت آدرس امن در یک جریان انجام می‌شود. مسیر دریافت دستی در پنل وجود ندارد.</p></div>
        </div>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <label htmlFor="bale-token" className="mb-1.5 block text-xs font-bold text-slate-700">توکن ربات بله</label>
            <div className="relative"><KeyRound className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input id="bale-token" type="password" autoComplete="new-password" spellCheck={false} dir="ltr" value={token} onChange={event => setToken(event.target.value)} disabled={busy} placeholder={state.has_token ? 'توکن ذخیره شده است؛ برای حفظ آن خالی بگذارید' : 'توکن دریافتی از مدیریت ربات بله'} className="pr-9 font-mono text-left" /></div>
            <p className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-500"><ShieldCheck className="h-3.5 w-3.5" />توکن رمزگذاری می‌شود، دوباره نمایش داده نمی‌شود و در مرورگر باقی نمی‌ماند.</p>
          </div>
          <label className={`flex h-[var(--control-height)] min-h-[var(--control-height)] items-center gap-3 rounded-xl border px-4 text-xs font-bold ${enabled ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-slate-50 text-slate-600'} ${busy ? 'opacity-60' : 'cursor-pointer'}`}>
            <input type="checkbox" checked={enabled} disabled={busy} onChange={event => setEnabled(event.target.checked)} />فعال‌بودن ربات
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button loading={busy} disabled={enabled && !state.has_token && !token.trim()} onClick={() => void run(saveAutomatic, enabled ? 'ربات بررسی شد و دریافت خودکار فعال است.' : 'ربات غیرفعال شد.')}>ذخیره و فعال‌سازی خودکار</Button>
          <Button variant="secondary" disabled={busy || !state.has_token} onClick={() => void run(async () => { await baleApi.test(); return baleApi.settings(); }, 'آزمون فنی اتصال موفق بود.')}><CheckCircle2 className="w-4 h-4" />آزمون فنی اتصال</Button>
          <Button variant="secondary" disabled={busy || !state.enabled || !connected || !state.webhook_url} onClick={() => { if (window.confirm('آدرس محرمانهٔ دریافت خودکار تعویض شود؟')) void run(() => baleApi.webhook(true), 'آدرس امن جدید ثبت شد.'); }}><RotateCw className="w-4 h-4" />ترمیم Webhook</Button>
          <a href="https://docs.bale.ai/#setwebhook" target="_blank" rel="noopener noreferrer" className="ui-button ui-button-ghost"><ExternalLink className="w-4 h-4" />مستندات بله</a>
        </div>
        {state.bot_username && <p className="text-xs text-slate-500">ربات رسمی: <a className="text-indigo-700" href={`https://ble.ir/${state.bot_username}`} target="_blank" rel="noreferrer" dir="ltr">@{state.bot_username}</a></p>}
        {state.has_token && <div className="border-t border-slate-100 pt-4"><Button variant="ghost" className="text-rose-700" disabled={busy} onClick={() => { if (window.confirm('توکن ربات و اتصال حساب‌های بله حذف شود؟')) void run(baleApi.remove, 'اتصال ربات حذف شد.'); }}><Unplug className="w-4 h-4" />حذف اتصال ربات</Button></div>}
      </>}

      {activeTab === 'automations' && <BaleAutomationsPanel />}

      {activeTab === 'delivery' && <>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {(['pending', 'sent', 'failed', 'unknown', 'cancelled'] as const).map(status => <React.Fragment key={status}><InfoCard label={baleDeliveryLabel(status)} value={Number(state.outbox_counts[status] ?? 0).toLocaleString('fa-IR')} /></React.Fragment>)}
        </div>
        {pending > 0 && <p className="flex items-center gap-2 rounded-xl bg-amber-50 p-3 text-xs leading-6 text-amber-900"><Clock3 className="h-4 w-4 shrink-0" />قدیمی‌ترین پیام در انتظار: {baleDate(state.oldest_pending_at)}. ارسال با runner خودکار انجام می‌شود و دکمهٔ ارسال دستی وجود ندارد.</p>}
        {state.recent_errors.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">خطای ارسالی ثبت نشده است.</p> : <div className="overflow-hidden rounded-2xl border border-slate-200">
          <table className="w-full text-right text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="p-3">وضعیت</th><th className="p-3">شرح</th><th className="p-3">زمان</th></tr></thead><tbody>{state.recent_errors.map(item => <tr key={item.id} className="border-t border-slate-100"><td className="p-3 font-bold text-slate-700">{baleDeliveryLabel(item.status)}</td><td className="p-3 leading-6 text-slate-600">{baleErrorLabel(item.error_code)}</td><td className="p-3 text-slate-500">{baleDate(item.updated_at)}</td></tr>)}</tbody></table>
        </div>}
        {(failed > 0 || unknown > 0) && <p className="text-xs leading-6 text-slate-500">ارسال‌های «نتیجه نامشخص» خودکار تکرار نمی‌شوند. خطاهای قطعی نیز برای بررسی نگه داشته می‌شوند تا از ارسال تکراری جلوگیری شود.</p>}
      </>}
    </div>
  </section>;
}

function StatusCard({ label, value, good, neutral = false }: { label: string; value: string; good: boolean; neutral?: boolean }) {
  const tone = neutral ? 'border-slate-200 bg-slate-50 text-slate-700' : good ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-900';
  return <div className={`rounded-2xl border p-4 ${tone}`}><span className="text-[11px] opacity-75">{label}</span><strong className="mt-2 block text-sm">{value}</strong></div>;
}
function InfoCard({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3"><span className="text-slate-500">{label}</span><strong className="mt-1.5 block text-slate-800">{value}</strong></div>;
}
function HealthNotice({ text, onClick }: { text: string; onClick?: () => void }) {
  return <button type="button" onClick={onClick} disabled={!onClick} className="flex w-full items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-right text-xs leading-6 text-amber-900 disabled:cursor-default"><AlertTriangle className="mt-1 h-4 w-4 shrink-0" />{text}</button>;
}
