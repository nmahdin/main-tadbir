import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Edit3, MessageSquare, Plus, Save, Terminal, Trash2, Workflow } from 'lucide-react';
import { baleApi, BaleAutomations, BaleRule } from '../../api/bale';
import { ApiError } from '../../api/client';
import { Button, Input, Modal, Select, Textarea } from '../common/Primitives';
import { baleDate, baleDeliveryLabel, baleErrorLabel } from './balePresentation';

const actions: Record<BaleRule['action'], string> = {
  reply: 'ارسال پاسخ متنی', table_row: 'افزودن ردیف به جدول مشخص', asset_text: 'شروع ثبت دارایی متنی',
  asset_file: 'باز کردن مسیر ثبت فایل', assets: 'منوی ثبت دارایی', tasks: 'نمایش وظایف کاربر', meetings: 'نمایش جلسات کاربر',
};
type Filter = 'all' | 'enabled' | 'disabled';
const blankRule = (): BaleRule => ({
  id: crypto.randomUUID(), name: '', enabled: false, trigger_type: 'command', trigger: '', action: 'reply', response: '', table_id: null, department_id: null,
});

export function BaleAutomationsPanel() {
  const [state, setState] = useState<BaleAutomations | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<BaleRule | null>(null);
  const [preview, setPreview] = useState('');
  const [conflict, setConflict] = useState(false);

  useEffect(() => {
    let live = true;
    baleApi.automations().then(response => { if (live) setState(response.data); }).catch(caught => { if (live) setError(caught instanceof Error ? caught.message : 'دریافت تنظیمات ناموفق بود.'); });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const visibleRules = useMemo(() => state?.rules.filter(rule => filter === 'all' || (filter === 'enabled' ? rule.enabled : !rule.enabled)) ?? [], [state, filter]);
  const changeRule = (id: string, patch: Partial<BaleRule>) => {
    setState(current => current && ({ ...current, rules: current.rules.map(rule => rule.id === id ? { ...rule, ...patch } : rule) }));
    setDirty(true); setNotice('');
  };
  const reloadAfterConflict = async () => {
    setBusy(true); setError('');
    try { setState((await baleApi.automations()).data); setDirty(false); setConflict(false); setNotice('نسخهٔ تازهٔ سرور دریافت شد.'); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'دریافت تنظیمات ناموفق بود.'); }
    finally { setBusy(false); }
  };
  const save = async () => {
    if (!state) return;
    setBusy(true); setError(''); setNotice(''); setConflict(false);
    try {
      setState((await baleApi.saveAutomations(state.revision, state.rules)).data);
      setDirty(false);
      setNotice('همهٔ تغییرات قواعد ذخیره شد.');
    } catch (caught) {
      const detail = caught instanceof ApiError && caught.errors ? Object.values(caught.errors).flat().join(' — ') : '';
      setConflict(caught instanceof ApiError && caught.status === 409);
      setError(detail || (caught instanceof Error ? caught.message : 'ذخیره ناموفق بود.'));
    } finally { setBusy(false); }
  };
  const commitEditor = () => {
    if (!state || !editing) return;
    const trigger = editing.trigger.trim();
    if (!editing.name.trim() || !trigger || (editing.action === 'reply' && !editing.response?.trim())) {
      setPreview('عنوان، محرک و تنظیمات الزامی عملیات را کامل کنید.');
      return;
    }
    const duplicate = state.rules.some(rule => rule.id !== editing.id && rule.trigger_type === editing.trigger_type && rule.trigger.trim().toLocaleLowerCase('fa') === trigger.toLocaleLowerCase('fa'));
    if (duplicate) { setPreview('این محرک قبلاً در قاعدهٔ دیگری استفاده شده است.'); return; }
    const next = { ...editing, name: editing.name.trim(), trigger };
    const exists = state.rules.some(rule => rule.id === next.id);
    setState({ ...state, rules: exists ? state.rules.map(rule => rule.id === next.id ? next : rule) : [...state.rules, next] });
    setDirty(true); setEditing(null); setPreview(''); setNotice('');
  };
  const previewRule = () => {
    if (!editing) return;
    const target = editing.action === 'table_row' ? state?.tables.find(table => table.id === editing.table_id)?.name : null;
    setPreview(`ورودی «${editing.trigger || '—'}» با تطبیق دقیق، عملیات «${actions[editing.action]}»${target ? ` روی جدول «${target}»` : ''} را پیشنهاد می‌کند. این پیش‌نمایش هیچ داده یا پیامی ثبت نمی‌کند.`);
  };

  return <section className="space-y-4" dir="rtl">
    <div className="flex flex-wrap items-center gap-3">
      <Workflow className="text-indigo-600" size={22} />
      <div><h4 className="font-bold text-slate-900">خودکارسازی ربات</h4><p className="mt-1 text-xs text-slate-500">محرک‌های دقیق و عملیات allowlist‌شده؛ بدون اجرای کد یا SQL دلخواه</p></div>
      <span className="mr-auto text-xs text-slate-500">{state ? `${state.rules.length.toLocaleString('fa-IR')} از ۴۰ قاعده` : 'در حال دریافت'}</span>
    </div>

    <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4 text-xs leading-7 text-indigo-950">
      مجوز کاربر، عضویت دپارتمان و دسترسی مقصد هنگام اجرا دوباره بررسی می‌شود. ثبت رکورد و تغییر دائمی بدون تأیید انجام نمی‌شود و فایل فقط از فرم امن سامانه بارگذاری می‌شود.
    </div>
    {error && <div role="alert" className="space-y-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-700"><p>{error}</p>{conflict && <Button variant="secondary" disabled={busy} onClick={() => void reloadAfterConflict()}>دریافت نسخهٔ تازهٔ سرور</Button>}</div>}
    {notice && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>}

    <div className="flex flex-wrap items-center gap-2">
      {([['all', 'همه'], ['enabled', 'فعال'], ['disabled', 'غیرفعال']] as const).map(([id, label]) => <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)} className={`rounded-xl px-3 py-2 text-xs font-bold ${filter === id ? 'bg-indigo-600 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}>{label}</button>)}
      <Button action="create" className="mr-auto" disabled={busy || !state || state.rules.length >= 40} onClick={() => { setEditing(blankRule()); setPreview(''); }}><Plus size={15} />افزودن قاعده</Button>
    </div>

    {state && visibleRules.length === 0 && <p className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">قاعده‌ای در این وضعیت وجود ندارد.</p>}
    <div className="space-y-2">
      {visibleRules.map(rule => {
        const delivery = state?.executions?.[rule.id];
        return <article key={rule.id} className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><strong className="truncate text-sm text-slate-900">{rule.name}</strong><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${rule.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{rule.enabled ? 'فعال' : 'غیرفعال'}</span></div>
              <p className="mt-2 text-xs leading-6 text-slate-500"><code dir={rule.trigger_type === 'command' ? 'ltr' : 'rtl'} className="rounded bg-slate-100 px-1.5 py-0.5">{rule.trigger}</code><span className="mx-2">←</span>{actions[rule.action]}</p>
              {delivery && <p className={`mt-1 text-[11px] ${delivery.status === 'sent' ? 'text-emerald-700' : delivery.status === 'failed' || delivery.status === 'unknown' ? 'text-rose-700' : 'text-slate-500'}`}>آخرین تحویل: {baleDeliveryLabel(delivery.status)}، {baleDate(delivery.updated_at)}{delivery.error_code ? ` — ${baleErrorLabel(delivery.error_code)}` : ''}</p>}
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs"><input type="checkbox" disabled={busy} checked={rule.enabled} onChange={event => changeRule(rule.id, { enabled: event.target.checked })} />فعال</label>
              <Button variant="secondary" disabled={busy} onClick={() => { setEditing({ ...rule }); setPreview(''); }}><Edit3 size={14} />ویرایش</Button>
              <Button variant="ghost" className="text-rose-700" disabled={busy} onClick={() => { if (window.confirm('این قاعده حذف شود؟ حذف پس از ذخیرهٔ تغییرات اعمال می‌شود.')) { setState({ ...state, rules: state.rules.filter(item => item.id !== rule.id) }); setDirty(true); } }}><Trash2 size={14} />حذف</Button>
            </div>
          </div>
        </article>;
      })}
    </div>

    <div className="sticky bottom-2 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-lg shadow-slate-200/50">
      <Button action="save" loading={busy} disabled={!state || !dirty} onClick={() => void save()}><Save size={15} />ذخیرهٔ همهٔ تغییرات</Button>
      {dirty ? <span className="text-xs text-amber-700">تغییرات هنوز ذخیره نشده‌اند.</span> : <span className="flex items-center gap-1 text-xs text-emerald-700"><CheckCircle2 size={14} />نسخهٔ نمایش‌داده‌شده ذخیره است.</span>}
    </div>

    <Modal open={editing !== null} onClose={() => { if (!busy) { setEditing(null); setPreview(''); } }} title={editing?.name || 'قاعدهٔ جدید'} description="تغییرات این فرم پس از تأیید به پیش‌نویس محلی اضافه می‌شود؛ ذخیرهٔ نهایی یکجا انجام می‌شود." icon={<Terminal className="h-5 w-5" />} busy={busy}>
      {editing && <div className="space-y-4 p-5 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-bold">عنوان مدیریتی<Input className="mt-1" value={editing.name} maxLength={100} onChange={event => setEditing({ ...editing, name: event.target.value })} placeholder="ثبت روایت جدید" /></label>
          <label className="text-xs font-bold">نوع محرک<Select className="mt-1" value={editing.trigger_type} onChange={event => setEditing({ ...editing, trigger_type: event.target.value as BaleRule['trigger_type'], trigger: '' })}><option value="command">فرمان با /</option><option value="text">متن دقیق</option></Select></label>
          <label className="text-xs font-bold">{editing.trigger_type === 'command' ? 'فرمان اختصاصی' : 'متن ورودی'}<Input className="mt-1" dir={editing.trigger_type === 'command' ? 'ltr' : 'rtl'} value={editing.trigger} maxLength={200} onChange={event => setEditing({ ...editing, trigger: event.target.value })} placeholder={editing.trigger_type === 'command' ? '/revayat' : 'سلام'} /></label>
          <label className="text-xs font-bold">عملیات<Select className="mt-1" value={editing.action} onChange={event => setEditing({ ...editing, action: event.target.value as BaleRule['action'], response: '', table_id: null, department_id: null })}>{Object.entries(actions).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</Select></label>
        </div>
        {editing.action === 'reply' && <label className="block text-xs font-bold"><span className="flex items-center gap-1"><MessageSquare size={14} />متن پاسخ</span><Textarea className="mt-1" rows={4} maxLength={3000} value={editing.response || ''} onChange={event => setEditing({ ...editing, response: event.target.value })} /><span className="font-normal text-slate-400">پاسخ متن ساده است و کد اجرایی پشتیبانی نمی‌شود.</span></label>}
        {editing.action === 'table_row' && <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-bold">جدول مقصد<Select className="mt-1" value={editing.table_id ?? ''} onChange={event => setEditing({ ...editing, table_id: Number(event.target.value) || null, department_id: null })}><option value="">انتخاب جدول متصل</option>{state?.tables.map(table => <option key={table.id} value={table.id}>{table.name}</option>)}</Select></label>
          <label className="text-xs font-bold">دپارتمان مجاز<Select className="mt-1" value={editing.department_id ?? ''} onChange={event => setEditing({ ...editing, department_id: Number(event.target.value) || null })}><option value="">انتخاب دپارتمان</option>{state?.tables.find(table => table.id === editing.table_id)?.departments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}</Select></label>
        </div>}
        {preview && <p role="status" className="rounded-xl bg-indigo-50 p-3 text-xs leading-6 text-indigo-900">{preview}</p>}
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
          <Button variant="secondary" onClick={previewRule}>پیش‌نمایش بدون اجرا</Button>
          <Button action="cancel" variant="secondary" onClick={() => { setEditing(null); setPreview(''); }}>انصراف</Button>
          <Button action="save" onClick={commitEditor}>ثبت در پیش‌نویس</Button>
        </div>
      </div>}
    </Modal>
  </section>;
}
