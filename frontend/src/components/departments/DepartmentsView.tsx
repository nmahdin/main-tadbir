import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Department } from '../../types';
import { DepartmentModal } from './DepartmentModal';
import { 
  Network, 
  Plus, 
  Users, 
  Building2,
  MoreVertical,
  Edit2,
  Trash2,
  ChevronLeft
} from 'lucide-react';

export const DepartmentsView: React.FC = () => {
  const { departments, users, teams, deleteDepartment } = useApp();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [departmentToEdit, setDepartmentToEdit] = useState<Department | null>(null);

  const handleEdit = (dept: Department) => {
    setDepartmentToEdit(dept);
    setIsModalOpen(true);
  };

  const handleCreate = () => {
    setDepartmentToEdit(null);
    setIsModalOpen(true);
  };

  const handleDelete = (dept: Department) => {
    if (confirm(`آیا از حذف دپارتمان "${dept.name}" اطمینان دارید؟`)) {
      deleteDepartment(dept.id);
    }
  };
  
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">ساختار سازمانی</h1>
          <p className="text-sm text-slate-500 mt-1 font-medium">مدیریت دپارتمان‌ها و واحدهای سازمانی</p>
        </div>
        <button
          onClick={handleCreate}
          className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl transition-all shadow-md shadow-indigo-200 flex items-center gap-2 cursor-pointer"
        >
          <Plus className="w-5 h-5" />
          دپارتمان جدید
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tree View / List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center gap-3 bg-slate-50/50">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center">
                <Network className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-bold text-slate-800">لیست دپارتمان‌ها</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {departments.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-sm">
                  دپارتمانی ثبت نشده است.
                </div>
              ) : (
                departments.map(dept => {
                  const manager = users.find(u => u.id === dept.managerId);
                  const deptTeams = teams.filter(t => t.departmentId === dept.id || t.department === dept.name);
                  
                  return (
                    <div key={dept.id} className="p-5 hover:bg-slate-50 transition-colors group">
                      <div className="flex items-start justify-between">
                        <div className="flex gap-4">
                          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-600 flex items-center justify-center shrink-0 border border-slate-200">
                            <Building2 className="w-6 h-6" />
                          </div>
                          <div>
                            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                              {dept.name}
                              {dept.status === 'inactive' && (
                                <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-600 text-[10px]">غیرفعال</span>
                              )}
                            </h3>
                            <p className="text-sm text-slate-500 mt-1">{dept.description}</p>
                            
                            <div className="flex flex-wrap items-center gap-4 mt-4">
                              <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                                <Users className="w-4 h-4 text-slate-400" />
                                مدیر: {manager ? manager.name : 'مشخص نشده'}
                              </div>
                              <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                                <Network className="w-4 h-4 text-slate-400" />
                                {deptTeams.length} تیم فعال
                              </div>
                              <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                                <Users className="w-4 h-4 text-slate-400" />
                                {dept.members?.length || 0} عضو
                              </div>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => handleEdit(dept)}
                            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                            title="ویرایش"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => handleDelete(dept)}
                            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="حذف"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Sidebar info */}
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs">
            <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-indigo-500" />
              درباره ساختار سازمانی
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed text-justify">
              دپارتمان‌ها نشان‌دهنده ساختار رسمی و سازمانی مجموعه هستند. 
              هر دپارتمان می‌تواند شامل چندین تیم کاری باشد.
              برخلاف تیم‌ها که واحدهای عملیاتی هستند، دپارتمان‌ها برای مدیریت ساختار و مسئولیت‌های کلان ایجاد می‌شوند.
            </p>
          </div>
        </div>
      </div>
      <DepartmentModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        departmentToEdit={departmentToEdit}
      />
    </div>
  );
};
