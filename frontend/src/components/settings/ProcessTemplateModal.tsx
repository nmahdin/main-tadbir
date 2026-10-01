import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { ContentProcessTemplate, ContentStageStatus } from '../../types';
import { X, Plus, Trash2, GripVertical, FileText, Check, Settings } from 'lucide-react';

interface ProcessTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  template?: ContentProcessTemplate | null;
  onSave: (data: Omit<ContentProcessTemplate, 'id'> | ContentProcessTemplate) => void | Promise<void>;
}

export const ProcessTemplateModal: React.FC<ProcessTemplateModalProps> = ({ isOpen, onClose, template, onSave }) => {
  const { departments, roles } = useApp();

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    setSaveError('');
    try {
      await onSave({
        ...(template ? { id: template.id } : {}),
        name: name.trim(),
        type,
        description: description.trim(),
        estimatedDays,
        stages: stages.map((s, idx) => ({ ...s, order: idx + 1 }))
      } as any);

      onClose();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'ذخیره الگو ناموفق بود');
    } finally {
      setSaving(false);
    }
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
        {saveError && <p role="alert" className="p-3 text-xs text-rose-700">{saveError}</p>}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-white rounded-t-3xl">
          <h2 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
            <Settings className="w-5 h-5 text-indigo-600" />
            {template ? 'ویرایش الگو فرایند تولید' : 'افزودن الگو فرایند جدید'}
          </h2>
          <button disabled={saving} onClick={onClose} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-full transition-colors cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-8" dir="rtl">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
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

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1.5">زمان تقریبی کل (روز)</label>
              <input
                type="number"
                min={1}
                max={3650}
                value={estimatedDays}
                onChange={event => setEstimatedDays(Math.max(1, Number(event.target.value) || 1))}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-indigo-500 focus:outline-hidden"
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
                <div key={stage.stageKey || index} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
                  <div className="flex items-end gap-3">
                    <span className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-xs font-black text-white">{(index + 1).toLocaleString('fa-IR')}</span>
                    <label className="min-w-0 flex-1 text-[10px] font-bold text-slate-600">عنوان مرحله
                      <input type="text" value={stage.title} onChange={event => updateStage(index, { title: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold focus:bg-white focus:border-indigo-500 focus:outline-hidden" />
                    </label>
                    <div className="flex shrink-0 items-center gap-1">
                      <button type="button" aria-label="انتقال مرحله به بالا" onClick={() => moveStage(index, 'up')} disabled={index === 0} className="rounded-lg border border-slate-200 p-2 text-slate-500 disabled:opacity-30"><GripVertical className="h-3.5 w-3.5 rotate-90" /></button>
                      <button type="button" aria-label="انتقال مرحله به پایین" onClick={() => moveStage(index, 'down')} disabled={index === stages.length - 1} className="rounded-lg border border-slate-200 p-2 text-slate-500 disabled:opacity-30"><GripVertical className="h-3.5 w-3.5 rotate-90" /></button>
                      <button type="button" aria-label="حذف مرحله" onClick={() => removeStage(index)} className="rounded-lg bg-rose-50 p-2 text-rose-600"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-[10px] font-bold text-slate-600">دپارتمان مسئول
                      <select value={stage.departmentId} onChange={event => { const department = departments.find(item => item.id === event.target.value); updateStage(index, { departmentId: event.target.value, departmentName: department?.name || '' }); }} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs focus:bg-white focus:border-indigo-500 focus:outline-hidden">{departments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}</select>
                    </label>
                    <label className="text-[10px] font-bold text-slate-600">نقش پیش‌فرض مجری
                      <select value={stage.defaultRole} onChange={event => updateStage(index, { defaultRole: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs focus:bg-white focus:border-indigo-500 focus:outline-hidden">{roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</select>
                    </label>
                  </div>

                  <label className="block text-[10px] font-bold text-slate-600">توضیحات مرحله و راهنمای مجری
                    <textarea rows={3} value={stage.description} onChange={event => updateStage(index, { description: event.target.value })} className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-6 focus:bg-white focus:border-indigo-500 focus:outline-hidden" />
                  </label>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-[10px] font-bold text-slate-600">روز شروع نسبت به آغاز جریان
                      <input type="number" min={0} max={3650} value={stage.daysFromStart ?? index + 1} onChange={event => updateStage(index, { daysFromStart: Math.max(0, Number(event.target.value) || 0) })} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs focus:bg-white focus:border-indigo-500 focus:outline-hidden" />
                    </label>
                    <label className="mt-5 flex h-[var(--control-height)] items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-700">
                      <span>وابسته به تکمیل مرحله قبل</span><input type="checkbox" checked={!!stage.dependsOnPrevious} onChange={event => updateStage(index, { dependsOnPrevious: event.target.checked })} />
                    </label>
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
            disabled={saving}
            className="px-5 py-2.5 text-slate-600 hover:bg-slate-100 rounded-xl text-sm font-bold transition-colors cursor-pointer"
          >
            انصراف
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!name.trim() || saving}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-sm font-extrabold shadow-md shadow-indigo-200 transition-all flex items-center gap-2 cursor-pointer"
          >
            <Check className="w-4 h-4" />
            {saving ? 'در حال ذخیره…' : 'ذخیره الگو'}
          </button>
        </div>
      </div>
    </div>
  );
};
