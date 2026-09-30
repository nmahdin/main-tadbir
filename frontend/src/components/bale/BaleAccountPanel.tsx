import React, { useEffect, useState } from 'react';
import { Bot, Link2 } from 'lucide-react';
import { baleApi, BaleAccount } from '../../api/bale';

export function BaleAccountPanel() {
  const [account, setAccount] = useState<BaleAccount | null>(null);
  const [code, setCode] = useState<{code: string; expires_at: string} | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [testResult, setTestResult] = useState('');
  const load = async () => setAccount((await baleApi.account()).data);
  useEffect(() => { let active = true; baleApi.account().then(r => { if (active) setAccount(r.data); }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, []);
  useEffect(() => {
    if (!code) return;
    const timer = window.setTimeout(() => setCode(null), Math.max(0, new Date(code.expires_at).getTime() - Date.now()));
    return () => window.clearTimeout(timer);
  }, [code]);
  const run = async (fn: () => Promise<void>) => { setBusy(true); setError(''); try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : 'عملیات ناموفق بود.'); } finally { setBusy(false); } };
  return <section className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 space-y-5" dir="rtl">
    <h3 className="flex items-center gap-2 font-bold"><Bot className="text-emerald-600" size={22}/>اتصال به ربات بله</h3>
    <p className="text-sm text-slate-600">{account?.connected ? 'حساب بله شما به تدبیر متصل است.' : 'برای اتصال تأییدشده، کد موقت را در گفت‌وگوی خصوصی ربات ارسال کنید.'}</p>
    {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
    {account && <div className="flex flex-wrap gap-2 text-xs"><span className={`rounded-full px-3 py-1.5 ${account.connected ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{account.connected ? '● متصل' : '○ متصل نشده'}</span><span className="rounded-full bg-slate-50 px-3 py-1.5 text-slate-600">{account.notifications_enabled ? 'اعلان روشن' : 'اعلان خاموش'}</span>{account.linked_at && <span className="px-2 py-1.5 text-slate-400">اتصال از {new Date(account.linked_at).toLocaleDateString('fa-IR')}</span>}</div>}
    {account && !account.installation_ready && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-xs leading-7 text-amber-800">{account.installation_message}</p>}
    {account && !account.bot_ready && !account.bot_enabled && <p className="text-xs text-amber-700">ربات بله هنوز توسط مدیر سامانه فعال نشده است.</p>}
    {account && !account.bot_ready && account.bot_enabled && <p className="text-xs text-amber-700">ربات فعال است، اما اتصال خودکار آن هنوز آمادهٔ ارسال اعلان نیست.</p>}
    {account?.bot_username && <a href={`https://ble.ir/${account.bot_username}`} target="_blank" rel="noreferrer" className="inline-flex gap-2 text-sm text-emerald-700"><Link2 size={16}/>باز کردن ربات @{account.bot_username}</a>}
    {code && !account?.connected && <div role="status" className="rounded-xl bg-indigo-50 p-4"><p className="text-xs">کد یک‌بارمصرف — فقط در ربات رسمی سامانه وارد کنید:</p><p dir="ltr" className="font-mono text-2xl tracking-widest select-all my-3">{code.code}</p><p className="text-xs">انقضا: {new Date(code.expires_at).toLocaleTimeString('fa-IR')} — کد جدید، کد قبلی را باطل می‌کند.</p></div>}
    {account?.connected && <label className="flex gap-2 text-sm"><input type="checkbox" disabled={busy || !account.installation_ready} checked={account.notifications_enabled} onChange={e => { const enabled = e.target.checked; void run(async () => { await baleApi.preferences(enabled); await load(); }); }}/>ارسال اعلان‌های جدید تدبیر در بله</label>}
    {account?.connected && <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 space-y-3"><p className="text-xs text-slate-600 leading-6">برای بررسی مسیر ارسال، یک اعلان آزمایشی به حساب خودتان بفرستید.</p><button disabled={busy || !account.notifications_enabled || !account.bot_ready || !account.installation_ready} className="text-xs font-bold text-emerald-800 disabled:opacity-40" onClick={() => void run(async () => {
      setTestResult(''); const result = await baleApi.testNotification(crypto.randomUUID());
      setTestResult(({ sent: 'بله پیام را پذیرفت؛ گفت‌وگوی ربات را بررسی کنید.', pending: 'پیام در صف است؛ هنوز ارسال تأیید نشده.', unknown: 'نتیجهٔ ارسال نامشخص است؛ قبل از آزمون دوباره، گفت‌وگو را بررسی کنید.', failed: 'ارسال ناموفق بود؛ مدیر باید وضعیت ربات را بررسی کند.', cancelled: 'ارسال به‌دلیل تغییر اتصال یا مجوز لغو شد.' } as Record<string, string>)[result.data.status] || 'ارسال تأیید نشد؛ وضعیت ربات را با مدیر بررسی کنید.');
    })}>🔔 ارسال اعلان آزمایشی</button>{testResult && <p role="status" className="text-xs leading-6 text-emerald-900">{testResult}</p>}</div>}
    <div className="flex flex-wrap gap-2">
      {!account?.connected && <button disabled={busy || !account?.bot_ready} className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-xs disabled:opacity-40" onClick={() => void run(async () => setCode((await baleApi.code()).data))}>دریافت کد اتصال</button>}
      <button disabled={busy} className="border border-slate-200 px-4 py-2 rounded-xl text-xs" onClick={() => void run(load)}>بررسی وضعیت اتصال</button>
      {account?.connected && <button disabled={busy} className="border border-rose-200 text-rose-700 px-4 py-2 rounded-xl text-xs" onClick={() => { if (window.confirm('اتصال حساب بله قطع شود؟')) void run(async () => { setAccount((await baleApi.unlink()).data); setCode(null); }); }}>قطع اتصال</button>}
    </div>
    <p className="text-xs text-slate-500 leading-6">{account?.transport === 'webhook' ? 'دریافت خودکار تنظیم شده است؛ کد اتصال را در بات بفرستید. مدیر می‌تواند آخرین دریافت را در تنظیمات بررسی کند.' : 'دریافت هنوز دستی است؛ مدیر باید Webhook را فعال کند یا پردازش یک نوبت را بزند.'} اعلان جدید هنگام ثبت برای ارسال تلاش می‌کند و به دریافت پیام وابسته نیست. برای ادامهٔ پیام‌های در انتظار، مدیر دکمهٔ ارسال صف را اجرا کند. تنظیم دسته‌بندی جداگانه هنوز ارائه نشده است.</p>
  </section>;
}
