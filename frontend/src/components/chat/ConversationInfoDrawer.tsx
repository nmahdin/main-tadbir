import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Conversation, User, ConversationRole } from '../../types';
import { Avatar } from '../common/Avatar';
import {
  X,
  Users,
  Pin,
  FileText,
  VolumeX,
  Volume2,
  UserPlus,
  Trash2,
  Shield,
  FolderKanban,
  CheckSquare,
  ExternalLink,
  ChevronDown,
  Download,
  Lock,
  Edit3,
  SlidersHorizontal,
  ShieldCheck,
  UserCheck
} from 'lucide-react';

interface ConversationInfoDrawerProps {
  conversation: Conversation;
  isOpen: boolean;
  onClose: () => void;
}

export const ConversationInfoDrawer: React.FC<ConversationInfoDrawerProps> = ({
  conversation,
  isOpen,
  onClose
}) => {
  const {
    users,
    projects,
    messages,
    currentUser,
    addConversationMembers,
    removeConversationMember,
    updateMemberRole,
    updateConversationPermissions,
    toggleMuteConversation,
    setSelectedProjectId,
    setActiveView
  } = useApp();

  const [activeTab, setActiveTab] = useState<'members' | 'permissions' | 'files' | 'pins'>('members');
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [selectedUserIdsToAdd, setSelectedUserIdsToAdd] = useState<string[]>([]);

  if (!isOpen) return null;

  const convMembers = users.filter(u => conversation.memberIds.includes(u.id));
  const nonMembers = users.filter(u => !conversation.memberIds.includes(u.id));
  const linkedProject = projects.find(p => p.id === conversation.projectId);

  // Filter messages for this conversation
  const convMessages = messages.filter(m => m.conversationId === conversation.id);
  const pinnedMessages = convMessages.filter(m => m.isPinned);

  // Extract shared files from messages
  const sharedFiles = convMessages
    .flatMap(m => (m.attachments || []).map(a => ({ ...a, senderId: m.senderId, timestamp: m.timestamp })));

  const currentMemberRole = conversation.members?.find(m => m.userId === currentUser.id)?.role || 'member';
  const canManageMembers = currentMemberRole === 'owner' || currentMemberRole === 'admin' || currentUser.role === 'admin';

  const handleAddMembersSubmit = () => {
    if (selectedUserIdsToAdd.length === 0) return;
    addConversationMembers(conversation.id, selectedUserIdsToAdd);
    setSelectedUserIdsToAdd([]);
    setIsAddMemberOpen(false);
  };

  const currentWritePerm = conversation.writePermission || 'all';
  const currentDeletePerm = conversation.deletePermission || 'all';

  return (
    <div className="w-80 border-r border-slate-200 bg-white h-full flex flex-col text-right animate-in slide-in-from-left-5 duration-200" dir="rtl">
      {/* Header */}
      <div className="p-4 border-b border-slate-100 flex items-center justify-between">
        <h3 className="font-extrabold text-sm text-slate-900">اطلاعات گفتگو</h3>
        <button
          onClick={onClose}
          className="p-1.5 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Main info card */}
      <div className="p-4 border-b border-slate-100 text-center space-y-2">
        <div className="w-16 h-16 rounded-3xl bg-indigo-50 text-indigo-600 font-extrabold text-xl flex items-center justify-center mx-auto shadow-sm">
          {conversation.type === 'direct' ? (
            <Avatar user={convMembers.find(u => u.id !== currentUser.id)} size="lg" showTooltip={false} />
          ) : (
            <Users className="w-8 h-8" />
          )}
        </div>

        <div>
          <h4 className="font-extrabold text-slate-900 text-sm">{conversation.name}</h4>
          <p className="text-[11px] text-slate-500 mt-0.5">{convMembers.length} عضو فعال</p>
        </div>

        {conversation.description && (
          <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-2xl leading-relaxed text-right">
            {conversation.description}
          </p>
        )}

        {/* Linked project badge */}
        {linkedProject && (
          <button
            onClick={() => {
              setSelectedProjectId(linkedProject.id);
              setActiveView('project-detail');
            }}
            className="w-full mt-2 p-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 text-xs font-bold transition-all flex items-center justify-between cursor-pointer"
          >
            <div className="flex items-center gap-1.5 truncate">
              <FolderKanban className="w-3.5 h-3.5" />
              <span className="truncate">پروژه: {linkedProject.name}</span>
            </div>
            <ExternalLink className="w-3.5 h-3.5 shrink-0" />
          </button>
        )}

        {/* Quick action: Mute */}
        <div className="pt-2">
          <button
            onClick={() => toggleMuteConversation(conversation.id)}
            className={`w-full py-1.5 px-3 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
              conversation.isMuted
                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {conversation.isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            <span>{conversation.isMuted ? 'بی‌صدا شده (خروج از حالت سکوت)' : 'بی‌صدا کردن اعلان‌ها'}</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-3 pt-3 flex gap-1 border-b border-slate-100 pb-2">
        <button
          onClick={() => setActiveTab('members')}
          className={`flex-1 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer text-center ${
            activeTab === 'members' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          اعضا ({convMembers.length})
        </button>

        {conversation.type !== 'direct' && (
          <button
            onClick={() => setActiveTab('permissions')}
            className={`flex-1 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer text-center ${
              activeTab === 'permissions' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            دسترسی‌ها
          </button>
        )}

        <button
          onClick={() => setActiveTab('files')}
          className={`flex-1 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer text-center ${
            activeTab === 'files' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          فایل‌ها ({sharedFiles.length})
        </button>

        <button
          onClick={() => setActiveTab('pins')}
          className={`flex-1 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer text-center ${
            activeTab === 'pins' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          پین‌ها ({pinnedMessages.length})
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {activeTab === 'members' && (
          <div className="space-y-2">
            {/* Add Member Button */}
            {canManageMembers && conversation.type !== 'direct' && (
              <div>
                {!isAddMemberOpen ? (
                  <button
                    onClick={() => setIsAddMemberOpen(true)}
                    className="w-full py-2 px-3 rounded-xl border border-dashed border-indigo-300 text-indigo-600 hover:bg-indigo-50 transition-colors text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>افزودن عضو جدید به گروه</span>
                  </button>
                ) : (
                  <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                    <span className="text-xs font-bold text-slate-800 block">انتخاب اعضا</span>
                    <div className="max-h-32 overflow-y-auto space-y-1">
                      {nonMembers.map(u => (
                        <label key={u.id} className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer p-1 rounded-lg hover:bg-white">
                          <input
                            type="checkbox"
                            checked={selectedUserIdsToAdd.includes(u.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedUserIdsToAdd([...selectedUserIdsToAdd, u.id]);
                              } else {
                                setSelectedUserIdsToAdd(selectedUserIdsToAdd.filter(id => id !== u.id));
                              }
                            }}
                            className="rounded-sm"
                          />
                          <span>{u.name}</span>
                        </label>
                      ))}
                    </div>
                    <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-200">
                      <button
                        onClick={() => setIsAddMemberOpen(false)}
                        className="px-2 py-1 text-xs text-slate-500 font-semibold"
                      >
                        انصراف
                      </button>
                      <button
                        onClick={handleAddMembersSubmit}
                        className="px-3 py-1 bg-indigo-600 text-white rounded-lg text-xs font-bold"
                      >
                        افزودن
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Members List */}
            {convMembers.map(user => {
              const memberInfo = conversation.members?.find(m => m.userId === user.id);
              const role = memberInfo?.role || 'member';
              const isOwner = role === 'owner';
              const isAdmin = role === 'admin';

              return (
                <div key={user.id} className="p-2 rounded-xl hover:bg-slate-50 flex items-center justify-between group">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar user={user} size="xs" showTooltip={false} />
                    <div className="truncate">
                      <div className="text-xs font-bold text-slate-900 truncate">
                        {user.name} {user.id === currentUser.id && '(شما)'}
                      </div>
                      <div className="text-[10px] text-slate-500">{user.department}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    {isOwner ? (
                      <span className="text-[10px] bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded-md font-bold">
                        مالک
                      </span>
                    ) : isAdmin ? (
                      <span className="text-[10px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded-md font-bold">
                        مدیر
                      </span>
                    ) : null}

                    {canManageMembers && user.id !== currentUser.id && !isOwner && (
                      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5">
                        <button
                          onClick={() => {
                            const newRole: ConversationRole = isAdmin ? 'member' : 'admin';
                            updateMemberRole(conversation.id, user.id, newRole);
                          }}
                          title={isAdmin ? 'تبدیل به عضو عادی' : 'ارتقا به مدیر گروه'}
                          className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all cursor-pointer"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => removeConversationMember(conversation.id, user.id)}
                          title="حذف از گروه"
                          className="p-1 text-rose-500 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'permissions' && conversation.type !== 'direct' && (
          <div className="space-y-4 text-xs">
            {!canManageMembers ? (
              <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200 text-amber-900 space-y-1">
                <div className="flex items-center gap-1.5 font-bold">
                  <Lock className="w-3.5 h-3.5 text-amber-700" />
                  <span>دسترسی‌های گروه</span>
                </div>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  تنظیمات ارسال و حذف پیام‌ها توسط مالک و مدیران گروه کنترل می‌شود.
                </p>
                <div className="pt-2 text-[11px] space-y-1 text-slate-700">
                  <div>• دسترسی نوشتن: <span className="font-bold">{currentWritePerm === 'admins_only' ? 'فقط مدیران (کانال)' : 'همه اعضا'}</span></div>
                  <div>• دسترسی حذف: <span className="font-bold">{currentDeletePerm === 'admins_only' ? 'فقط مدیران' : currentDeletePerm === 'none' ? 'غیرفعال' : 'همه اعضا (پیام خود)'}</span></div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-3 bg-indigo-50/70 rounded-2xl border border-indigo-100 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-indigo-950">
                    <SlidersHorizontal className="w-4 h-4 text-indigo-600" />
                    <span>مدیریت دسترسی‌های گروه و کانال</span>
                  </div>
                  <p className="text-[11px] text-indigo-800">
                    به عنوان مدیر گروه می‌توانید نحوه ارسال و حذف پیام‌ها را برای اعضا محدود کنید.
                  </p>
                </div>

                {/* Write Permission */}
                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                  <label className="font-bold text-slate-900 block text-xs">
                    مجوز ارسال پیام (نوشتن)
                  </label>
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-white cursor-pointer">
                      <input
                        type="radio"
                        name="writePerm"
                        value="all"
                        checked={currentWritePerm === 'all'}
                        onChange={() => updateConversationPermissions(conversation.id, 'all', currentDeletePerm)}
                        className="text-indigo-600"
                      />
                      <div>
                        <span className="font-bold text-slate-800 block text-[11px]">همه اعضا</span>
                        <span className="text-[10px] text-slate-500">تمامی اعضای گروه می‌توانند آزادانه پیام بفرستند.</span>
                      </div>
                    </label>

                    <label className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-white cursor-pointer">
                      <input
                        type="radio"
                        name="writePerm"
                        value="admins_only"
                        checked={currentWritePerm === 'admins_only'}
                        onChange={() => updateConversationPermissions(conversation.id, 'admins_only', currentDeletePerm)}
                        className="text-indigo-600"
                      />
                      <div>
                        <span className="font-bold text-slate-800 block text-[11px]">فقط مدیران (حالت کانال خبری)</span>
                        <span className="text-[10px] text-slate-500">اعضای عادی فقط خواننده بوده و امکان ارسال پیام ندارند.</span>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Delete Permission */}
                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                  <label className="font-bold text-slate-900 block text-xs">
                    مجوز حذف پیام‌ها
                  </label>
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-white cursor-pointer">
                      <input
                        type="radio"
                        name="deletePerm"
                        value="all"
                        checked={currentDeletePerm === 'all'}
                        onChange={() => updateConversationPermissions(conversation.id, currentWritePerm, 'all')}
                        className="text-indigo-600"
                      />
                      <div>
                        <span className="font-bold text-slate-800 block text-[11px]">همه اعضا</span>
                        <span className="text-[10px] text-slate-500">اعضا می‌توانند پیام‌های ارسالی خودشان را حذف کنند.</span>
                      </div>
                    </label>

                    <label className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-white cursor-pointer">
                      <input
                        type="radio"
                        name="deletePerm"
                        value="admins_only"
                        checked={currentDeletePerm === 'admins_only'}
                        onChange={() => updateConversationPermissions(conversation.id, currentWritePerm, 'admins_only')}
                        className="text-indigo-600"
                      />
                      <div>
                        <span className="font-bold text-slate-800 block text-[11px]">فقط مدیران و مالک</span>
                        <span className="text-[10px] text-slate-500">تنها مدیران گروه اجازه پاک کردن پیام‌ها را دارند.</span>
                      </div>
                    </label>

                    <label className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-white cursor-pointer">
                      <input
                        type="radio"
                        name="deletePerm"
                        value="none"
                        checked={currentDeletePerm === 'none'}
                        onChange={() => updateConversationPermissions(conversation.id, currentWritePerm, 'none')}
                        className="text-indigo-600"
                      />
                      <div>
                        <span className="font-bold text-slate-800 block text-[11px]">حذف پیام‌ها غیرفعال (آرشیو قطعی)</span>
                        <span className="text-[10px] text-slate-500">هیچ پیامی در این گفتگو قابل حذف نخواهد بود.</span>
                      </div>
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'files' && (
          <div className="space-y-1.5">
            {sharedFiles.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs">
                هنوز هیچ فایلی به اشتراک گذاشته نشده است
              </div>
            ) : (
              sharedFiles.map(file => (
                <div
                  key={file.id}
                  className="p-2 rounded-xl bg-slate-50 border border-slate-200/70 flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2 truncate">
                    <FileText className="w-4 h-4 text-indigo-500 shrink-0" />
                    <div className="truncate">
                      <div className="font-bold text-slate-800 truncate">{file.name}</div>
                      <div className="text-[10px] text-slate-500 font-mono">{file.sizeFormatted} • {file.timestamp}</div>
                    </div>
                  </div>

                  <a
                    href={file.url}
                    download={file.name}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1 text-slate-400 hover:text-indigo-600 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </a>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'pins' && (
          <div className="space-y-2">
            {pinnedMessages.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs">
                هیچ پیامی پین نشده است
              </div>
            ) : (
              pinnedMessages.map(msg => (
                <div
                  key={msg.id}
                  onClick={() => {
                    const el = document.getElementById(`msg-${msg.id}`);
                    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }}
                  className="p-2.5 rounded-2xl bg-amber-50/70 border border-amber-200/80 hover:bg-amber-100/60 transition-all cursor-pointer text-xs space-y-1"
                >
                  <div className="flex items-center justify-between text-[10px] text-amber-900 font-bold">
                    <span className="flex items-center gap-1">
                      <Pin className="w-3 h-3 text-amber-600" />
                      <span>پیام پین شده</span>
                    </span>
                    <span className="font-mono">{msg.timestamp}</span>
                  </div>
                  <p className="text-slate-800 line-clamp-2 leading-relaxed">{msg.text}</p>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};
