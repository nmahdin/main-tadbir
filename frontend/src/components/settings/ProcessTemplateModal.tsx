import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { ContentProcessTemplate, ContentStageStatus } from '../../types';
import { X, Plus, Trash2, GripVertical, FileText, Check, Settings } from 'lucide-react';

interface ProcessTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  template?: ContentProcessTemplate | null;
  onSave: (data: Omit<ContentProcessTemplate, 'id'> | ContentProcessTemplate) => void;
}

export const ProcessTemplateModal: React.FC<ProcessTemplateModalProps> = ({ isOpen, onClose, template, onSave }) => {
  const { departments, roles } = useApp();

  const [name, setName] = useState('');
  const [type, setType] = useState('poster');
  const [description, setDescription] = useState('');
  const [estimatedDays, setEstimatedDays] = useState<number>(7);
  const [stages, setStages] = useState<ContentProcessTemplate['stages']>([]);

  useEffect(() => {
    if (template) {
      setName(template.name);
      setType(template.type);
      setDescription(template.description);
      setEstimatedDays(template.estimatedDays || 7);
      setStages(template.stages || []);
    } else {
      setName('');
      setType('poster');
      setDescription('');
      setEstimatedDays(7);
      setStages([{
        stageKey: `stg-${Date.now()}`,
        title: 'مرحله جدید',
        description: '',
        departmentId: departments[0]?.id || '',
        departmentName: departments[0]?.name || '',
        defaultRole: roles[0]?.id || '',
        order: 1,
        daysFromStart: 1,
        inputs: [],
        outputs: [],
        dependsOnPrevious: true
      }]);
    }
  }, [template, isOpen, departments, roles]);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    onSave({
      ...(template ? { id: template.id } : {}),
      name: name.trim(),
      type,
      description: description.trim(),
      estimatedDays,
      stages: stages.map((s, idx) => ({ ...s, order: idx + 1 }))
    } as any);

    onClose();
  };

  const addStage = () => {
    setStages([
      ...stages,
      {
        stageKey: `stg-${Date.now()}`,
        title: 'مرحله جدید',
        description: '',
        departmentId: departments[0]?.id || '',
        departmentName: departments[0]?.name || '',
        defaultRole: roles[0]?.id || '',
        order: stages.length + 1,
        daysFromStart: stages.length + 1,
        inputs: [],
        outputs: [],
        dependsOnPrevious: stages.length > 0
      }
    ]);
  };

  const updateStage = (index: number, updates: any) => {
    const newStages = [...stages];
    newStages[index] = { ...newStages[index], ...updates };
    setStages(newStages);
  };

  const removeStage = (index: number) => {
    setStages(stages.filter((_, idx) => idx !== index));
  };

  const moveStage = (index: number, dir: 'up' | 'down') => {
    if (dir === 'up' && index === 0) return;
    if (dir === 'down' && index === stages.length - 1) return;

    const newStages = [...stages];
    const targetIdx = dir === 'up' ? index - 1 : index + 1;
    const temp = newStages[index];
    newStages[index] = newStages[targetIdx];
    newStages[targetIdx] = temp;
    setStages(newStages);
  };

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-4xl w-full flex flex-col max-h-[90vh] shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/50 rounded-t-3xl">
          <h2 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
            <Settings className="w-5 h-5 text-indigo-600" />
            {template ? 'ویرایش الگو فرایند تولید' : 'افزودن الگو فرایند جدید'}
          </h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-full transition-colors cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-8" dir="rtl">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1.5">عنوان الگو</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثال: فرایند استاندارد ویدیو..."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:bg-white focus:border-indigo-500 focus:outline-hidden transition-all"
                required
              />
            </div>
            
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1.5">شناسه سیستمی (نوع محتوا)</label>
              <input
                type="text"
                value={type}
                onChange={(e) => setType(e.target.value)}
                placeholder="مثال: video, article, poster..."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-left focus:bg-white focus:border-indigo-500 focus:outline-hidden transition-all"
                dir="ltr"
                required
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-[11px] font-bold text-slate-700 mb-1.5">توضیحات الگو</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="توضیحاتی در مورد این فرایند تولید..."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:border-indigo-500 focus:outline-hidden transition-all min-h-[60px] resize-none"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-extrabold text-slate-900 border-r-2 border-indigo-500 pr-2">مراحل فرایند تولید</h3>
              <button
                type="button"
                onClick={addStage}
                className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> افزودن مرحله
              </button>
            </div>

            <div className="space-y-4">
              {stages.map((stage, index) => (
                <div key={index} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs relative group">
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 -mr-3 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button type="button" onClick={() => moveStage(index, 'up')} disabled={index === 0} className="p-1 bg-white border border-slate-200 rounded-full shadow-xs text-slate-400 hover:text-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer">
                      <GripVertical className="w-3.5 h-3.5 rotate-90" />
                    </button>
                    <button type="button" onClick={() => moveStage(index, 'down')} disabled={index === stages.length - 1} className="p-1 bg-white border border-slate-200 rounded-full shadow-xs text-slate-400 hover:text-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer">
                      <GripVertical className="w-3.5 h-3.5 rotate-90" />
                    </button>
                  </div>

                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-1">عنوان مرحله</label>
                        <input
                          type="text"
                          value={stage.title}
                          onChange={(e) => updateStage(index, { title: e.target.value })}
                          className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold focus:bg-white focus:border-indigo-500 focus:outline-hidden transition-all"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-1">کلید سیستمی مرحله (انگلیسی)</label>
                        <input
                          type="text"
                          value={stage.stageKey}
                          onChange={(e) => updateStage(index, { stageKey: e.target.value })}
                          className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:bg-white focus:border-indigo-500 focus:outline-hidden transition-all"
                          dir="ltr"
                        />
                      </div>
                    </div>
                    <button 
                      type="button" 
                      onClick={() => removeStage(index)} 
                      className="p-2 bg-rose-50 hover:bg-rose-100 text-rose-500 rounded-xl transition-colors shrink-0 mt-4 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1">دپارتمان مسئول</label>
                      <select
                        value={stage.departmentId}
                        onChange={(e) => {
                          const dept = departments.find(d => d.id === e.target.value);
                          updateStage(index, { departmentId: e.target.value, departmentName: dept?.name || '' });
                        }}
                        className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:bg-white focus:border-indigo-500 focus:outline-hidden transition-all"
                      >
                        {departments.map(d => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </select>
                    </div>
                    
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1">نقش پیش‌فرض مجری</label>
                      <select
                        value={stage.defaultRole}
                        onChange={(e) => updateStage(index, { defaultRole: e.target.value })}
                        className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:bg-white focus:border-indigo-500 focus:outline-hidden transition-all"
                      >
                        {roles.map(r => (
                          <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1">وابستگی به مرحله قبل؟</label>
                      <div className="flex items-center mt-1">
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" checked={stage.dependsOnPrevious} onChange={e => updateStage(index, { dependsOnPrevious: e.target.checked })} className="sr-only peer" />
                          <div className="w-9 h-5 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                          <span className="mr-2 text-[10px] font-bold text-slate-600">بلی</span>
                        </label>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">توضیحات مرحله (راهنمای مجری)</label>
                    <textarea
                      value={stage.description}
                      onChange={(e) => updateStage(index, { description: e.target.value })}
                      className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:bg-white focus:border-indigo-500 focus:outline-hidden transition-all resize-none min-h-[50px]"
                    />
                  </div>
                </div>
              ))}

              {stages.length === 0 && (
                <div className="text-center py-6 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                  <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm font-bold text-slate-500">هیچ مرحله‌ای تعریف نشده است.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="p-5 border-t border-slate-100 flex items-center justify-end gap-3 bg-slate-50/50 rounded-b-3xl">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 text-slate-600 hover:bg-slate-100 rounded-xl text-sm font-bold transition-colors cursor-pointer"
          >
            انصراف
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!name.trim()}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-sm font-extrabold shadow-md shadow-indigo-200 transition-all flex items-center gap-2 cursor-pointer"
          >
            <Check className="w-4 h-4" />
            ذخیره الگو
          </button>
        </div>
      </div>
    </div>
  );
};
