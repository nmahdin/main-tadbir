import React, { useEffect, useState } from 'react';
import { Bell, Bot, CheckCircle2, Copy, Link2, LoaderCircle, Unlink } from 'lucide-react';
import { baleApi, BaleAccount } from '../../api/bale';
import { Button } from '../common/Primitives';

export function BaleAccountPanel() {
  const [account, setAccount] = useState<BaleAccount | null>(null);
  const [code, setCode] = useState<{ code: string; expires_at: string } | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [testResult, setTestResult] = useState('');
  const load = async () => { const next = (await baleApi.account()).data; setAccount(next); return next; };

  useEffect(() => {
    let active = true;
    baleApi.account().then(response => { if (active) setAccount(response.data); }).catch(caught => { if (active) setError(caught instanceof Error ? caught.message : 'دریافت وضعیت اتصال ناموفق بود.'); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!code) { setSecondsLeft(0); return; }
    let active = true;
    let checking = false;
    const updateCountdown = () => {
      const remaining = Math.max(0, Math.ceil((new Date(code.expires_at).getTime() - Date.now()) / 1000));
      if (active) setSecondsLeft(remaining);
      if (remaining === 0 && active) setCode(null);
    };
    const checkConnection = async () => {
      if (checking || new Date(code.expires_at).getTime() <= Date.now()) return;
      checking = true;
      try {
        const next = (await baleApi.account()).data;
        if (active) setAccount(next);
        if (active && next.connected) {
          setCode(null);
          setNotice('حساب بله با موفقیت متصل شد.');
        }
      } catch { /* the initial actionable error remains; transient status checks stay silent */ }
      finally { checking = false; }
    };
    updateCountdown();
    const countdown = window.setInterval(updateCountdown, 1_000);
    const polling = window.setInterval(() => void checkConnection(), 3_000);
    void checkConnection();
    return () => { active = false; window.clearInterval(countdown); window.clearInterval(polling); };
  }, [code]);

  const run = async (operation: () => Promise<void>) => {
    setBusy(true); setError(''); setNotice('');
    try { await operation(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'عملیات ناموفق بود.'); }
    finally { setBusy(false); }
  };

  const copyCode = async () => {
    if (!code) return;
    try { await navigator.clipboard.writeText(code.code); setNotice('کد اتصال کپی شد.'); }
    catch { setError('کپی خودکار ممکن نبود؛ کد را انتخاب و کپی کنید.'); }
  };

  const countdownLabel = `${Math.floor(secondsLeft / 60).toLocaleString('fa-IR', { minimumIntegerDigits: 2 })}:${(secondsLeft % 60).toLocaleString('fa-IR', { minimumIntegerDigits: 2 })}`;
  const savePreferences = async (enabled: boolean, categories: string[]) => {
    await baleApi.preferences(enabled, categories);
    await load();
  };

  return <section className="space-y-5 rounded-3xl border border-slate-200 bg-white p-6 sm:p-8" dir="rtl">
    <div className="flex items-center justify-between gap-3"><h3 className="flex items-center gap-2 font-bold"><Bot className="text-emerald-600" size={22} />اتصال به ربات بله</h3>{busy && <LoaderCircle className="h-4 w-4 animate-spin text-indigo-600" aria-label="در حال پردازش" />}</div>
    <p className="text-sm leading-7 text-slate-600">{account?.connected ? 'حساب بله شما به تدبیر متصل است.' : 'یک کد موقت بگیرید و آن را فقط در گفت‌وگوی خصوصی ربات رسمی ارسال کنید؛ وضعیت اتصال خودکار بررسی می‌شود.'}</p>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm leading-6 text-rose-700">{error}</p>}
    {notice && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm leading-6 text-emerald-800">{notice}</p>}

    {account && <div className="flex flex-wrap gap-2 text-xs">
      <span className={`rounded-full px-3 py-1.5 ${account.connected ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{account.connected ? '● متصل' : '○ متصل نشده'}</span>
      <span className="rounded-full bg-slate-50 px-3 py-1.5 text-slate-600">{account.notifications_enabled ? 'اعلان روشن' : 'اعلان خاموش'}</span>
      {account.linked_at && <span className="px-2 py-1.5 text-slate-400">اتصال از {new Date(account.linked_at).toLocaleDateString('fa-IR')}</span>}
    </div>}

    {account && !account.installation_ready && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-xs leading-7 text-amber-800">{account.installation_message}</p>}
    {account && !account.bot_ready && !account.bot_enabled && <p className="rounded-xl bg-amber-50 p-3 text-xs leading-6 text-amber-800">ربات هنوز توسط مدیر سامانه فعال نشده است.</p>}
    {account && !account.bot_ready && account.bot_enabled && <p className="rounded-xl bg-amber-50 p-3 text-xs leading-6 text-amber-800">ربات فعال است، اما Webhook خودکار آن آماده نیست؛ مدیر سامانه باید اتصال را ترمیم کند.</p>}
    {account?.bot_ready && !account.retry_runner_recent && <p className="rounded-xl bg-amber-50 p-3 text-xs leading-6 text-amber-800">دریافت پیام فعال است، اما heartbeat سرویس تلاش مجدد اخیر نیست. اعلان اولیه ارسال می‌شود، ولی بازیابی خطاهای موقت نیازمند scheduler فعال است.</p>}

    {code && !account?.connected && <div role="status" className="space-y-3 rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
      <div className="flex items-center justify-between gap-3"><p className="text-xs font-bold text-indigo-950">کد یک‌بارمصرف اتصال</p><span className="rounded-lg bg-white px-2 py-1 font-mono text-xs text-indigo-700">{countdownLabel}</span></div>
      <button type="button" onClick={() => void copyCode()} className="flex w-full items-center justify-center gap-3 rounded-xl border border-indigo-200 bg-white p-3 text-indigo-950"><code dir="ltr" className="select-all font-mono text-2xl tracking-widest">{code.code}</code><Copy className="h-4 w-4" /></button>
      <p className="text-xs leading-6 text-indigo-800">ارسال کد جدید، کد قبلی را باطل می‌کند. این صفحه پس از دریافت کد توسط ربات، خودکار به‌روزرسانی می‌شود.</p>
    </div>}

    {account?.connected && <section className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-4" aria-label="انتخاب اعلان‌های بله">
      <label className="flex items-center justify-between gap-3 text-sm font-bold text-slate-800"><span>ارسال اعلان‌های تدبیر در بله</span><input type="checkbox" disabled={busy || !account.installation_ready} checked={account.notifications_enabled} onChange={event => { const enabled = event.target.checked; const selected = account.enabled_notification_categories.length ? account.enabled_notification_categories : Object.keys(account.notification_categories); void run(() => savePreferences(enabled, selected)); }} /></label>
      <div className="grid gap-2 sm:grid-cols-2">
        {Object.entries(account.notification_categories).map(([id, categoryValue]) => {
          const category = categoryValue as { label: string; description: string; types: string[] };
          const checked = account.enabled_notification_categories.includes(id);
          return <label key={id} className={`flex items-start gap-3 rounded-xl border bg-white p-3 ${checked ? 'border-indigo-200' : 'border-slate-200'}`}>
            <input type="checkbox" className="mt-1" disabled={busy || !account.installation_ready || !account.notifications_enabled} checked={checked} onChange={() => {
              const next = checked ? account.enabled_notification_categories.filter(item => item !== id) : [...account.enabled_notification_categories, id];
              void run(() => savePreferences(account.notifications_enabled, next));
            }} />
            <span className="min-w-0"><strong className="block text-xs text-slate-800">{category.label}</strong><span className="mt-1 block text-[10px] leading-5 text-slate-500">{category.description}</span><span className="mt-1 block text-[9px] text-slate-400">{category.types.join('، ')}</span></span>
          </label>;
        })}
      </div>
      <p className="text-[10px] leading-5 text-slate-500">اعلان‌های امنیتی ضروری داخل پنل تدبیر باقی می‌مانند؛ این انتخاب فقط ارسال به بله را کنترل می‌کند.</p>
    </section>}

    {account?.connected && <div className="space-y-3 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4">
      <p className="text-xs leading-6 text-slate-600">این آزمون یک اعلان مشخص و قابل تشخیص به حساب متصل شما می‌فرستد.</p>
      <Button variant="secondary" disabled={busy || !account.notifications_enabled || !account.bot_ready || !account.installation_ready} onClick={() => void run(async () => {
        setTestResult('');
        const result = await baleApi.testNotification(crypto.randomUUID());
        setTestResult(({ sent: 'بله پیام را پذیرفت؛ گفت‌وگوی ربات را بررسی کنید.', pending: 'پیام برای تلاش مجدد خودکار در صف قرار گرفت.', unknown: 'نتیجهٔ ارسال مشخص نیست و برای جلوگیری از تکرار، خودکار دوباره ارسال نمی‌شود.', failed: 'ارسال ناموفق بود؛ مدیر سامانه گزارش ارسال را بررسی کند.', cancelled: 'ارسال به‌دلیل تغییر اتصال یا مجوز لغو شد.' } as Record<string, string>)[result.data.status] || 'ارسال تأیید نشد؛ مدیر سامانه گزارش ارسال را بررسی کند.');
      })}><Bell className="h-4 w-4" />ارسال اعلان آزمایشی</Button>
      {testResult && <p role="status" className="text-xs leading-6 text-emerald-900">{testResult}</p>}
    </div>}

    <div className="flex flex-wrap gap-2">
      {!account?.connected && <Button disabled={busy || !account?.bot_ready} onClick={() => void run(async () => { setCode((await baleApi.code()).data); setNotice('کد آماده است؛ آن را در گفت‌وگوی خصوصی ربات ارسال کنید.'); })}>دریافت کد اتصال</Button>}
      {account?.bot_username && <a href={`https://ble.ir/${account.bot_username}`} target="_blank" rel="noreferrer" className="ui-button ui-button-secondary"><Link2 size={16} />باز کردن ربات <span dir="ltr">@{account.bot_username}</span></a>}
      {account?.connected && <Button variant="danger" disabled={busy} onClick={() => { if (window.confirm('اتصال حساب بله قطع شود؟')) void run(async () => { setAccount((await baleApi.unlink()).data); setCode(null); }); }}><Unlink className="h-4 w-4" />قطع اتصال</Button>}
    </div>

    {account?.connected && account.bot_ready && <p className="flex items-center gap-2 text-xs leading-6 text-slate-500"><CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />دریافت پیام از طریق Webhook انجام می‌شود و هیچ پردازش دستی در پنل لازم نیست.</p>}
  </section>;
}
