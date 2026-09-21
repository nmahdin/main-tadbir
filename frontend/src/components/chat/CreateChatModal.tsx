import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { ChatType } from '../../types';
import { Avatar } from '../common/Avatar';
import {
  MessageSquare,
  Users,
  FolderKanban,
  X,
  Search,
  Check,
  Hash,
  Sparkles
} from 'lucide-react';

interface CreateChatModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CreateChatModal: React.FC<CreateChatModalProps> = ({ isOpen, onClose }) => {
  const {
    users,
    projects,
    currentUser,
    createConversation,
    startDirectChatWithUser,
    openProjectChannel,
    setActiveConversationId
  } = useApp();

  const [chatType, setChatType] = useState<ChatType>('direct');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');

  if (!isOpen) return null;

  const otherUsers = users.filter(u => u.id !== currentUser.id);
  const filteredUsers = otherUsers.filter(u =>
    u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.department.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const toggleUserSelection = (userId: string) => {
    if (selectedUserIds.includes(userId)) {
      setSelectedUserIds(selectedUserIds.filter(id => id !== userId));
    } else {
      setSelectedUserIds([...selectedUserIds, userId]);
    }
  };

  const handleStartDirect = (userId: string) => {
    const convId = startDirectChatWithUser(userId);
    setActiveConversationId(convId);
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (chatType === 'channel' && selectedProjectId) {
      const convId = openProjectChannel(selectedProjectId);
      setActiveConversationId(convId);
      onClose();
      return;
    }

    if (!name.trim()) return;

    const newConv = createConversation({
      name: name.trim(),
      type: chatType,
      description: description.trim(),
      memberIds: [currentUser.id, ...selectedUserIds],
      projectId: selectedProjectId || undefined,
      color: chatType === 'channel' ? '#8b5cf6' : '#3b82f6'
    });

    setActiveConversationId(newConv.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150 text-right" dir="rtl">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">
                ایجاد گفتگوی جدید
              </h3>
              <p className="text-xs text-slate-500">
                چت مستقیم با همکار، گروه کاری، یا کانال پروژه
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Type selector tabs */}
        <div className="p-4 bg-slate-50/70 border-b border-slate-100 grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => setChatType('direct')}
            className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex flex-col items-center gap-1 cursor-pointer ${
              chatType === 'direct'
                ? 'bg-white text-indigo-600 shadow-sm border border-indigo-200 font-extrabold'
                : 'text-slate-600 hover:bg-white/60'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>چت خصوصی</span>
          </button>

          <button
            type="button"
            onClick={() => setChatType('group')}
            className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex flex-col items-center gap-1 cursor-pointer ${
              chatType === 'group'
                ? 'bg-white text-indigo-600 shadow-sm border border-indigo-200 font-extrabold'
                : 'text-slate-600 hover:bg-white/60'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>گروه تیمی</span>
          </button>

          <button
            type="button"
            onClick={() => setChatType('channel')}
            className={`py-2 px-3 rounded-xl text-xs font-bold transition-all flex flex-col items-center gap-1 cursor-pointer ${
              chatType === 'channel'
                ? 'bg-white text-purple-600 shadow-sm border border-purple-200 font-extrabold'
                : 'text-slate-600 hover:bg-white/60'
            }`}
          >
            <Hash className="w-4 h-4" />
            <span>کانال پروژه</span>
          </button>
        </div>

        {/* Body content */}
        {chatType === 'direct' ? (
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
              <input
                type="text"
                autoFocus
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="جستجوی نام همکار، واحد یا ایمیل..."
                className="w-full pr-9 pl-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-hidden"
              />
            </div>

            <div className="space-y-1.5 pt-2">
              {filteredUsers.map(user => (
                <div
                  key={user.id}
                  onClick={() => handleStartDirect(user.id)}
                  className="p-2.5 rounded-2xl border border-slate-200/70 hover:border-indigo-400 hover:bg-indigo-50/50 transition-all cursor-pointer flex items-center justify-between group"
                >
                  <div className="flex items-center gap-3">
                    <Avatar user={user} size="sm" showTooltip={false} />
                    <div>
                      <div className="text-xs font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                        {user.name}
                      </div>
                      <div className="text-[11px] text-slate-500">{user.department} • {user.roleTitle || user.role}</div>
                    </div>
                  </div>

                  <span className="text-xs font-bold text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity">
                    آغاز گفتگو
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
            {chatType === 'channel' ? (
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">
                  انتخاب پروژه مرتبط
                </label>
                <select
                  value={selectedProjectId}
                  onChange={(e) => {
                    setSelectedProjectId(e.target.value);
                    const proj = projects.find(p => p.id === e.target.value);
                    if (proj) {
                      setName(`کانال ${proj.name}`);
                      setDescription(`بحث و تبادل نظر پیرامون پروژه ${proj.name} [${proj.key}]`);
                    }
                  }}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:outline-hidden"
                >
                  <option value="">انتخاب از بین پروژه‌ها...</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name} [{p.key}]</option>
                  ))}
                </select>
              </div>
            ) : null}

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">
                نام {chatType === 'channel' ? 'کانال' : 'گروه'} *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={chatType === 'channel' ? 'مثال: کانال هماهنگی فنی پروژه تدبیر' : 'مثال: تیم طراحی محصول و UI/UX'}
                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-hidden"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">
                توضیحات یا هدف گفتگو
              </label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="توضیح مختصر درباره موضوع گفتگو یا اعضا..."
                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-hidden resize-none"
              />
            </div>

            {/* Member selector */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-slate-700">
                  افزودن اعضا ({selectedUserIds.length} نفر انتخاب شده)
                </label>
                <span className="text-[11px] text-indigo-600 font-semibold cursor-pointer hover:underline" onClick={() => setSelectedUserIds(otherUsers.map(u => u.id))}>
                  انتخاب همه
                </span>
              </div>

              <div className="border border-slate-200 rounded-2xl p-2 max-h-48 overflow-y-auto space-y-1 bg-slate-50/50">
                {otherUsers.map(user => {
                  const isSelected = selectedUserIds.includes(user.id);
                  return (
                    <div
                      key={user.id}
                      onClick={() => toggleUserSelection(user.id)}
                      className={`p-2 rounded-xl transition-all cursor-pointer flex items-center justify-between ${
                        isSelected ? 'bg-indigo-50 border border-indigo-200 text-indigo-950' : 'hover:bg-slate-100/80 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Avatar user={user} size="xs" showTooltip={false} />
                        <div>
                          <div className="text-xs font-bold">{user.name}</div>
                          <div className="text-[10px] text-slate-500">{user.department}</div>
                        </div>
                      </div>

                      <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                        isSelected ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 bg-white'
                      }`}>
                        {isSelected && <Check className="w-3.5 h-3.5" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-bold transition-colors cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="submit"
                disabled={!name.trim()}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold transition-colors cursor-pointer shadow-xs"
              >
                ایجاد گفتگو
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
