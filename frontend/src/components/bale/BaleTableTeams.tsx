import React, { useEffect, useState } from 'react';
import { baleApi } from '../../api/bale';

export function BaleTableTeams({ onSaved }: { onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [tables, setTables] = useState<{ id: number; name: string }[]>([]);
  const [table, setTable] = useState('');
  const [teams, setTeams] = useState<{ id: number; name: string }[]>([]);
  const [ids, setIds] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (!open || !table) return;
    let active = true; setBusy(true); setError(''); setIds([]);
    baleApi.tableTeams(table).then(r => { if (active) { setTeams(r.data.teams); setIds(r.data.team_ids); } }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [open, table]);
  const button = 'rounded-xl border border-slate-200 px-3 py-2 text-xs disabled:opacity-50';
  return <>
    <button className={button} disabled={busy} onClick={async () => { setBusy(true); setError(''); setNotice(''); try { setTables((await baleApi.assetTables()).data); setOpen(true); } catch (e) { setError(e instanceof Error ? e.message : 'دریافت جدول‌ها ناموفق بود.'); } finally { setBusy(false); } }}>اتصال تیم‌ها به جدول‌ها</button>
    {!open && error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
    {open && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/40 p-4" dir="rtl"><section role="dialog" aria-modal="true" aria-label="اتصال تیم به جدول" className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-5 shadow-xl">
      <h3 className="font-bold">اتصال صریح تیم به جدول دارایی</h3>
      <p className="text-xs leading-6 text-slate-600">جدول بدون اتصال در بات دیده نمی‌شود. پس از اتصال، دسترسی به داده‌های جدول در پنل و بات به اعضای تیم‌های انتخابی محدود می‌شود؛ مجوزهای قبلی جدول هم لازم است. مدیر دسترسی از این فرم می‌تواند اتصال را اصلاح کند.</p>
      <select aria-label="جدول" disabled={busy} value={table} onChange={e => { setTable(e.target.value); setNotice(''); }} className="w-full rounded-xl border p-2 text-sm"><option value="">انتخاب جدول</option>{tables.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
      {table && <div className="max-h-60 overflow-y-auto space-y-2">{teams.map(t => <label key={t.id} className="flex gap-2 text-sm"><input type="checkbox" disabled={busy} checked={ids.includes(t.id)} onChange={e => setIds(old => e.target.checked ? [...old, t.id] : old.filter(id => id !== t.id))}/>{t.name}</label>)}</div>}
      {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}{notice && <p role="status" className="text-xs text-emerald-700">{notice}</p>}
      <div className="flex gap-2"><button className={button} disabled={busy || !table || !!error} onClick={async () => { if (!window.confirm('محدودیت تیمی جدید در پنل و بات اعمال شود؟ انتخاب خالی، دسترسی قدیمی پنل را برمی‌گرداند و ثبت در بات را غیرفعال می‌کند.')) return; setBusy(true); setError(''); try { await baleApi.saveTableTeams(table, ids); setNotice('اتصال تیم‌ها ذخیره شد.'); onSaved(); } catch (e) { setError(e instanceof Error ? e.message : 'ذخیره ناموفق بود.'); } finally { setBusy(false); } }}>ذخیره اتصال</button><button className={button} disabled={busy} onClick={() => setOpen(false)}>بستن</button></div>
    </section></div>}
  </>;
}
