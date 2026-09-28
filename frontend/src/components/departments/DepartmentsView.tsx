import React, { useEffect, useState } from 'react';
import { Building2, Plus, Pencil, Trash2, RefreshCw } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Department } from '../../types';
import { departmentsApi, DepartmentMigrationStatus } from '../../api/departments';
import { DepartmentModal } from './DepartmentModal';
import { ModuleErrorBanner } from '../common/Feedback';

export const DepartmentsView: React.FC = () => {
  const { departments, users, currentUser, hasPermission, deleteDepartment, refreshDepartments } = useApp();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [migration, setMigration] = useState<DepartmentMigrationStatus | null>(null);
  const [notice, setNotice] = useState('');
  const admin = currentUser.role === 'admin';
  useEffect(() => {
    if (admin) departmentsApi.migrationStatus().then(r => setMigration(r.data)).catch(e => setError(e.message));
  }, [admin]);
  const migrating = migration && (!migration.installed || migration.phase !== 'done');
  return <section className="p-4 sm:p-6 space-y-5" dir="rtl">
    <header className="flex flex-wrap justify-between items-center gap-3"><div><h1 className="font-bold text-xl text-slate-900 flex gap-2 items-center"><Building2 className="w-6 h-6 text-indigo-600" />دپارتمان‌ها</h1><p className="text-sm text-slate-500 mt-2">ساختار سازمانی، مدیران و عضویت‌های دپارتمان</p></div><div className="flex gap-2">
      <button aria-label="دریافت مجدد دپارتمان‌ها" disabled={busy || !!migrating} className="p-2.5 border rounded-xl disabled:opacity-50" onClick={async () => { setBusy(true); setError(''); try { await refreshDepartments(); } catch (e) { setError(e instanceof Error ? e.message : 'دریافت ناموفق بود.'); } finally { setBusy(false); } }}><RefreshCw className="w-4 h-4" /></button>
      {hasPermission('departments.create') && <button disabled={busy || !!migrating} className="bg-indigo-600 text-white rounded-xl px-4 py-2.5 text-sm flex gap-2 items-center disabled:opacity-50" onClick={() => { setEditing(null); setOpen(true); }}><Plus className="w-4 h-4" />دپارتمان جدید</button>}
    </div></header>
    {migrating && <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 space-y-3 text-sm"><h2 className="font-bold">تکمیل انتقال ساختار قبلی</h2><p className="leading-7">پس از تهیه نسخه پشتیبان و اجرای SQL راهنمای استقرار، هر بار یک بسته حداکثر ۵۰ رکوردی منتقل می‌شود. هر تیم قبلی به دپارتمان مستقل تبدیل می‌شود؛ عضویت‌ها و محدودیت جدول‌ها ادغام نمی‌شوند. در زمان انتقال دسترسی به داده‌های وابسته متوقف است.</p><p>مرحله: <span dir="ltr">{migration.phase} / {migration.after}</span></p><button disabled={busy || !migration.installed} className="rounded-lg bg-amber-800 text-white px-4 py-2 disabled:opacity-50" onClick={async () => {
      if (!window.confirm('نسخه پشتیبان کامل گرفته‌اید و نسخه قدیمی سایت از دسترس خارج است؟ بسته بعدی انتقال اجرا شود؟')) return;
      setBusy(true); setError('');
      try { const response = await departmentsApi.migrateBatch(); setMigration(response.data); if (response.data.phase === 'done') { await refreshDepartments(); setNotice('انتقال کامل شد. برای دریافت داده‌ها و مجوزهای جدید صفحه را دوباره بارگذاری کنید.'); } }
      catch (e) { setError(e instanceof Error ? e.message : 'انتقال متوقف شد؛ دوباره تلاش کنید.'); } finally { setBusy(false); }
    }}>{busy ? 'در حال انتقال…' : migration.installed ? 'اجرای بسته بعدی انتقال' : 'ابتدا ساختار SQL نصب شود'}</button></div>}
    <ModuleErrorBanner module="departments" />
    {error && <p role="alert" className="bg-rose-50 p-3 rounded-xl text-sm text-rose-700">{error}</p>}
    {notice && <p role="status" className="bg-emerald-50 p-3 rounded-xl text-sm text-emerald-800">{notice}</p>}
    {!departments.length && !migrating ? <div className="border border-dashed rounded-2xl p-12 text-center text-slate-500 text-sm">دپارتمانی ثبت نشده است. دادهٔ نمونه یا ذخیرهٔ مرورگر جایگزین اطلاعات سرور نمی‌شود.</div> : <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">{departments.map(dept => <article key={dept.id} className="border border-slate-200 bg-white rounded-2xl p-5 space-y-4">
      <div className="flex justify-between gap-2"><h2 className="font-bold text-slate-900">{dept.name} <span className="text-xs font-normal text-slate-400">#{dept.id}</span></h2><span className={`rounded-full px-2 py-1 text-xs ${dept.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{dept.status === 'active' ? 'فعال' : 'غیرفعال'}</span></div>
      <p className="text-xs leading-6 text-slate-500 whitespace-pre-wrap">{dept.description || 'بدون شرح'}</p>
      <dl className="text-xs space-y-2"><div className="flex justify-between"><dt className="text-slate-500">مدیر</dt><dd>{users.find(u => u.id === dept.managerId)?.name || (dept.managerId ? `کاربر #${dept.managerId}` : 'تعیین نشده')}</dd></div><div className="flex justify-between"><dt className="text-slate-500">والد</dt><dd>{departments.find(d => d.id === dept.parentId)?.name || 'بدون والد'}</dd></div><div className="flex justify-between"><dt className="text-slate-500">اعضا</dt><dd>{dept.members.length.toLocaleString('fa-IR')} نفر</dd></div></dl>
      <footer className="border-t pt-3 flex gap-3 text-xs">{hasPermission('departments.edit') && <button className="text-indigo-700 flex items-center gap-1" disabled={busy} onClick={() => { setEditing(dept); setOpen(true); }}><Pencil className="w-3.5 h-3.5" />ویرایش</button>}{hasPermission('departments.delete') && <button className="text-rose-600 flex items-center gap-1" disabled={busy} onClick={async () => { if (!window.confirm(`دپارتمان «${dept.name}» حذف شود؟ اعضا از این دپارتمان خارج و زیرمجموعه‌ها بدون والد می‌شوند.`)) return; setBusy(true); setError(''); try { await deleteDepartment(dept.id); } catch (e) { setError(e instanceof Error ? e.message : 'حذف ناموفق بود.'); } finally { setBusy(false); } }}><Trash2 className="w-3.5 h-3.5" />حذف</button>}</footer>
    </article>)}</div>}
    <DepartmentModal isOpen={open} onClose={() => setOpen(false)} departmentToEdit={editing} />
  </section>;
};
