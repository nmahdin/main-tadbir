import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Content, ContentStage } from '../../types';
import { PersianDatePicker } from '../common/PersianDatePicker';
import { X, Plus, Trash2, Settings, Save, ChevronUp, ChevronDown } from 'lucide-react';

interface EditWorkflowModalProps {
  isOpen: boolean;
  onClose: () => void;
  content: Content | null;
}

export const EditWorkflowModal: React.FC<EditWorkflowModalProps> = ({ isOpen, onClose, content }) => {
  const { departments, users, updateContent, currentUser } = useApp();
  const [stages, setStages] = useState<ContentStage[]>([]);
  const canManageWorkflow = currentUser.role === 'admin' || currentUser.role === 'content_manager';

  useEffect(() => {
    if (content && isOpen) {
      setStages(content.stages || []);
    }
  }, [content, isOpen]);

  if (!isOpen || !content || !canManageWorkflow) return null;

  const handleAddStage = () => {
    const newStage: ContentStage = {
      id: `stage-${Date.now()}`,
      stageKey: 'custom',
      title: 'مرحله جدید',
      description: '',
      departmentId: departments[0]?.id || '',
      departmentName: departments[0]?.name || '',
      order: stages.length,
      status: 'not_started',
      assigneeId: '',
      inputs: [],
      outputs: []
    };
    setStages([...stages, newStage]);
  };

  const handleUpdateStage = (id: string, updates: Partial<ContentStage>) => {
    setStages(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  };


  const moveStageUp = (index: number) => {
    if (index === 0) return;
    const newStages = [...stages];
    const temp = newStages[index - 1];
    newStages[index - 1] = newStages[index];
    newStages[index] = temp;
    setStages(newStages);
  };

  const moveStageDown = (index: number) => {
    if (index === stages.length - 1) return;
    const newStages = [...stages];
    const temp = newStages[index + 1];
    newStages[index + 1] = newStages[index];
    newStages[index] = temp;
    setStages(newStages);
  };

  const handleRemoveStage = (id: string) => {

    setStages(prev => prev.filter(s => s.id !== id));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateContent(content.id, {
      stages: stages.map((s, idx) => ({ ...s, order: idx }))
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4" dir="rtl">
      <div className="bg-white rounded-3xl max-w-4xl w-full flex flex-col shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200 overflow-hidden max-h-[90vh]">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900">ویرایش جریان محتوا (مراحل تولید)</h3>
              <p className="text-[11px] text-slate-500 font-medium">تنظیم مراحل، دپارتمان‌ها و مسئولین</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/30">
          <div className="space-y-4">
            {stages.map((stage, index) => (
              <div key={stage.id} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex items-start gap-4">
                <div className="flex flex-col items-center gap-1 pt-1">
                  <button 
                    type="button"
                    onClick={() => moveStageUp(index)}
                    disabled={index === 0}
                    className="p-1 text-slate-400 hover:text-indigo-600 disabled:opacity-30 disabled:hover:text-slate-400 cursor-pointer"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button 
                    type="button"
                    onClick={() => moveStageDown(index)}
                    disabled={index === stages.length - 1}
                    className="p-1 text-slate-400 hover:text-indigo-600 disabled:opacity-30 disabled:hover:text-slate-400 cursor-pointer"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </div>
                
                <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-4">
                  
                  <div className="col-span-12 md:col-span-3">
                    <label className="text-[10px] font-bold text-slate-500 mb-1 block">عنوان مرحله</label>
                    <input 
                      type="text" 
                      value={stage.title}
                      onChange={e => handleUpdateStage(stage.id, { title: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 transition-all outline-hidden"
                    />
                  </div>
                  
                  <div className="col-span-12 md:col-span-2">
                    <label className="text-[10px] font-bold text-slate-500 mb-1 block">دپارتمان</label>
                    <select 
                      value={stage.departmentId}
                      onChange={e => {
                        const dept = departments.find(d => d.id === e.target.value);
                        handleUpdateStage(stage.id, { 
                          departmentId: e.target.value,
                          departmentName: dept?.name || ''
                        });
                      }}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 transition-all outline-hidden"
                    >
                      {departments.map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="col-span-12 md:col-span-3">
                    <label className="text-[10px] font-bold text-slate-500 mb-1 block">مسئول</label>
                    <select 
                      value={stage.assigneeId || ''}
                      onChange={e => handleUpdateStage(stage.id, { assigneeId: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 transition-all outline-hidden"
                    >
                      <option value="">بدون مسئول مشخص</option>
                      {users.map(u => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="col-span-12 md:col-span-2">
                    <label className="text-[10px] font-bold text-slate-500 mb-1 block">ارزیاب</label>
                    <select 
                      value={stage.approverId || ''}
                      onChange={e => handleUpdateStage(stage.id, { approverId: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 transition-all outline-hidden"
                    >
                      <option value="">بدون ارزیاب</option>
                      {users.map(u => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="col-span-12 md:col-span-2">
                    <label className="text-[10px] font-bold text-slate-500 mb-1 block">وضعیت</label>
                    <select 
                      value={stage.status}
                      onChange={e => handleUpdateStage(stage.id, { status: e.target.value as any })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold text-slate-900 focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 transition-all outline-hidden"
                    >
                      <option value="not_started">شروع نشده</option>
                      <option value="pending_dependency">در انتظار پیش‌نیاز</option>
                      <option value="in_progress">در حال انجام</option>
                      <option value="ready_for_review">آماده بررسی</option>
                      <option value="revisions_needed">نیازمند اصلاح</option>
                      <option value="approved">تأیید شده</option>
                      <option value="completed">تکمیل شده</option>
                    </select>
                  </div>

                  <div className="col-span-12 md:col-span-3">
                    <PersianDatePicker
                      value={stage.deadline || ''}
                      onChange={(value) => handleUpdateStage(stage.id, { deadline: value })}
                      label="مهلت انجام مرحله"
                      placeholder="انتخاب تاریخ مهلت شمسی"
                    />
                  </div>

                </div>
                
                <button 
                  type="button"
                  onClick={() => handleRemoveStage(stage.id)}
                  className="pt-7 text-slate-300 hover:text-rose-500 transition-colors"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            ))}
            
            <button
              type="button"
              onClick={handleAddStage}
              className="w-full py-4 border-2 border-dashed border-slate-300 hover:border-indigo-400 rounded-2xl flex items-center justify-center gap-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50/50 transition-all font-bold text-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>افزودن مرحله جدید</span>
            </button>
          </div>
        </div>
        
        {/* Footer */}
        <div className="p-5 border-t border-slate-100 bg-white flex items-center justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
          >
            انصراف
          </button>
          <button
            onClick={handleSubmit}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-200 transition-all cursor-pointer flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            <span>ذخیره تغییرات</span>
          </button>
        </div>

      </div>
    </div>
  );
};
