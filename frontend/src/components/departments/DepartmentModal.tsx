import React, { useEffect, useMemo, useState } from 'react';
import { Building2, Check, Search, ShieldCheck, UserRound } from 'lucide-react';
import { departmentDescendants } from '../../utils/departmentHierarchy';
import { parseApiError } from '../../api/errors';
import { Button, Input, Modal, Select, Textarea } from '../common/Primitives';
import { useApp } from '../../context/AppContext';
import { Department, DepartmentMember, DepartmentStatus } from '../../types';

export const DepartmentModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  departmentToEdit?: Department | null;
}> = ({ isOpen, onClose, departmentToEdit }) => {
  const { users, departments, hasPermission, addDepartment, updateDepartment } = useApp();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [parentId, setParentId] = useState('');
  const [managerId, setManagerId] = useState('');
  const [status, setStatus] = useState<DepartmentStatus>('active');
  const [members, setMembers] = useState<DepartmentMember[]>([]);
  const [memberSearch, setMemberSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const canManageMembers = hasPermission('departments.manage_members');
  const serverUsers = useMemo(() => users.filter(user => /^\d+$/.test(user.id)), [users]);

  useEffect(() => {
    if (!isOpen) return;
    setName(departmentToEdit?.name ?? '');
    setDescription(departmentToEdit?.description ?? '');
    setParentId(departmentToEdit?.parentId ?? '');
    setManagerId(departmentToEdit?.managerId ?? '');
    setStatus(departmentToEdit?.status ?? 'active');
    setMembers(departmentToEdit?.members ?? []);
    setMemberSearch('');
    setError('');
  }, [isOpen, departmentToEdit]);

  const invalidParents = departmentDescendants(departments, departmentToEdit?.id);
  const visibleUsers = serverUsers.filter(user => !memberSearch.trim() || `${user.name} ${user.title || ''}`.toLowerCase().includes(memberSearch.trim().toLowerCase()));
  const toggleMember = (userId: string, checked: boolean) => setMembers(previous => checked
    ? [...previous.filter(member => member.userId !== userId), { userId, role: 'member' }]
    : previous.filter(member => member.userId !== userId));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !name.trim()) return;
    setBusy(true);
    setError('');
    try {
      const common = {
        name: name.trim(),
        description: description.trim(),
        parentId: parentId || null,
        status,
      };
      const membership = canManageMembers ? {
        managerId: managerId || null,
        // joinedAt is server-owned on creation; omitting it also prevents stale/locale dates.
        members: members.map(member => ({ userId: member.userId, role: member.role || 'member' })),
      } : {};
      if (departmentToEdit) await updateDepartment(departmentToEdit.id, { ...common, ...membership });
      else await addDepartment({ ...common, ...membership } as Omit<Department, 'id' | 'createdAt'>);
      onClose();
    } catch (caught) {
      const parsed = parseApiError(caught);
      setError(parsed.message || 'ذخیره دپارتمان ناموفق بود.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      busy={busy}
      title={departmentToEdit ? 'ویرایش دپارتمان' : 'ایجاد دپارتمان جدید'}
      description="ساختار سازمانی، مدیر و اعضای واحد را مشخص کنید"
      icon={<Building2 className="w-5 h-5" />}
    >
      <form onSubmit={submit} className="flex flex-col">
        <div className="p-5 sm:p-6 space-y-5 overflow-y-auto">
          <div>
            <label htmlFor="department-name" className="block text-xs font-bold text-slate-700 mb-1.5">نام دپارتمان <span className="text-rose-500">*</span></label>
            <Input id="department-name" autoFocus required maxLength={120} disabled={busy} value={name} onChange={event => setName(event.target.value)} placeholder="برای نمونه: طراحی محصول" />
          </div>

          <div>
            <label htmlFor="department-description" className="block text-xs font-bold text-slate-700 mb-1.5">توضیحات و حوزه مسئولیت</label>
            <Textarea id="department-description" maxLength={1000} disabled={busy} rows={3} value={description} onChange={event => setDescription(event.target.value)} placeholder="شرح کوتاهی از مسئولیت‌ها و محدوده کاری این دپارتمان" />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="department-parent" className="block text-xs font-bold text-slate-700 mb-1.5">دپارتمان والد</label>
              <Select id="department-parent" disabled={busy} value={parentId} onChange={event => setParentId(event.target.value)}>
                <option value="">بدون دپارتمان والد</option>
                {departments.filter(department => !invalidParents.has(department.id)).map(department => <option key={department.id} value={department.id}>{department.name}</option>)}
              </Select>
            </div>
            <div>
              <label htmlFor="department-status" className="block text-xs font-bold text-slate-700 mb-1.5">وضعیت فعالیت</label>
              <Select id="department-status" disabled={busy} value={status} onChange={event => setStatus(event.target.value as DepartmentStatus)}>
                <option value="active">فعال</option>
                <option value="inactive">غیرفعال</option>
              </Select>
            </div>
          </div>

          <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-3 text-[11px] leading-6 text-indigo-900">
            ساختار والد فقط برای نمایش چارت سازمانی است و مجوزها یا عضویت‌ها را به زیرمجموعه منتقل نمی‌کند.
          </div>

          {canManageMembers && (
            <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-indigo-600" />
                <div><h3 className="text-xs font-extrabold text-slate-900">مدیر و اعضای دپارتمان</h3><p className="text-[11px] text-slate-500 mt-0.5">انتخاب مدیر به‌تنهایی عضویت ایجاد نمی‌کند؛ اعضا را جداگانه انتخاب کنید.</p></div>
              </div>
              <div>
                <label htmlFor="department-manager" className="block text-xs font-bold text-slate-700 mb-1.5">مدیر دپارتمان</label>
                <Select id="department-manager" disabled={busy} value={managerId} onChange={event => setManagerId(event.target.value)}>
                  <option value="">بدون مدیر</option>
                  {serverUsers.map(user => <option key={user.id} value={user.id}>{user.name}{user.title ? ` — ${user.title}` : ''}</option>)}
                </Select>
              </div>
              <fieldset disabled={busy}>
                <legend className="text-xs font-bold text-slate-700 mb-2">اعضا ({members.length.toLocaleString('fa-IR')} نفر)</legend>
                <div className="relative mb-2">
                  <Search className="absolute right-3 top-2.5 w-4 h-4 text-slate-400" />
                  <Input aria-label="جستجوی اعضا" value={memberSearch} onChange={event => setMemberSearch(event.target.value)} placeholder="جستجو در نام یا عنوان شغلی" className="pr-9" />
                </div>
                <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
                  {visibleUsers.map(user => {
                    const checked = members.some(member => member.userId === user.id);
                    return <label key={user.id} className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${checked ? 'bg-indigo-50/70' : 'hover:bg-slate-50'}`}>
                      <input type="checkbox" checked={checked} onChange={event => toggleMember(user.id, event.target.checked)} />
                      <span className="w-8 h-8 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center"><UserRound className="w-4 h-4" /></span>
                      <span className="min-w-0"><span className="block text-xs font-bold text-slate-800 truncate">{user.name}</span><span className="block text-[10px] text-slate-500 truncate">{user.title || 'عضو سازمانی'}</span></span>
                    </label>;
                  })}
                  {!visibleUsers.length && <p className="p-5 text-center text-xs text-slate-500">کاربری مطابق جستجو پیدا نشد.</p>}
                </div>
              </fieldset>
            </section>
          )}

          {error && <p role="alert" className="text-xs leading-6 text-rose-800 bg-rose-50 border border-rose-200 rounded-xl p-3">{error}</p>}
        </div>

        <footer className="sticky bottom-0 px-5 sm:px-6 py-4 border-t border-slate-100 bg-slate-50/90 backdrop-blur flex items-center justify-between gap-3">
          <Button variant="ghost" disabled={busy} onClick={onClose}>انصراف</Button>
          <Button type="submit" disabled={!name.trim()} loading={busy} className="min-w-36 rounded-xl">
            {!busy && <Check className="w-4 h-4" />}{busy ? 'در حال ذخیره…' : 'ذخیره دپارتمان'}
          </Button>
        </footer>
      </form>
    </Modal>
  );
};
