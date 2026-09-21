import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Team } from '../../types';
import { X, Edit3, CheckSquare, Trash2 } from 'lucide-react';

interface EditTeamModalProps {
  team: Team | null;
  isOpen: boolean;
  onClose: () => void;
}

export const EditTeamModal: React.FC<EditTeamModalProps> = ({ team, isOpen, onClose }) => {
  const { users, projects, departments, updateTeam, deleteTeam } = useApp();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [department, setDepartment] = useState('');
  const [leaderId, setLeaderId] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [color, setColor] = useState('#6366f1');

  useEffect(() => {
    if (team && isOpen) {
      setName(team.name);
      setDescription(team.description || '');
      setDepartment(team.department || departments[0]?.name || '');
      setLeaderId(team.leaderId);
      setSelectedMemberIds(team.memberIds || []);
      setSelectedProjectIds(team.projectIds || []);
      setColor(team.color || '#6366f1');
    }
  }, [team, isOpen, departments]);

  if (!isOpen || !team) return null;

  const toggleMember = (userId: string) => {
    if (selectedMemberIds.includes(userId)) {
      setSelectedMemberIds(selectedMemberIds.filter(id => id !== userId));
    } else {
      setSelectedMemberIds([...selectedMemberIds, userId]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    updateTeam(team.id, {
      name: name.trim(),
      description: description.trim(),
      department: department.trim() || departments[0]?.name,
      leaderId,
      memberIds: selectedMemberIds,
      projectIds: selectedProjectIds,
      color
    });

    onClose();
  };
  
  const handleDelete = () => {
    if(confirm('آیا از حذف این تیم اطمینان دارید؟')) {
      deleteTeam(team.id);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4" dir="rtl">
      <div className="bg-white rounded-3xl max-w-lg w-full flex flex-col shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
        
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center">
              <Edit3 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">ویرایش تیم</h3>
              <p className="text-[11px] text-slate-500 font-medium">ویرایش مشخصات تیم و اعضای آن</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDelete}
              className="p-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
              title="حذف تیم"
            >
              <Trash2 className="w-5 h-5" />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto max-h-[70vh] space-y-5 flex-1">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5">
              نام تیم *
            </label>
            <input
              required
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثلاً: تیم توسعه فرانت‌اند"
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 focus:outline-hidden transition-all"
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">
                دپارتمان مرتبط
              </label>
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 focus:outline-hidden transition-all"
              >
                {departments.map(d => (
                  <option key={d.id} value={d.name}>{d.name}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">
                مدیر/لید تیم
              </label>
              <select
                value={leaderId}
                onChange={(e) => setLeaderId(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 focus:outline-hidden transition-all"
              >
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
          </div>
          
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5">
              توضیحات تیم
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="شرح وظایف و حوزه‌های تمرکز تیم..."
              className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 focus:outline-hidden resize-none transition-all"
            />
          </div>
          
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5">
              اعضای تیم ({selectedMemberIds.length})
            </label>
            <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-3 bg-slate-50 border border-slate-200 rounded-xl">
              {users.map(u => {
                const isSelected = selectedMemberIds.includes(u.id);
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => toggleMember(u.id)}
                    className={`flex items-center gap-2 p-2 rounded-xl text-xs font-medium text-right transition-colors cursor-pointer ${
                      isSelected ? 'bg-indigo-100 text-indigo-900 shadow-2xs font-bold' : 'hover:bg-white border border-transparent text-slate-700 hover:border-slate-200'
                    }`}
                  >
                    <span className={`w-4 h-4 rounded-md flex items-center justify-center shrink-0 transition-colors ${
                      isSelected ? 'bg-indigo-600 text-white' : 'border border-slate-300 bg-white'
                    }`}>
                      {isSelected && <CheckSquare className="w-3 h-3" />}
                    </span>
                    <span className="truncate">{u.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-5 border-t border-slate-100 flex items-center justify-between mt-6">
            <button
              type="button"
              onClick={handleDelete}
              className="px-4 py-2.5 text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-xl transition-colors cursor-pointer flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              <span>حذف تیم</span>
            </button>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="submit"
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-black shadow-md shadow-indigo-200 transition-all cursor-pointer flex items-center gap-2"
              >
                <Edit3 className="w-5 h-5" />
                <span>ذخیره تغییرات</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
