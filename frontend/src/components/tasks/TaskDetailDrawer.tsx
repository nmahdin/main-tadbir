import React, { useState, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { Task, TaskStatus, Priority } from '../../types';
import { PriorityPill, TaskStatusBadge } from '../common/PriorityPill';
import { Avatar } from '../common/Avatar';
import { PersianDatePicker } from '../common/PersianDatePicker';
import { formatToJalaliNumber, toPersianDigits } from '../../utils/jalali';
import {
  X,
  Calendar,
  Clock,
  User,
  FolderKanban,
  Tag,
  CheckSquare,
  Plus,
  Trash2,
  Paperclip,
  MessageSquare,
  Send,
  History,
  AlertTriangle,
  Link as LinkIcon,
  CheckCircle2,
  Upload,
  Sparkles,
  FileText,
  Folder,
  Download,
  Eye,
  Check,
  Layers
} from 'lucide-react';

export const TaskDetailDrawer: React.FC = () => {
  const {
    selectedTaskId,
    setSelectedTaskId,
    tasks,
    projects,
    users,
    currentUser,
    folders,
    categories,
    updateTask,
    deleteTask,
    moveTaskStatus,
    toggleSubtask,
    addSubtask,
    deleteSubtask,
    addComment,
    addAttachment,
    deleteAttachment,
    uploadAsset
  } = useApp();

  const [newSubtaskText, setNewSubtaskText] = useState('');
  const [newCommentText, setNewCommentText] = useState('');
  const [isAddingAttachment, setIsAddingAttachment] = useState(false);
  const [attachmentName, setAttachmentName] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState(folders[0]?.id || 'root');
  const [selectedCategory, setSelectedCategory] = useState(categories[0] || 'عمومی');
  const [saveToDAM, setSaveToDAM] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!selectedTaskId) return null;

  const task = tasks.find(t => t.id === selectedTaskId);
  if (!task) return null;

  const project = projects.find(p => p.id === task.projectId);
  const assignee = users.find(u => u.id === task.assigneeId);
  const completedSubtasks = task.subtasks.filter(s => s.completed).length;

  const handleSubtaskSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubtaskText.trim()) return;
    addSubtask(task.id, newSubtaskText.trim());
    setNewSubtaskText('');
  };

  const handleCommentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommentText.trim()) return;
    addComment(task.id, newCommentText.trim());
    setNewCommentText('');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file: File) => {
      const fileUrl = URL.createObjectURL(file);
      const isImg = file.type.startsWith('image/');
      const isVid = file.type.startsWith('video/');
      const isAud = file.type.startsWith('audio/');
      
      const assetType = isImg ? 'image' : isVid ? 'video' : isAud ? 'audio' : 'document';
      const formattedSize = file.size > 1024 * 1024
        ? `${(file.size / (1024 * 1024)).toFixed(1)} مگابایت`
        : `${(file.size / 1024).toFixed(0)} کیلوبایت`;

      // 1. Add attachment to task
      addAttachment(task.id, {
        name: file.name,
        size: formattedSize,
        type: assetType,
        url: fileUrl
      });

      // 2. Optionally sync to DAM with selected folder & category
      if (saveToDAM) {
        uploadAsset({
          title: file.name.replace(/\.[^/.]+$/, ''),
          fileName: file.name,
          fileSize: formattedSize,
          fileType: assetType,
          format: file.name.split('.').pop()?.toUpperCase() || 'FILE',
          folderId: selectedFolderId,
          projectId: task.projectId,
          category: selectedCategory,
          previewUrl: fileUrl,
          tags: [project?.name || 'پروژه', 'پیوست تسک']
        });
      }
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setIsAddingAttachment(false);
  };

  const handleManualAttachmentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!attachmentName.trim()) return;
    addAttachment(task.id, {
      name: attachmentName.trim(),
      size: `${(Math.random() * 3 + 1).toFixed(1)} مگابایت`,
      type: 'document',
      url: '#'
    });
    setAttachmentName('');
    setIsAddingAttachment(false);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/40 backdrop-blur-xs flex justify-end animate-in fade-in duration-150" dir="rtl">
      <div className="w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col border-r border-slate-200 animate-in slide-in-from-left duration-200">
        {/* Header Bar */}
        <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2">
            {project && (
              <span
                className="px-2.5 py-1 rounded-md text-white text-xs font-bold"
                style={{ backgroundColor: project.color }}
              >
                {project.key}
              </span>
            )}
            <span className="text-xs font-mono text-slate-600 font-bold">{toPersianDigits(task.id)}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const nextStatus = task.status === 'completed' ? 'todo' : 'completed';
                moveTaskStatus(task.id, nextStatus);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs ${
                task.status === 'completed'
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{task.status === 'completed' ? 'تکمیل‌شده' : 'ثبت به عنوان انجام شده'}</span>
            </button>

            <button
              onClick={() => deleteTask(task.id)}
              title="حذف وظیفه"
              className="p-1.5 text-slate-500 hover:text-rose-600 rounded-xl hover:bg-rose-50 transition-colors cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
            </button>

            <button
              onClick={() => setSelectedTaskId(null)}
              className="p-1.5 text-slate-500 hover:text-slate-900 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Drawer Body Scrollable */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Blocker Banner */}
          {task.isBlocked && (
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 animate-in fade-in">
              <div className="flex items-center gap-2 font-bold text-xs text-rose-800 mb-1">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                <span>این وظیفه مسدود (Blocked) شده است</span>
              </div>
              <p className="text-xs text-rose-700">{task.blockedReason || 'به دلیل وابستگی‌های مرحله قبل متوقف شده است.'}</p>
              <button
                onClick={() => updateTask(task.id, { isBlocked: false, blockedReason: undefined })}
                className="mt-2 text-xs font-bold text-rose-800 hover:underline cursor-pointer"
              >
                رفع مسدودی و فعال‌سازی
              </button>
            </div>
          )}

          {/* Title input */}
          <div>
            <label className="text-[11px] font-bold text-slate-500 block mb-1">عنوان وظیفه</label>
            <input
              type="text"
              value={task.title}
              onChange={(e) => updateTask(task.id, { title: e.target.value })}
              className="w-full text-base sm:text-lg font-extrabold text-slate-900 border-b border-transparent hover:border-slate-300 focus:border-indigo-600 focus:outline-hidden py-1 transition-all"
            />
          </div>

          {/* Core Properties Matrix */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 bg-slate-50/80 rounded-2xl border border-slate-200/90 text-xs">
            {/* Status */}
            <div>
              <label className="text-[10px] font-bold text-slate-600 block mb-1">
                وضعیت پیشرفت
              </label>
              <select
                value={task.status}
                onChange={(e) => moveTaskStatus(task.id, e.target.value as TaskStatus)}
                className="w-full p-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-800 focus:outline-hidden"
              >
                <option value="backlog">در صف بررسی (Backlog)</option>
                <option value="todo">برای انجام (To Do)</option>
                <option value="in_progress">در حال انجام (In Progress)</option>
                <option value="review">بازبینی و کنترل کیفیت (Review)</option>
                <option value="completed">تکمیل شده (Completed)</option>
              </select>
            </div>

            {/* Priority */}
            <div>
              <label className="text-[10px] font-bold text-slate-600 block mb-1">
                اولویت اجرایی
              </label>
              <select
                value={task.priority}
                onChange={(e) => updateTask(task.id, { priority: e.target.value as Priority })}
                className="w-full p-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-800 focus:outline-hidden"
              >
                <option value="urgent">بسیار فوری (Urgent)</option>
                <option value="high">بالا (High)</option>
                <option value="medium">متوسط (Medium)</option>
                <option value="low">عادی / پایین (Low)</option>
              </select>
            </div>

            {/* Assignee */}
            <div>
              <label className="text-[10px] font-bold text-slate-600 block mb-1">
                مسئول انجام
              </label>
              <select
                value={task.assigneeId}
                onChange={(e) => updateTask(task.id, { assigneeId: e.target.value })}
                className="w-full p-2 bg-white border border-slate-200 rounded-xl font-semibold text-slate-800 focus:outline-hidden"
              >
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.name} ({u.title})</option>
                ))}
              </select>
            </div>

            {/* Project */}
            <div>
              <label className="text-[10px] font-bold text-slate-600 block mb-1">
                پروژه مرتبط
              </label>
              <select
                value={task.projectId}
                onChange={(e) => updateTask(task.id, { projectId: e.target.value })}
                className="w-full p-2 bg-white border border-slate-200 rounded-xl font-semibold text-slate-800 focus:outline-hidden truncate"
              >
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {/* Deadline (Persian Date Picker) */}
            <div>
              <label className="text-[10px] font-bold text-slate-600 block mb-1">
                مهلت تحویل (شمسی)
              </label>
              <PersianDatePicker
                value={task.deadline}
                onChange={(val) => updateTask(task.id, { deadline: val })}
                placeholder="انتخاب مهلت..."
                className="text-xs"
              />
            </div>

            {/* Estimated Hours */}
            <div>
              <label className="text-[10px] font-bold text-slate-600 block mb-1">
                برآورد زمان (ساعت)
              </label>
              <input
                type="number"
                min="1"
                max="200"
                value={task.estimatedHours}
                onChange={(e) => updateTask(task.id, { estimatedHours: Number(e.target.value) })}
                className="w-full p-2 bg-white border border-slate-200 rounded-xl font-semibold text-slate-800 focus:outline-hidden"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5">
              توضیحات و نیازمندی‌های تولید
            </label>
            <textarea
              rows={3}
              value={task.description}
              onChange={(e) => updateTask(task.id, { description: e.target.value })}
              placeholder="دستورالعمل تولید محتوا، پیوندها و توضیحات تکمیلی را وارد کنید..."
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs sm:text-sm text-slate-800 focus:bg-white focus:border-indigo-500 focus:outline-hidden resize-y leading-relaxed"
            />
          </div>

          {/* Subtasks / Checklist Section */}
          <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-indigo-600" />
                <h4 className="text-xs font-bold text-slate-900">
                  چک‌لیست زیرفعالیت‌ها
                </h4>
              </div>
              <span className="text-xs font-bold text-slate-500">
                {toPersianDigits(completedSubtasks)} از {toPersianDigits(task.subtasks.length)} انجام شده
              </span>
            </div>

            {/* Subtask items list */}
            <div className="space-y-1.5">
              {task.subtasks.map(st => (
                <div
                  key={st.id}
                  className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 group text-xs transition-colors"
                >
                  <label className="flex items-center gap-2.5 flex-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={st.completed}
                      onChange={() => toggleSubtask(task.id, st.id)}
                      className="w-4 h-4 rounded-md text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                    <span className={st.completed ? 'line-through text-slate-400' : 'font-medium text-slate-800'}>
                      {st.title}
                    </span>
                  </label>
                  <button
                    onClick={() => deleteSubtask(task.id, st.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-600 transition-opacity cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Add subtask input */}
            <form onSubmit={handleSubtaskSubmit} className="flex gap-2 pt-2 border-t border-slate-100">
              <input
                type="text"
                value={newSubtaskText}
                onChange={(e) => setNewSubtaskText(e.target.value)}
                placeholder="عنوان زیرفعالیت یا چک‌لیست جدید..."
                className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:border-indigo-500 focus:outline-hidden"
              />
              <button
                type="submit"
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors"
              >
                افزودن
              </button>
            </form>
          </div>

          {/* Attachments Section with DAM Upload & Folder Organization */}
          <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Paperclip className="w-4 h-4 text-indigo-600" />
                <h4 className="text-xs font-bold text-slate-900">
                  فایل‌های ضمیمه و پیوست‌ها ({toPersianDigits(task.attachments.length)})
                </h4>
              </div>
              <button
                onClick={() => setIsAddingAttachment(!isAddingAttachment)}
                className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1.5 cursor-pointer bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1.5 rounded-xl transition-all"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>آپلود فایل ضمیمه</span>
              </button>
            </div>

            {/* Hidden real file input */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileUpload}
              className="hidden"
            />

            {/* Advanced File Upload Box */}
            {isAddingAttachment && (
              <div className="p-4 bg-slate-50 rounded-2xl border border-indigo-200 space-y-3 animate-in fade-in">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                    <Folder className="w-4 h-4 text-indigo-600" />
                    <span>آپلود و پوشه‌بندی در آرشیو رسانه (DAM)</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsAddingAttachment(false)}
                    className="text-slate-400 hover:text-slate-600 text-xs"
                  >
                    بستن
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {/* Target Folder */}
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                      پوشه مقصد در DAM
                    </label>
                    <select
                      value={selectedFolderId}
                      onChange={(e) => setSelectedFolderId(e.target.value)}
                      className="w-full p-2 bg-white border border-slate-200 rounded-xl text-slate-800 font-medium focus:outline-hidden"
                    >
                      {folders.map(f => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Target Category */}
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                      دسته‌بندی رسانه‌ای
                    </label>
                    <select
                      value={selectedCategory}
                      onChange={(e) => setSelectedCategory(e.target.value)}
                      className="w-full p-2 bg-white border border-slate-200 rounded-xl text-slate-800 font-medium focus:outline-hidden"
                    >
                      {categories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={saveToDAM}
                    onChange={(e) => setSaveToDAM(e.target.checked)}
                    className="rounded-sm text-indigo-600"
                  />
                  <span>ذخیره همزمان در ماژول مدیریت دارایی‌های دیجیتال (DAM)</span>
                </label>

                {/* Dropzone & Browse button */}
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-indigo-300 hover:border-indigo-500 bg-indigo-50/50 hover:bg-indigo-50/80 p-5 rounded-2xl text-center cursor-pointer transition-all space-y-1"
                >
                  <Upload className="w-6 h-6 text-indigo-600 mx-auto" />
                  <p className="text-xs font-bold text-indigo-900">کلیک کنید یا فایل‌ها را به اینجا بکشید</p>
                  <p className="text-[10px] text-slate-500">پشتیبانی از انواع فایل‌های ویدیویی، تصویری، صوتی، اسناد PDF و آرشیوها</p>
                </div>

                {/* Quick manual link/name input */}
                <form onSubmit={handleManualAttachmentSubmit} className="flex gap-2 pt-2 border-t border-slate-200">
                  <input
                    type="text"
                    value={attachmentName}
                    onChange={(e) => setAttachmentName(e.target.value)}
                    placeholder="یا ثبت نام فایل/لینک پیوست دستی..."
                    className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs focus:outline-hidden"
                  />
                  <button
                    type="submit"
                    className="px-3.5 py-1.5 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-colors cursor-pointer"
                  >
                    ثبت پیوست
                  </button>
                </form>
              </div>
            )}

            {/* List of uploaded attachments */}
            <div className="space-y-2">
              {task.attachments.map(att => (
                <div
                  key={att.id}
                  className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-200/80 text-xs hover:bg-slate-100/70 transition-all group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <FileText className="w-4 h-4 text-indigo-600 shrink-0" />
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 truncate">{att.name}</p>
                      <p className="text-[10px] text-slate-500 font-mono">{toPersianDigits(att.size)} • ثبت: {formatToJalaliNumber(att.uploadDate)}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {att.url && att.url !== '#' && (
                      <a
                        href={att.url}
                        download={att.name}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs font-bold text-indigo-600 hover:bg-indigo-50 transition-colors flex items-center gap-1"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>دانلود</span>
                      </a>
                    )}

                    <button
                      onClick={() => {
                        if (confirm(`آیا از حذف فایل پیوست "${att.name}" اطمینان دارید؟`)) {
                          deleteAttachment(task.id, att.id);
                        }
                      }}
                      title="حذف فایل ضمیمه"
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}

              {task.attachments.length === 0 && !isAddingAttachment && (
                <div className="text-center py-6 border border-dashed border-slate-200 rounded-2xl text-slate-400 text-xs">
                  هیچ فایل ضمیمه‌ای برای این وظیفه آپلود نشده است.
                </div>
              )}
            </div>
          </div>

          {/* Comments & Discussion */}
          <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-4">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-indigo-600" />
              <h4 className="text-xs font-bold text-slate-900">
                دیدگاه‌ها و هماهنگی‌ها ({toPersianDigits(task.comments.length)})
              </h4>
            </div>

            {/* Comment Thread */}
            <div className="space-y-3">
              {task.comments.map(c => {
                const commentAuthor = users.find(u => u.id === c.userId);
                return (
                  <div key={c.id} className="p-3 bg-slate-50 rounded-2xl border border-slate-100 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Avatar user={commentAuthor} size="xs" />
                        <span className="text-xs font-bold text-slate-900">{commentAuthor?.name}</span>
                        <span className="text-[10px] text-slate-500">({commentAuthor?.title})</span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit' }).format(new Date(c.timestamp))}
                      </span>
                    </div>
                    <p className="text-xs text-slate-700 leading-relaxed pr-7">{c.text}</p>
                  </div>
                );
              })}
            </div>

            {/* Add Comment Input */}
            <form onSubmit={handleCommentSubmit} className="flex gap-2 pt-2">
              <input
                type="text"
                value={newCommentText}
                onChange={(e) => setNewCommentText(e.target.value)}
                placeholder={`ارسال دیدگاه به عنوان ${currentUser.name}...`}
                className="flex-1 px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-hidden"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
              >
                <Send className="w-3.5 h-3.5 rotate-180" />
                <span>ارسال</span>
              </button>
            </form>
          </div>

          {/* Activity History Audit */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
              <History className="w-3.5 h-3.5 text-slate-500" />
              <span>تاریخچه و سوابق فعالیت‌های تسک</span>
            </div>
            <div className="space-y-1.5 text-[11px] text-slate-600">
              {task.activityHistory.slice(0, 6).map(act => {
                const user = users.find(u => u.id === act.userId);
                return (
                  <div key={act.id} className="flex items-center justify-between py-1 border-b border-slate-200/50 last:border-0">
                    <span>
                      <span className="font-bold text-slate-800">{user?.name || 'کاربر'}:</span> {act.action}
                    </span>
                    <span className="text-slate-400 font-mono text-[10px]">
                      {formatToJalaliNumber(act.timestamp)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

