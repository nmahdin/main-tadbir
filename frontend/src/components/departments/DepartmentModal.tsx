import React, { useEffect, useState } from 'react';
import { departmentDescendants } from '../../utils/departmentHierarchy';
import { X, Loader2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Department, DepartmentMember, DepartmentStatus } from '../../types';

export const DepartmentModal: React.FC<{ isOpen: boolean; onClose: () => void; departmentToEdit?: Department | null }> = ({ isOpen, onClose, departmentToEdit }) => {
  const { users, departments, hasPermission, addDepartment, updateDepartment } = useApp();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [parentId, setParentId] = useState('');
  const [managerId, setManagerId] = useState('');
  const [status, setStatus] = useState<DepartmentStatus>('active');
  const [members, setMembers] = useState<DepartmentMember[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const canManageMembers = hasPermission('departments.manage_members');
  useEffect(() => {
    if (!isOpen) return;
    setName(departmentToEdit?.name ?? ''); setDescription(departmentToEdit?.description ?? '');
    setParentId(departmentToEdit?.parentId ?? ''); setManagerId(departmentToEdit?.managerId ?? '');
    setStatus(departmentToEdit?.status ?? 'active'); setMembers(departmentToEdit?.members ?? []); setError('');
  }, [isOpen, departmentToEdit]);
  if (!isOpen) return null;
  const invalidParents = departmentDescendants(departments, departmentToEdit?.id);
  const field = 'w-full rounded-xl border border-slate-200 p-2.5 text-sm bg-white disabled:bg-slate-50';
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/40 p-4" dir="rtl">
    <form role="dialog" aria-modal="true" aria-labelledby="department-title" className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 space-y-5 shadow-xl" onSubmit={async e => {
      e.preventDefault(); if (busy) return; setBusy(true); setError('');
      try {
        const common = { name: name.trim(), description: description.trim(), parentId: parentId || null, status };
        if (departmentToEdit) await updateDepartment(departmentToEdit.id, { ...common, ...(canManageMembers ? { managerId: managerId || null, members } : {}) });
        else await addDepartment({ ...common, ...(canManageMembers ? { managerId: managerId || null, members } : {}) } as Omit<Department, 'id' | 'createdAt'>);
        onClose();
      } catch (e) { setError(e instanceof Error ? e.message : 'ذخیره دپارتمان ناموفق بود.'); }
      finally { setBusy(false); }
    }}>
      <header className="flex justify-between items-center"><h2 id="department-title" className="font-bold text-slate-900">{departmentToEdit ? 'ویرایش دپارتمان' : 'دپارتمان جدید'}</h2><button type="button" aria-label="بستن" disabled={busy} onClick={onClose}><X className="w-5 h-5" /></button></header>
      <label className="block text-sm space-y-2"><span>نام دپارتمان</span><input autoFocus required maxLength={120} disabled={busy} className={field} value={name} onChange={e => setName(e.target.value)} /></label>
      <label className="block text-sm space-y-2"><span>شرح</span><textarea maxLength={1000} disabled={busy} className={field} rows={3} value={description} onChange={e => setDescription(e.target.value)} /></label>
      <div className="grid sm:grid-cols-2 gap-4">
        <label className="block text-sm space-y-2"><span>دپارتمان والد</span><select className={field} disabled={busy} value={parentId} onChange={e => setParentId(e.target.value)}><option value="">بدون والد</option>{departments.filter(d => !invalidParents.has(d.id)).map(d => <option key={d.id} value={d.id}>{d.name} (#{d.id})</option>)}</select></label>
        <label className="block text-sm space-y-2"><span>وضعیت</span><select className={field} disabled={busy} value={status} onChange={e => setStatus(e.target.value as DepartmentStatus)}><option value="active">فعال</option><option value="inactive">غیرفعال</option></select></label>
      </div>
      <p className="text-xs leading-6 text-slate-500">ساختار والد صرفاً سازمانی است؛ عضویت یا مجوز جدول‌ها از والد به زیرمجموعه منتقل نمی‌شود.</p>
      {canManageMembers && <>
        <label className="block text-sm space-y-2"><span>مدیر</span><select disabled={busy} className={field} value={managerId} onChange={e => setManagerId(e.target.value)}><option value="">بدون مدیر</option>{users.filter(u => /^\d+$/.test(u.id)).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
        <fieldset disabled={busy} className="border rounded-xl p-3"><legend className="px-2 text-sm">اعضا ({members.length.toLocaleString('fa-IR')})</legend><p className="text-xs text-slate-500 mb-3">انتخاب مدیر به‌تنهایی عضویت و دسترسی ایجاد نمی‌کند. اعضا را صریحاً انتخاب کنید.</p><div className="max-h-48 overflow-y-auto space-y-2">{users.filter(u => /^\d+$/.test(u.id)).map(u => <label key={u.id} className="flex gap-2 text-sm"><input type="checkbox" checked={members.some(m => m.userId === u.id)} onChange={e => setMembers(old => e.target.checked ? [...old, { userId: u.id, role: 'member', joinedAt: new Date().toISOString() }] : old.filter(m => m.userId !== u.id))} />{u.name}</label>)}</div></fieldset>
      </>}
      {error && <p role="alert" className="text-sm text-rose-700 bg-rose-50 rounded-xl p-3">{error}</p>}
      <footer className="flex gap-3"><button type="submit" disabled={busy || !name.trim()} className="rounded-xl bg-indigo-600 px-5 py-2.5 text-white text-sm flex items-center gap-2 disabled:opacity-50">{busy && <Loader2 className="w-4 h-4 animate-spin" />}ذخیره دپارتمان</button><button type="button" disabled={busy} onClick={onClose} className="rounded-xl border px-4 py-2 text-sm">انصراف</button></footer>
    </form>
  </div>;
};
