import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { ChatMessage, User } from '../../types';
import { Avatar } from '../common/Avatar';
import { PriorityPill, TaskStatusBadge } from '../common/PriorityPill';
import {
  Check,
  CheckCheck,
  Clock,
  Pin,
  Star,
  CornerDownRight,
  Smile,
  MoreVertical,
  Edit2,
  Trash2,
  Paperclip,
  Download,
  FileText,
  Play,
  Pause,
  ExternalLink,
  CheckSquare,
  FolderKanban
} from 'lucide-react';

interface MessageBubbleProps {
  message: ChatMessage;
  sender?: User;
  isMe: boolean;
  onReply: (msg: ChatMessage) => void;
  onEdit: (msg: ChatMessage) => void;
}

const QUICK_REACTIONS = ['👍', '❤️', '😂', '🎉', '✅', '🚀', '🔥'];

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  sender,
  isMe,
  onReply,
  onEdit
}) => {
  const {
    currentUser,
    conversations,
    togglePinMessage,
    toggleStarMessage,
    toggleMessageReaction,
    deleteMessage,
    setSelectedTaskId,
    setSelectedProjectId,
    setActiveView
  } = useApp();

  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  const conv = conversations.find(c => c.id === message.conversationId);
  const memberInfo = conv?.members?.find(m => m.userId === currentUser.id);
  const isConvAdmin = memberInfo?.role === 'owner' || memberInfo?.role === 'admin' || currentUser.role === 'admin';

  const canDelete =
    isConvAdmin ||
    (isMe &&
      (!conv ||
        conv.type === 'direct' ||
        (conv.deletePermission !== 'admins_only' && conv.deletePermission !== 'none')));

  const handleTaskClick = (taskId: string) => {
    setSelectedTaskId(taskId);
  };

  const handleProjectClick = (projectId: string) => {
    setSelectedProjectId(projectId);
    setActiveView('project-detail');
  };

  const renderDeliveryStatus = () => {
    if (!isMe) return null;
    switch (message.deliveryStatus) {
      case 'sending':
        return <Clock className="w-3 h-3 text-slate-400 inline" />;
      case 'sent':
        return <Check className="w-3 h-3 text-slate-400 inline" />;
      case 'delivered':
        return <CheckCheck className="w-3.5 h-3.5 text-slate-400 inline" />;
      case 'read':
        return <CheckCheck className="w-3.5 h-3.5 text-emerald-600 inline" />;
      default:
        return <CheckCheck className="w-3.5 h-3.5 text-slate-400 inline" />;
    }
  };

  return (
    <div
      id={`msg-${message.id}`}
      className={`group relative flex gap-2.5 my-3.5 transition-all text-right ${
        isMe ? 'flex-row-reverse' : 'flex-row'
      }`}
    >
      {/* Sender Avatar (shown for others) */}
      {!isMe && (
        <div className="shrink-0 mt-0.5">
          <Avatar user={sender} size="sm" showTooltip />
        </div>
      )}

      {/* Message Box & Metadata */}
      <div className={`max-w-[85%] sm:max-w-[70%] space-y-1.5 ${isMe ? 'items-end' : 'items-start'}`}>
        {/* Sender Name & Pinned / Starred Flags */}
        <div className={`flex items-center gap-2 text-[11px] font-semibold text-slate-500 px-1 ${
          isMe ? 'justify-end' : 'justify-start'
        }`}>
          {!isMe && <span>{sender?.name || 'کاربر'}</span>}
          {message.isPinned && (
            <span className="flex items-center gap-0.5 text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded-md font-bold text-[10px]">
              <Pin className="w-2.5 h-2.5" />
              <span>پین شده</span>
            </span>
          )}
          {message.isStarred && (
            <span className="text-amber-500" title="ستاره‌دار">
              <Star className="w-3 h-3 fill-amber-400" />
            </span>
          )}
        </div>

        {/* Message Container Bubble */}
        <div
          className={`relative p-3.5 rounded-3xl shadow-2xs border text-xs leading-relaxed transition-all ${
            isMe
              ? 'bg-indigo-600 text-white rounded-tl-sm border-indigo-600'
              : 'bg-white text-slate-800 rounded-tr-sm border-slate-200/90'
          }`}
        >
          {/* Reply Reference Quote */}
          {message.replyToMessage && (
            <div
              onClick={() => {
                const el = document.getElementById(`msg-${message.replyToMessage?.id}`);
                el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }}
              className={`p-2 rounded-xl mb-2.5 text-[11px] border-r-4 transition-colors cursor-pointer ${
                isMe
                  ? 'bg-indigo-700/60 border-indigo-300 text-indigo-100'
                  : 'bg-slate-50 border-indigo-500 text-slate-700'
              }`}
            >
              <div className="flex items-center gap-1 font-bold mb-0.5">
                <CornerDownRight className="w-3 h-3 rotate-180" />
                <span>{message.replyToMessage.senderName}</span>
              </div>
              <p className="truncate line-clamp-1">{message.replyToMessage.text}</p>
            </div>
          )}

          {/* Task Reference Rich Embed */}
          {message.taskRef && (
            <div
              onClick={() => handleTaskClick(message.taskRef!.taskId)}
              className={`p-3 rounded-2xl mb-2.5 border transition-all cursor-pointer ${
                isMe
                  ? 'bg-indigo-700/80 border-indigo-400 text-white hover:bg-indigo-700'
                  : 'bg-indigo-50/70 border-indigo-200 text-slate-900 hover:bg-indigo-100/60'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-1.5">
                  <CheckSquare className="w-3.5 h-3.5" />
                  <span className="font-bold text-[11px]">ارجاع به وظیفه (تسک)</span>
                </div>
                <PriorityPill priority={message.taskRef.priority} size="sm" />
              </div>
              <h5 className="font-bold text-xs mb-1 line-clamp-1">{message.taskRef.title}</h5>
              <div className="flex items-center justify-between text-[10px] opacity-80 pt-1">
                <span>{message.taskRef.projectName || 'بدون پروژه'}</span>
                <span className="underline font-semibold flex items-center gap-1">
                  مشاهده جزئیات تسک
                  <ExternalLink className="w-2.5 h-2.5" />
                </span>
              </div>
            </div>
          )}

          {/* Project Reference Rich Embed */}
          {message.projectRef && (
            <div
              onClick={() => handleProjectClick(message.projectRef!.projectId)}
              className={`p-3 rounded-2xl mb-2.5 border transition-all cursor-pointer ${
                isMe
                  ? 'bg-purple-900/60 border-purple-400 text-white hover:bg-purple-900/80'
                  : 'bg-purple-50 border-purple-200 text-slate-900 hover:bg-purple-100/70'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-1.5">
                  <FolderKanban className="w-3.5 h-3.5" />
                  <span className="font-bold text-[11px]">پروژه: {message.projectRef.name}</span>
                </div>
                <span className="font-mono text-[10px] font-bold">[{message.projectRef.key}]</span>
              </div>
              <div className="flex items-center justify-between text-[10px] opacity-80">
                <span>پیشرفت پروژه: {message.projectRef.progress}٪</span>
                <span className="underline font-semibold flex items-center gap-1">
                  ورود به پروژه
                  <ExternalLink className="w-2.5 h-2.5" />
                </span>
              </div>
            </div>
          )}

          {/* File & Media Attachments */}
          {message.attachments && message.attachments.length > 0 && (
            <div className="space-y-2 mb-2">
              {message.attachments.map(att => {
                if (att.type === 'image') {
                  return (
                    <div key={att.id} className="rounded-2xl overflow-hidden border border-white/20">
                      <img
                        src={att.url}
                        alt={att.name}
                        className="max-h-60 w-full object-cover cursor-pointer hover:opacity-95 transition-opacity"
                        onClick={() => window.open(att.url, '_blank')}
                      />
                    </div>
                  );
                }
                if (att.type === 'voice') {
                  return (
                    <div
                      key={att.id}
                      className={`p-2.5 rounded-xl flex items-center gap-2.5 ${
                        isMe ? 'bg-indigo-700/70' : 'bg-slate-100'
                      }`}
                    >
                      <button
                        onClick={() => setIsPlayingAudio(!isPlayingAudio)}
                        className={`w-8 h-8 rounded-full flex items-center justify-center cursor-pointer transition-colors ${
                          isMe ? 'bg-white text-indigo-700' : 'bg-indigo-600 text-white'
                        }`}
                      >
                        {isPlayingAudio ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 mr-0.5" />}
                      </button>
                      <div className="flex-1">
                        <div className="h-1.5 bg-slate-300/60 rounded-full overflow-hidden">
                          <div className={`h-full ${isPlayingAudio ? 'w-2/3 bg-emerald-500' : 'w-1/4 bg-indigo-500'}`} />
                        </div>
                        <div className="flex justify-between text-[10px] opacity-80 mt-1">
                          <span>صدای ضبط‌شده</span>
                          <span>{att.duration || '0:18'}</span>
                        </div>
                      </div>
                    </div>
                  );
                }
                return (
                  <div
                    key={att.id}
                    className={`p-2.5 rounded-xl flex items-center justify-between gap-3 ${
                      isMe ? 'bg-indigo-700/60 border border-indigo-400/50' : 'bg-slate-50 border border-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <FileText className="w-4 h-4 shrink-0" />
                      <div className="truncate">
                        <div className="font-bold text-xs truncate">{att.name}</div>
                        <div className="text-[10px] opacity-75">{att.sizeFormatted}</div>
                      </div>
                    </div>
                    <a
                      href={att.url}
                      download={att.name}
                      target="_blank"
                      rel="noreferrer"
                      className="p-1.5 rounded-lg hover:bg-black/10 transition-colors"
                      title="دانلود فایل"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </a>
                  </div>
                );
              })}
            </div>
          )}

          {/* Text Message Content */}
          <div className="whitespace-pre-wrap break-words">{message.text}</div>

          {/* Message Meta Info: Timestamp, Edited flag & Delivery status */}
          <div className={`flex items-center gap-1.5 pt-1.5 text-[10px] font-mono ${
            isMe ? 'text-indigo-200 justify-end' : 'text-slate-400 justify-start'
          }`}>
            {message.isEdited && <span className="italic">(ویرایش‌شده)</span>}
            <span>{message.timestamp}</span>
            {renderDeliveryStatus()}
          </div>
        </div>

        {/* Reaction Badges */}
        {message.reactions && message.reactions.length > 0 && (
          <div className={`flex flex-wrap gap-1 pt-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
            {message.reactions.map(r => {
              const hasReacted = r.userIds.includes(currentUser.id);
              return (
                <button
                  key={r.emoji}
                  onClick={() => toggleMessageReaction(message.id, r.emoji)}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                    hasReacted
                      ? 'bg-indigo-50 border-indigo-300 text-indigo-700 font-bold'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <span>{r.emoji}</span>
                  <span className="font-mono text-[11px]">{r.count}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Floating Hover Action Menu */}
      <div
        className={`absolute top-0 opacity-0 group-hover:opacity-100 transition-opacity bg-white border border-slate-200 shadow-md rounded-2xl p-1 flex items-center gap-0.5 z-10 ${
          isMe ? 'left-2' : 'right-2'
        }`}
      >
        {/* Quick React Button */}
        <div className="relative">
          <button
            onClick={() => setShowReactionPicker(!showReactionPicker)}
            title="افزودن واکنش"
            className="p-1.5 text-slate-500 hover:text-amber-500 hover:bg-slate-50 rounded-xl transition-colors cursor-pointer"
          >
            <Smile className="w-3.5 h-3.5" />
          </button>

          {showReactionPicker && (
            <div className="absolute bottom-full mb-1 bg-white border border-slate-200 shadow-xl rounded-2xl p-1.5 flex items-center gap-1 z-30 animate-in fade-in zoom-in-95">
              {QUICK_REACTIONS.map(emoji => (
                <button
                  key={emoji}
                  onClick={() => {
                    toggleMessageReaction(message.id, emoji);
                    setShowReactionPicker(false);
                  }}
                  className="p-1 hover:scale-125 transition-transform text-sm cursor-pointer"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Reply Button */}
        <button
          onClick={() => onReply(message)}
          title="پاسخ (Reply)"
          className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-50 rounded-xl transition-colors cursor-pointer"
        >
          <CornerDownRight className="w-3.5 h-3.5 rotate-180" />
        </button>

        {/* Pin Button */}
        <button
          onClick={() => togglePinMessage(message.id)}
          title={message.isPinned ? 'برداشتن پین' : 'پین کردن پیام'}
          className={`p-1.5 rounded-xl transition-colors cursor-pointer ${
            message.isPinned
              ? 'text-amber-600 bg-amber-50'
              : 'text-slate-500 hover:text-amber-600 hover:bg-slate-50'
          }`}
        >
          <Pin className="w-3.5 h-3.5" />
        </button>

        {/* Star Button */}
        <button
          onClick={() => toggleStarMessage(message.id)}
          title={message.isStarred ? 'حذف از ستاره‌دارها' : 'نشان کردن با ستاره'}
          className={`p-1.5 rounded-xl transition-colors cursor-pointer ${
            message.isStarred
              ? 'text-amber-500'
              : 'text-slate-500 hover:text-amber-500 hover:bg-slate-50'
          }`}
        >
          <Star className={`w-3.5 h-3.5 ${message.isStarred ? 'fill-amber-400' : ''}`} />
        </button>

        {/* Edit Button (Only for own messages) */}
        {isMe && (
          <button
            onClick={() => onEdit(message)}
            title="ویرایش پیام"
            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-slate-50 rounded-xl transition-colors cursor-pointer"
          >
            <Edit2 className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Delete Button (Based on conversation delete permissions or admin) */}
        {canDelete && (
          <button
            onClick={() => deleteMessage(message.id)}
            title="حذف پیام"
            className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-slate-50 rounded-xl transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};
