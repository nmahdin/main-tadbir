import React, { useState, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { ChatMessage, ChatAttachment, TaskReference, ProjectReference } from '../../types';
import { TaskPickerModal } from './TaskPickerModal';
import { PriorityPill } from '../common/PriorityPill';
import {
  Send,
  Paperclip,
  Smile,
  Mic,
  MicOff,
  X,
  CheckSquare,
  FolderKanban,
  Image as ImageIcon,
  FileText,
  CornerDownRight,
  Edit2,
  Lock
} from 'lucide-react';

interface MessageInputProps {
  conversationId: string;
  replyingTo: ChatMessage | null;
  editingMessage: ChatMessage | null;
  onCancelReply: () => void;
  onCancelEdit: () => void;
}

const EMOJIS = ['👍', '👋', '🙏', '❤️', '🎉', '😊', '🔥', '🚀', '👌', '👏', '✅', '⚡', '💪', '🎯'];

export const MessageInput: React.FC<MessageInputProps> = ({
  conversationId,
  replyingTo,
  editingMessage,
  onCancelReply,
  onCancelEdit
}) => {
  const { sendMessage, editMessage, conversations, currentUser } = useApp();

  const [text, setText] = useState(editingMessage?.text || '');
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [selectedTask, setSelectedTask] = useState<TaskReference | null>(null);
  const [selectedProject, setSelectedProject] = useState<ProjectReference | null>(null);
  const [isTaskPickerOpen, setIsTaskPickerOpen] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const recordingTimerRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentConv = conversations.find(c => c.id === conversationId);
  const memberInfo = currentConv?.members?.find(m => m.userId === currentUser.id);
  const isConvAdmin = memberInfo?.role === 'owner' || memberInfo?.role === 'admin' || currentUser.role === 'admin';
  const canWrite = !currentConv || currentConv.type === 'direct' || currentConv.writePermission !== 'admins_only' || isConvAdmin;

  // Sync edit mode text when editingMessage changes
  React.useEffect(() => {
    if (editingMessage) {
      setText(editingMessage.text);
    }
  }, [editingMessage]);

  const handleSend = () => {
    if (!canWrite) return;
    if (!text.trim() && attachments.length === 0 && !selectedTask && !selectedProject) return;

    if (editingMessage) {
      editMessage(editingMessage.id, text.trim());
      onCancelEdit();
      setText('');
      return;
    }

    sendMessage({
      conversationId,
      text: text.trim(),
      replyToMessageId: replyingTo?.id,
      attachments: attachments.length > 0 ? attachments : undefined,
      taskRef: selectedTask || undefined,
      projectRef: selectedProject || undefined
    });

    // Reset input state
    setText('');
    setAttachments([]);
    setSelectedTask(null);
    setSelectedProject(null);
    if (replyingTo) onCancelReply();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canWrite) return;
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newAttachments: ChatAttachment[] = Array.from(files).map((f: File, i: number) => {
      const isImg = f.type.startsWith('image/');
      return {
        id: `att-${Date.now()}-${i}`,
        name: f.name,
        size: f.size,
        sizeFormatted: `${(f.size / (1024 * 1024)).toFixed(1)} MB`,
        type: isImg ? 'image' : 'document',
        url: URL.createObjectURL(f)
      };
    });

    setAttachments([...attachments, ...newAttachments]);
  };

  const handleToggleRecord = () => {
    if (!canWrite) return;
    if (!isRecording) {
      setIsRecording(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds(prev => prev + 1);
      }, 1000);
    } else {
      // Finish recording and attach voice note
      clearInterval(recordingTimerRef.current);
      setIsRecording(false);
      const voiceAttachment: ChatAttachment = {
        id: `voice-${Date.now()}`,
        name: `پیام صوتی (${recordingSeconds} ثانیه)`,
        size: recordingSeconds * 16000,
        sizeFormatted: `${(recordingSeconds * 16 / 1024).toFixed(0)} KB`,
        type: 'voice',
        url: '#',
        duration: `0:${recordingSeconds.toString().padStart(2, '0')}`
      };
      setAttachments([...attachments, voiceAttachment]);
    }
  };

  if (!canWrite) {
    return (
      <div className="bg-slate-50 border-t border-slate-200 p-4 text-center text-slate-500 text-xs font-semibold flex items-center justify-center gap-2" dir="rtl">
        <Lock className="w-4 h-4 text-slate-400 shrink-0" />
        <span>ارسال پیام در این گروه یا کانال فقط برای مدیران مجاز است.</span>
      </div>
    );
  }

  return (
    <div className="bg-white border-t border-slate-200 p-3 sm:p-4 text-right" dir="rtl">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* Replying banner */}
      {replyingTo && (
        <div className="flex items-center justify-between bg-indigo-50 border-r-4 border-indigo-600 px-3 py-2 rounded-xl mb-2 text-xs text-indigo-900 animate-in fade-in duration-100">
          <div className="flex items-center gap-2 truncate">
            <CornerDownRight className="w-3.5 h-3.5 rotate-180 text-indigo-600 shrink-0" />
            <div className="truncate">
              <span className="font-bold">پاسخ به {replyingTo.replyToMessage?.senderName || 'پیام'}: </span>
              <span className="opacity-80 truncate">{replyingTo.text}</span>
            </div>
          </div>
          <button
            onClick={onCancelReply}
            className="p-1 text-indigo-400 hover:text-indigo-700 rounded-lg cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Editing banner */}
      {editingMessage && (
        <div className="flex items-center justify-between bg-amber-50 border-r-4 border-amber-500 px-3 py-2 rounded-xl mb-2 text-xs text-amber-900 animate-in fade-in duration-100">
          <div className="flex items-center gap-2">
            <Edit2 className="w-3.5 h-3.5 text-amber-600" />
            <span className="font-bold">در حال ویرایش پیام</span>
          </div>
          <button
            onClick={onCancelEdit}
            className="p-1 text-amber-400 hover:text-amber-700 rounded-lg cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Task reference pill preview */}
      {selectedTask && (
        <div className="inline-flex items-center gap-2 bg-indigo-50 border border-indigo-200 px-3 py-1.5 rounded-xl mb-2 text-xs text-indigo-900">
          <CheckSquare className="w-3.5 h-3.5 text-indigo-600" />
          <span className="font-bold">وظیفه:</span>
          <span className="truncate max-w-[200px]">{selectedTask.title}</span>
          <PriorityPill priority={selectedTask.priority} size="sm" />
          <button
            onClick={() => setSelectedTask(null)}
            className="text-indigo-400 hover:text-rose-600 p-0.5 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Project reference pill preview */}
      {selectedProject && (
        <div className="inline-flex items-center gap-2 bg-purple-50 border border-purple-200 px-3 py-1.5 rounded-xl mb-2 text-xs text-purple-900">
          <FolderKanban className="w-3.5 h-3.5 text-purple-600" />
          <span className="font-bold">پروژه:</span>
          <span>{selectedProject.name} [{selectedProject.key}]</span>
          <button
            onClick={() => setSelectedProject(null)}
            className="text-purple-400 hover:text-rose-600 p-0.5 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Attachments preview row */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2.5">
          {attachments.map((att, i) => (
            <div
              key={att.id}
              className="flex items-center gap-2 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-xl text-xs text-slate-700"
            >
              {att.type === 'image' ? <ImageIcon className="w-3.5 h-3.5 text-blue-500" /> : <FileText className="w-3.5 h-3.5 text-slate-500" />}
              <span className="font-semibold truncate max-w-[150px]">{att.name}</span>
              <button
                onClick={() => setAttachments(attachments.filter((_, idx) => idx !== i))}
                className="text-slate-400 hover:text-rose-600 cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Voice recording in progress */}
      {isRecording && (
        <div className="flex items-center justify-between bg-rose-50 border border-rose-200 p-3 rounded-2xl mb-2 animate-pulse">
          <div className="flex items-center gap-2 text-xs font-bold text-rose-600">
            <span className="w-3 h-3 bg-rose-600 rounded-full animate-ping" />
            <span>در حال ضبط پیام صوتی...</span>
            <span className="font-mono">0:{recordingSeconds.toString().padStart(2, '0')}</span>
          </div>
          <button
            onClick={handleToggleRecord}
            className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            توقف و ذخیره
          </button>
        </div>
      )}

      {/* Main Composer Box */}
      <div className="relative flex items-end gap-2 bg-slate-50 border border-slate-200/90 rounded-2xl p-2 focus-within:bg-white focus-within:border-indigo-400 transition-all">
        {/* Attachment & Action tools */}
        <div className="flex items-center gap-1 shrink-0 pb-1">
          {/* File attach */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="پیوست فایل یا تصویر"
            className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors cursor-pointer"
          >
            <Paperclip className="w-4 h-4" />
          </button>

          {/* Task reference picker */}
          <button
            type="button"
            onClick={() => setIsTaskPickerOpen(true)}
            title="پیوست تسک یا پروژه"
            className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors cursor-pointer"
          >
            <CheckSquare className="w-4 h-4" />
          </button>

          {/* Emoji toggle */}
          <button
            type="button"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            title="ایموجی"
            className="p-2 text-slate-500 hover:text-amber-500 hover:bg-amber-50 rounded-xl transition-colors cursor-pointer"
          >
            <Smile className="w-4 h-4" />
          </button>
        </div>

        {/* Text Input Area */}
        <textarea
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="پیام خود را بنویسید... (Enter برای ارسال، Shift+Enter برای خط بعد)"
          className="w-full max-h-32 min-h-[38px] py-2 px-1 bg-transparent text-xs text-slate-900 placeholder:text-slate-400 focus:outline-hidden resize-none leading-relaxed"
        />

        {/* Send or Voice Record Action */}
        <div className="flex items-center gap-1 shrink-0 pb-1">
          {!text.trim() && attachments.length === 0 && !selectedTask && !selectedProject ? (
            <button
              type="button"
              onClick={handleToggleRecord}
              title="ضبط پیام صوتی"
              className={`p-2 rounded-xl transition-colors cursor-pointer ${
                isRecording
                  ? 'bg-rose-500 text-white'
                  : 'text-slate-500 hover:text-indigo-600 hover:bg-indigo-50'
              }`}
            >
              <Mic className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSend}
              title="ارسال پیام"
              className="p-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white shadow-xs transition-colors cursor-pointer"
            >
              <Send className="w-4 h-4 rotate-180" />
            </button>
          )}
        </div>

        {/* Emoji Quick Picker Popup */}
        {showEmojiPicker && (
          <div className="absolute bottom-full right-0 mb-2 bg-white border border-slate-200 shadow-xl rounded-2xl p-2 flex flex-wrap gap-1 w-64 z-30 animate-in fade-in zoom-in-95">
            {EMOJIS.map(emoji => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  setText(prev => prev + emoji);
                  setShowEmojiPicker(false);
                }}
                className="p-1.5 hover:bg-slate-100 rounded-lg text-base cursor-pointer"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Task / Project Picker Modal */}
      <TaskPickerModal
        isOpen={isTaskPickerOpen}
        onClose={() => setIsTaskPickerOpen(false)}
        onSelectTask={(taskRef) => setSelectedTask(taskRef)}
        onSelectProject={(projRef) => setSelectedProject(projRef)}
      />
    </div>
  );
};
