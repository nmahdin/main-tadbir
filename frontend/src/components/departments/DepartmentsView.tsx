import React, { useEffect, useMemo, useState } from 'react';
import { Building2, Network, Pencil, Plus, RefreshCw, Trash2, UserRound, UsersRound } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Department } from '../../types';
import { departmentsApi, DepartmentMigrationStatus } from '../../api/departments';
import { DepartmentModal } from './DepartmentModal';
import { ModuleErrorBanner } from '../common/Feedback';
import { Button, EmptyState } from '../common/Primitives';

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
    if (!admin) return;
    departmentsApi.migrationStatus().then(response => setMigration(response.data)).catch(caught => setError(caught instanceof Error ? caught.message : 'دریافت وضعیت ساختار ناموفق بود.'));
  }, [admin]);

  const migrating = Boolean(migration && (!migration.installed || migration.phase !== 'done'));
  const activeCount = departments.filter(department => department.status === 'active').length;
  const memberCount = useMemo(() => new Set(departments.flatMap(department => department.members.map(member => member.userId))).size, [departments]);

  const refresh = async () => {
    setBusy(true); setError('');
    try { await refreshDepartments(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'دریافت دپارتمان‌ها ناموفق بود.'); }
    finally { setBusy(false); }
  };

  return (
    <section className="p-3 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-5" dir="rtl">
      <header className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-200"><Building2 className="w-6 h-6" /></span>
          <div><h1 className="font-black text-xl sm:text-2xl text-slate-900">ساختار سازمانی و دپارتمان‌ها</h1><p className="text-xs sm:text-sm text-slate-500 mt-1">مدیریت واحدها، ارتباط سلسله‌مراتبی، مدیران و اعضای سازمان</p></div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="secondary" aria-label="دریافت مجدد دپارتمان‌ها" loading={busy} disabled={migrating} onClick={() => void refresh()} className="border border-slate-200 bg-white"><RefreshCw className="w-4 h-4" />به‌روزرسانی</Button>
          {hasPermission('departments.create') && <Button disabled={busy || migrating} onClick={() => { setEditing(null); setOpen(true); }} className="rounded-xl"><Plus className="w-4 h-4" />دپارتمان جدید</Button>}
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[{ label: 'کل دپارتمان‌ها', value: departments.length, icon: Network, color: 'text-indigo-600 bg-indigo-50' }, { label: 'دپارتمان فعال', value: activeCount, icon: Building2, color: 'text-emerald-600 bg-emerald-50' }, { label: 'اعضای یکتا', value: memberCount, icon: UsersRound, color: 'text-sky-600 bg-sky-50' }].map(item => <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-4 flex items-center gap-3 shadow-2xs"><span className={`w-10 h-10 rounded-xl flex items-center justify-center ${item.color}`}><item.icon className="w-5 h-5" /></span><div><strong className="text-lg font-black text-slate-900">{item.value.toLocaleString('fa-IR')}</strong><p className="text-[11px] text-slate-500">{item.label}</p></div></div>)}
      </div>

      {migrating && <div className="border border-amber-200 bg-amber-50 rounded-2xl p-4 space-y-3 text-sm"><h2 className="font-extrabold text-amber-950">تکمیل انتقال ساختار قبلی</h2><p className="leading-7 text-amber-900">پس از تهیه نسخه پشتیبان و اجرای SQL راهنمای استقرار، بسته بعدی انتقال ساختار اجرا می‌شود. در زمان انتقال دسترسی به داده‌های وابسته متوقف است.</p><p className="text-xs">مرحله: <span dir="ltr">{migration?.phase} / {migration?.after}</span></p><Button disabled={busy || !migration?.installed} onClick={async () => {
        if (!window.confirm('نسخه پشتیبان کامل گرفته‌اید و نسخه قدیمی سایت از دسترس خارج است؟')) return;
        setBusy(true); setError('');
        try { const response = await departmentsApi.migrateBatch(); setMigration(response.data); if (response.data.phase === 'done') { await refreshDepartments(); setNotice('انتقال ساختار سازمانی با موفقیت کامل شد.'); } }
        catch (caught) { setError(caught instanceof Error ? caught.message : 'انتقال متوقف شد؛ دوباره تلاش کنید.'); }
        finally { setBusy(false); }
      }}>{busy ? 'در حال انتقال…' : migration?.installed ? 'اجرای بسته بعدی انتقال' : 'ابتدا ساختار SQL نصب شود'}</Button></div>}

      <ModuleErrorBanner modules={['departments']} label="ساختار سازمانی" />
      {error && <p role="alert" className="bg-rose-50 border border-rose-200 p-3 rounded-xl text-xs leading-6 text-rose-800">{error}</p>}
      {notice && <p role="status" className="bg-emerald-50 border border-emerald-200 p-3 rounded-xl text-xs text-emerald-800">{notice}</p>}

      {!departments.length && !migrating ? <div className="rounded-3xl border border-dashed border-slate-300 bg-white"><EmptyState title="هنوز دپارتمانی ثبت نشده است." /></div> : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {departments.map(department => {
            const manager = users.find(user => user.id === department.managerId);
            const parent = departments.find(item => item.id === department.parentId);
            return <article key={department.id} className="group border border-slate-200 hover:border-indigo-200 bg-white rounded-3xl p-5 space-y-4 shadow-2xs hover:shadow-md transition-all relative overflow-hidden">
              <span className={`absolute top-0 inset-x-0 h-1 ${department.status === 'active' ? 'bg-indigo-500' : 'bg-slate-300'}`} />
              <div className="flex justify-between gap-3 items-start pt-1"><div className="flex items-center gap-2.5 min-w-0"><span className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0"><Building2 className="w-5 h-5" /></span><div className="min-w-0"><h2 className="font-extrabold text-slate-900 truncate">{department.name}</h2><p className="text-[11px] text-slate-500 mt-0.5">{parent ? `زیرمجموعه ${parent.name}` : 'دپارتمان سطح اصلی'}</p></div></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold shrink-0 ${department.status === 'active' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-slate-100 text-slate-500'}`}>{department.status === 'active' ? 'فعال' : 'غیرفعال'}</span></div>
              <p className="text-xs leading-6 text-slate-500 whitespace-pre-wrap min-h-12 line-clamp-2">{department.description || 'برای این دپارتمان توضیحی ثبت نشده است.'}</p>
              <div className="grid grid-cols-2 gap-2 text-xs"><div className="rounded-xl bg-slate-50 p-3"><span className="flex items-center gap-1 text-[10px] text-slate-500"><UserRound className="w-3 h-3" />مدیر</span><strong className="block mt-1 text-slate-800 truncate">{manager?.name || 'تعیین نشده'}</strong></div><div className="rounded-xl bg-slate-50 p-3"><span className="flex items-center gap-1 text-[10px] text-slate-500"><UsersRound className="w-3 h-3" />اعضا</span><strong className="block mt-1 text-slate-800">{department.members.length.toLocaleString('fa-IR')} نفر</strong></div></div>
              <footer className="border-t border-slate-100 pt-3 flex items-center justify-end gap-2">
                {hasPermission('departments.edit') && <Button variant="ghost" disabled={busy} onClick={() => { setEditing(department); setOpen(true); }} className="text-indigo-700 text-xs"><Pencil className="w-3.5 h-3.5" />ویرایش</Button>}
                {hasPermission('departments.delete') && <Button variant="ghost" className="text-rose-600 text-xs" disabled={busy} onClick={async () => { if (!window.confirm(`دپارتمان «${department.name}» حذف شود؟`)) return; setBusy(true); setError(''); try { await deleteDepartment(department.id); } catch (caught) { setError(caught instanceof Error ? caught.message : 'حذف دپارتمان ناموفق بود.'); } finally { setBusy(false); } }}><Trash2 className="w-3.5 h-3.5" />حذف</Button>}
              </footer>
            </article>;
          })}
        </div>
      )}

      <DepartmentModal isOpen={open} onClose={() => { if (!busy) setOpen(false); }} departmentToEdit={editing} />
    </section>
  );
};
