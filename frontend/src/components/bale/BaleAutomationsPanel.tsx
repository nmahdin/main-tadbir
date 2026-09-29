import React, { useEffect, useState } from 'react';
import { Plus, Save, Trash2, Terminal, MessageSquare } from 'lucide-react';
import { baleApi, BaleAutomations, BaleRule } from '../../api/bale';
import { ApiError } from '../../api/client';

const actions: Record<BaleRule['action'], string> = {
  reply: 'ارسال پاسخ متنی', table_row: 'افزودن ردیف به جدول مشخص', asset_text: 'شروع ثبت دارایی متنی',
  asset_file: 'باز کردن مسیر ثبت فایل', assets: 'منوی ثبت دارایی', tasks: 'نمایش وظایف کاربر', meetings: 'نمایش جلسات کاربر',
};
const input = 'mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm disabled:opacity-50';
const button = 'inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold disabled:opacity-40';

export function BaleAutomationsPanel() {
  const [state, setState] = useState<BaleAutomations | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let live = true;
    baleApi.automations().then(r => { if (live) setState(r.data); }).catch(e => { if (live) setError(e.message); });
    return () => { live = false; };
  }, []);
  const change = (id: string, patch: Partial<BaleRule>) => {
    setState(s => s && ({ ...s, rules: s.rules.map(r => r.id === id ? { ...r, ...patch } : r) }));
    setDirty(true); setNotice('');
  };
  const reload = async () => {
    if (dirty && !window.confirm('تغییرات ذخیره‌نشده کنار گذاشته و نسخهٔ سرور دریافت شود؟')) return;
    setBusy(true); setError('');
    try { setState((await baleApi.automations()).data); setDirty(false); }
    catch (e) { setError(e instanceof Error ? e.message : 'دریافت تنظیمات ناموفق بود.'); }
    finally { setBusy(false); }
  };
  const save = async () => {
    if (!state) return;
    setBusy(true); setError(''); setNotice('');
    try {
      setState((await baleApi.saveAutomations(state.revision, state.rules)).data); setDirty(false);
      setNotice('قواعد ذخیره شدند. با حساب متصلِ دارای مجوز، محرک را در گفت‌وگوی خصوصی بات آزمایش کنید.');
    } catch (e) {
      const detail = e instanceof ApiError && e.errors ? Object.values(e.errors).flat().join(' — ') : '';
      setError(detail || (e instanceof Error ? e.message : 'ذخیره ناموفق بود.'));
    } finally { setBusy(false); }
  };
  return <section className="space-y-4 rounded-2xl border border-indigo-100 bg-indigo-50/30 p-4 sm:p-5" dir="rtl">
    <div className="flex flex-wrap items-center gap-3"><Terminal className="text-indigo-600" size={22}/><div><h4 className="font-bold text-slate-900">فرمان‌ها و پاسخ‌های خودکار</h4><p className="mt-1 text-xs text-slate-500">اتصال یک فرمان یا متن دقیق به یک عملیات مشخص</p></div><span className="mr-auto text-xs text-slate-500">{state ? `${state.rules.length} از ۴۰ قاعده` : 'در حال دریافت'}</span></div>
    <div className="text-xs leading-7 text-slate-600">
      <p>مثال: <code dir="ltr">/revayat</code> ← جدول «روایات» ← دریافت ستون‌ها و تأیید نهایی. یا متن «سلام» ← پاسخ دلخواه شما.</p>
      <p>فرمان و متن به‌صورت کامل تطبیق داده می‌شوند؛ فاصله‌های اضافی و حروف ي/ی و ك/ک یکسان‌سازی می‌شوند. محرک‌ها داخل فرم باز اجرا نمی‌شوند. برای خروج از فرم <code dir="ltr">/cancel</code> بفرستید.</p>
      <p>قواعد فقط برای حساب‌های متصل و فعال اجرا می‌شوند و مجوز کاربر را افزایش نمی‌دهند. عضویت دپارتمان و دسترسی جدول در لحظهٔ ثبت دوباره بررسی می‌شود. ثبت رکورد بدون تأیید انجام نمی‌شود؛ بارگذاری فایل در فرم امن سامانه است.</p>
    </div>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    {notice && <p role="status" className="text-sm text-emerald-700">{notice}</p>}
    {state?.rules.length === 0 && <p className="rounded-xl border border-dashed border-indigo-200 bg-white p-6 text-center text-sm text-slate-500">هنوز قاعده‌ای تعریف نشده است. «افزودن قاعده» را بزنید.</p>}
    {state?.rules.map((rule, index) => {
      const table = state.tables.find(t => t.id === rule.table_id);
      return <fieldset key={rule.id} disabled={busy} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
        <legend className="px-2 text-xs font-bold text-indigo-700">قاعدهٔ {index + 1}</legend>
        <div className="flex items-center gap-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={rule.enabled} onChange={e => change(rule.id, { enabled: e.target.checked })}/>فعال</label><button type="button" className="mr-auto flex items-center gap-1 text-xs text-rose-600" onClick={() => { if (window.confirm('این قاعده حذف شود؟ تغییر پس از ذخیره اعمال می‌شود.')) { setState({ ...state, rules: state.rules.filter(r => r.id !== rule.id) }); setDirty(true); } }}><Trash2 size={14}/>حذف قاعده</button></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-bold">عنوان مدیریتی<input className={input} value={rule.name} maxLength={100} onChange={e => change(rule.id, { name: e.target.value })} placeholder="ثبت روایت جدید"/></label>
          <label className="text-xs font-bold">نوع محرک<select className={input} value={rule.trigger_type} onChange={e => change(rule.id, { trigger_type: e.target.value as BaleRule['trigger_type'], trigger: '' })}><option value="command">فرمان با /</option><option value="text">متن دقیق</option></select></label>
          <label className="text-xs font-bold">{rule.trigger_type === 'command' ? 'فرمان اختصاصی' : 'متن ورودی'}<input className={input} dir={rule.trigger_type === 'command' ? 'ltr' : 'rtl'} value={rule.trigger} maxLength={200} onChange={e => change(rule.id, { trigger: e.target.value })} placeholder={rule.trigger_type === 'command' ? '/revayat' : 'سلام'}/></label>
          <label className="text-xs font-bold">عملیات<select className={input} value={rule.action} onChange={e => change(rule.id, { action: e.target.value as BaleRule['action'], response: '', table_id: null, department_id: null })}>{Object.entries(actions).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        </div>
        {rule.action === 'reply' && <label className="block text-xs font-bold"><span className="flex items-center gap-1"><MessageSquare size={14}/>متن پاسخ</span><textarea className={input} rows={3} maxLength={3000} value={rule.response || ''} onChange={e => change(rule.id, { response: e.target.value })}/><span className="font-normal text-slate-400">پاسخ به‌صورت متن ساده ارسال می‌شود؛ کد و قالب اجرایی پشتیبانی نمی‌شود.</span></label>}
        {rule.action === 'table_row' && <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-bold">جدول مقصد<select className={input} value={rule.table_id ?? ''} onChange={e => change(rule.id, { table_id: Number(e.target.value) || null, department_id: null })}><option value="">انتخاب جدول متصل به دپارتمان</option>{state.tables.map(t => <option key={t.id} value={t.id}>{t.name} (#{t.id})</option>)}</select></label>
          <label className="text-xs font-bold">دپارتمان مجاز این مسیر<select className={input} value={rule.department_id ?? ''} onChange={e => change(rule.id, { department_id: Number(e.target.value) || null })}><option value="">انتخاب دپارتمان جدول</option>{table?.departments.map(t => <option key={t.id} value={t.id}>{t.name} (#{t.id})</option>)}</select></label>
          <p className="text-xs leading-6 text-slate-500 sm:col-span-2">اگر جدول دیده نمی‌شود، ابتدا از تنظیمات همان جدول اتصال دپارتمان را ثبت کنید. ستون‌های متن، عدد، تاریخ و انتخابی پشتیبانی می‌شوند.</p>
        </div>}
      </fieldset>;
    })}
    <div className="flex flex-wrap gap-2">
      <button type="button" className={button+' bg-white'} disabled={busy || !state || state.rules.length >= 40} onClick={() => { if (state) { setState({ ...state, rules: [...state.rules, { id: crypto.randomUUID(), name: '', enabled: false, trigger_type: 'command', trigger: '', action: 'reply', response: '', table_id: null, department_id: null }] }); setDirty(true); } }}><Plus size={15}/>افزودن قاعده</button>
      <button type="button" className={button+' bg-indigo-600 text-white'} disabled={busy || !state || !dirty} onClick={() => void save()}><Save size={15}/>{busy ? 'در حال پردازش…' : 'ذخیره قواعد'}</button>
      <button type="button" className={button} disabled={busy} onClick={() => void reload()}>دریافت مجدد از سرور</button>
      {dirty && <span className="self-center text-xs text-amber-700">تغییرات هنوز ذخیره نشده‌اند.</span>}
    </div>
  </section>;
}
