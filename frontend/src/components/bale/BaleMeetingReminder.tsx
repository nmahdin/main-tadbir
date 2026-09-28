import React, { useState } from 'react';
import { baleApi, ReminderPreview, ReminderResult } from '../../api/bale';

const labels: Record<string, string> = { sent: 'ارسال موفق', pending: 'در انتظار', sending: 'در حال ارسال', failed: 'ناموفق', unknown: 'نتیجه نامشخص', cancelled: 'لغوشده' };
export function BaleMeetingReminder({ meetingId }: { meetingId: string }) {
  const [preview, setPreview] = useState<ReminderPreview | null>(null);
  const [result, setResult] = useState<ReminderResult | null>(null);
  const [requestId, setRequestId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (action: () => Promise<void>) => { setBusy(true); setError(''); try { await action(); } catch (e) { setError(e instanceof Error ? e.message : 'عملیات ناموفق بود.'); } finally { setBusy(false); } };
  const button = 'rounded-xl border border-emerald-200 px-3 py-2 text-xs text-emerald-800 disabled:opacity-50';
  return <section className="rounded-xl bg-emerald-50/60 p-3 space-y-3 text-xs" dir="rtl">
    <button className={button} disabled={busy || preview !== null} onClick={() => void run(async () => { const response = await baleApi.reminderPreview(meetingId); setPreview(response.data); setResult(null); setRequestId(crypto.randomUUID()); })}>ارسال یادآوری در بله</button>
    {error && <p role="alert" className="text-rose-700">{error}</p>}
    {preview && <div className="space-y-3">
      <p className="whitespace-pre-wrap leading-6">{preview.text}</p>
      <p>{preview.recipients.toLocaleString('fa-IR')} دریافت‌کنندهٔ مجاز؛ ارسال بله فقط برای حساب‌های متصل با دریافت اعلان روشن انجام می‌شود. اعلان داخلی مستقل ثبت می‌شود.</p>
      <div className="flex gap-2"><button disabled={busy} className={button} onClick={() => void run(async () => { setResult((await baleApi.remind(meetingId, requestId, preview.version)).data); setPreview(null); })}>تأیید و اجرای یادآوری</button><button disabled={busy} className={button} onClick={() => setPreview(null)}>انصراف</button></div>
      <p className="text-slate-500">در خطای شبکه، همین تأیید را دوباره بزنید؛ شناسهٔ درخواست حفظ می‌شود تا اعلان تکراری ساخته نشود.</p>
    </div>}
    {result && <div role="status" className="space-y-2">
      <p>نتیجهٔ نوبت #{result.run_id}: {result.recipients} اعلان داخلی، {result.skipped} بدون ارسال بله (حساب نامتصل، دریافت خاموش یا بات غیرفعال).</p>
      <p>{Object.entries(result.counts).map(([status, count]) => `${labels[status] || status}: ${count}`).join(' • ')}</p>
      {!!(result.counts.pending || result.counts.sending) && <button disabled={busy} className={button} onClick={() => void run(async () => setResult((await baleApi.deliverReminder(meetingId, result.run_id)).data))}>ادامهٔ ارسال / بررسی نتیجه</button>}
      <p className="text-slate-500">هر اجرا محدود است و Cron لازم ندارد. پیام با نتیجهٔ نامشخص خودکار تکرار نمی‌شود. تغییر یا لغو جلسه، پیام‌های قدیمی در انتظار را لغو می‌کند.</p>
    </div>}
  </section>;
}
