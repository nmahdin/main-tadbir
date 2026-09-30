import { ConfirmedTextField } from '../common/ConfirmedTextField';
import { Link } from 'react-router-dom';
import { ErrorState, LoadingState, Modal } from '../common/Primitives';
import React, { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Task, TaskStatus, Priority } from '../../types';
import { TaskAssetsSection } from './TaskAssetsSection';
import { PriorityPill, TaskStatusBadge } from '../common/PriorityPill';
import { Avatar } from '../common/Avatar';
import { PersianDatePicker } from '../common/PersianDatePicker';
import { formatToJalaliNumber, toPersianDigits } from '../../utils/jalali';
import { useTask } from '../../queries/resources';
import {
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
  CheckCircle2,
  Upload,
  Sparkles,
  FileText,
  Folder,
  Download,
  Eye,
  Check,
  Layers,
  Archive,
  RotateCcw
} from 'lucide-react';

export const TaskDetailDrawer: React.FC = () => {
  const {
    pendingMutationKeys,
    isLoggedIn,
    notify,
    selectedTaskId,
    setSelectedTaskId,
    tasks,
    projects,
    contents,
    hasPermission,
    setSelectedContentId,
    setActiveView,
    users,
    currentUser,
    taskStatuses,
    taskPriorities,
    updateTask,
    cacheTask,
    deleteTask,
    archiveItem,
    unarchiveItem,
    moveTaskStatus,
    toggleSubtask,
    addSubtask,
    deleteSubtask,
    addComment,
  } = useApp();

  const [newSubtaskText, setNewSubtaskText] = useState('');
  const [newCommentText, setNewCommentText] = useState('');
  const localTask = selectedTaskId ? tasks.find(item => item.id === selectedTaskId) : undefined;
  const taskQuery = useTask(selectedTaskId || '');
  useEffect(() => {
    if (taskQuery.data) cacheTask(taskQuery.data);
  }, [taskQuery.dataUpdatedAt]);

  if (!isLoggedIn || !selectedTaskId) return null;

  const task = localTask || taskQuery.data;
  const close = () => setSelectedTaskId(null);
  if (!task) return <Modal open onClose={close} title="جزئیات وظیفه">{taskQuery.isError ? <ErrorState error={taskQuery.error} onRetry={() => void taskQuery.refetch()} /> : <LoadingState label="در حال دریافت جزئیات وظیفه…" />}</Modal>;

  const busy = pendingMutationKeys.includes(`tasks:${task.id}`);
  const reviewTask = task.kind === 'content_review';
  const canStatus = !busy && !reviewTask && (task.assigneeId === currentUser.id || hasPermission('tasks.status'));
  const sourceFields = ['content_work','content_review'].includes(task.kind || '');
  const canChecklist = !busy && (task.assigneeId === currentUser.id || hasPermission('tasks.edit'));
  const canEdit = !sourceFields && !busy && hasPermission('tasks.edit');
  const project = projects.find(p => p.id === task.projectId);
  const assignee = users.find(u => u.id === task.assigneeId);
  const completedSubtasks = task.subtasks.filter(s => s.completed).length;

  const handleSubtaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canChecklist || !newSubtaskText.trim()) return;
    if (!busy && await addSubtask(task.id, newSubtaskText.trim())) setNewSubtaskText('');
  };

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommentText.trim()) return;
    if (!busy && await addComment(task.id, newCommentText.trim())) setNewCommentText('');
  };

  return (
    <Modal open onClose={close} title={task.title} description="جزئیات، وضعیت، چک‌لیست و گفت‌وگوی وظیفه" icon={<CheckSquare className="w-5 h-5" />} busy={busy}>
      {task.parentTaskId && hasPermission("tasks.view") && <button type="button" className="ui-button ui-button-secondary m-3" onClick={() => setSelectedTaskId(task.parentTaskId!)}>وظیفهٔ قبلی این اصلاح</button>}
      <div className="w-full bg-white flex flex-col">
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
              disabled={!canStatus}
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

            {task.status === 'archived' ? (
              <button
                disabled={!canStatus} onClick={() => unarchiveItem('task', task.id)}
                title="بازیابی از بایگانی" aria-label="بازیابی از بایگانی"
                className="p-1.5 text-slate-500 hover:text-emerald-600 rounded-xl hover:bg-emerald-50 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            ) : (
              <button
                disabled={!canStatus} onClick={() => { if (confirm(`«${task.title}» بایگانی شود؟`)) archiveItem('task', task.id); }}
                title="بایگانی وظیفه" aria-label="بایگانی وظیفه"
                className="p-1.5 text-slate-500 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <Archive className="w-4 h-4" />
              </button>
            )}

            <button
              disabled={busy || reviewTask || !hasPermission('tasks.delete')} onClick={() => deleteTask(task.id)}
              title="حذف وظیفه" aria-label="حذف وظیفه"
              className="p-1.5 text-slate-500 hover:text-rose-600 rounded-xl hover:bg-rose-50 transition-colors cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
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

          {(task.kind === 'content_publish' || (task.kind === 'content_work' && contents.find(c => c.id === task.contentId)?.stages?.some(s => s.id === task.contentStageId && s.stageKey === 'publish'))) && <section className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-xs space-y-2">
            <p className="font-bold text-indigo-900">تسک مرتبط با انتشار محتوا</p>
            <p>با ثبت موفق انتشار در تدبیر تکمیل می‌شود. تغییر دستی وضعیت این تسک، محتوای اصلی را منتشر نمی‌کند.</p>
            {task.activityHistory.filter(a => a.type === 'automatic_status_change').slice(-1).map(a => <p key={a.id} className="text-emerald-800">{a.action}</p>)}
            {task.contentId && hasPermission('content.view') && <button className="text-indigo-700 underline" onClick={() => { setSelectedContentId(task.contentId!); setSelectedTaskId(null); setActiveView('content-detail'); }}>رفتن به محتوای مرتبط{contents.find(c => c.id === task.contentId) ? `: ${contents.find(c => c.id === task.contentId)?.title}` : ''}</button>}
          </section>}

          {reviewTask && task.contentId && hasPermission('content.view') && <section className="p-3 bg-indigo-50 rounded-xl text-sm"><p>وضعیت این تسک تابع تصمیم مرحلهٔ محتوا است.</p><Link onClick={close} className="text-indigo-700 underline" to={`/contents/${task.contentId}`}>مشاهدهٔ محتوای مرتبط</Link>{hasPermission('content.approve') && <Link onClick={close} className="ui-button ui-button-secondary mr-2" to={`/approvals?${new URLSearchParams({content:task.contentId,stage:task.contentStageId || ''})}`}>مرکز بررسی</Link>}</section>}
          {task.contentId && ['content_work','content_correction'].includes(task.kind || '') && hasPermission('content.view') && <section className="p-3 bg-indigo-50 rounded-xl text-sm"><p>{task.kind==='content_correction'?'وظیفهٔ اصلاح پس از بازبینی محتوا':'وظیفهٔ مرحلهٔ تولید محتوا'}</p><Link onClick={close} className="text-indigo-700 underline" to={`/contents/${task.contentId}?tab=process`}>رفتن به مرحله و خروجی‌های محتوا</Link></section>}
          {/* Title input */}
          <div>
            <label className="text-[11px] font-bold text-slate-500 block mb-1">عنوان وظیفه</label>
            <ConfirmedTextField key={`title:${task.id}`} label="عنوان وظیفه"
              type="text"
              value={task.title} disabled={!canEdit}
              save={value => updateTask(task.id, { title:value })}
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
                value={task.status} disabled={!canStatus}
                onChange={(e) => moveTaskStatus(task.id, e.target.value as TaskStatus)}
                className="w-full p-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-800 focus:outline-hidden"
              >
                {[...taskStatuses].sort((a, b) => a.order - b.order).map(st => (
                  <option key={st.id} value={st.id}>{st.label}</option>
                ))}
              </select>
            </div>

            {/* Priority */}
            <div>
              <label className="text-[10px] font-bold text-slate-600 block mb-1">
                اولویت اجرایی
              </label>
              <select
                value={task.priority} disabled={!canEdit}
                onChange={(e) => updateTask(task.id, { priority: e.target.value as Priority })}
                className="w-full p-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-800 focus:outline-hidden"
              >
                {[...taskPriorities].sort((a, b) => b.order - a.order).map(pr => (
                  <option key={pr.id} value={pr.id}>{pr.label}</option>
                ))}
              </select>
            </div>

            {/* Assignee */}
            <div>
              <label className="text-[10px] font-bold text-slate-600 block mb-1">
                مسئول انجام
              </label>
              <select
                value={task.assigneeId} disabled={busy || sourceFields || task.kind === 'content_correction' || !hasPermission('tasks.assign')}
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
                value={task.projectId} disabled={!canEdit || task.kind === 'content_correction' || task.kind === 'content_publish'}
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
              <fieldset disabled={!canEdit}><PersianDatePicker
                value={task.deadline}
                onChange={(val) => updateTask(task.id, { deadline: val })}
                placeholder="انتخاب مهلت..."
                className="text-xs"
              /></fieldset>
            </div>

            {/* Estimated Hours */}
            <div>
              <label className="text-[10px] font-bold text-slate-600 block mb-1">
                برآورد زمان (ساعت)
              </label>
              <ConfirmedTextField key={`hours:${task.id}`} label="برآورد زمان"
                type="number"
                min="1"
                max="200"
                value={task.estimatedHours} disabled={!canEdit}
                save={value=>updateTask(task.id,{estimatedHours:Number(value)})}
                className="w-full p-2 bg-white border border-slate-200 rounded-xl font-semibold text-slate-800 focus:outline-hidden"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5">
              توضیحات و نیازمندی‌های تولید
            </label>
            <ConfirmedTextField key={`description:${task.id}`} label="توضیحات وظیفه" multiline
              rows={3}
              value={task.description} disabled={!canEdit}
              save={value=>updateTask(task.id,{description:value})}
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
                      checked={st.completed} disabled={!canChecklist}
                      onChange={() => toggleSubtask(task.id, st.id)}
                      className="w-4 h-4 rounded-md text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                    <span className={st.completed ? 'line-through text-slate-400' : 'font-medium text-slate-800'}>
                      {st.title}
                    </span>
                  </label>
                  <button
                    disabled={!canChecklist} aria-label={`حذف زیرفعالیت ${st.title}`} onClick={() => deleteSubtask(task.id, st.id)}
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
                disabled={!canChecklist} placeholder="عنوان زیرفعالیت یا چک‌لیست جدید..."
                className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:border-indigo-500 focus:outline-hidden"
              />
              <button
                type="submit" disabled={!canChecklist || !newSubtaskText.trim()}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors"
              >
                افزودن
              </button>
            </form>
          </div>

          {hasPermission('assets.view') && <TaskAssetsSection key={task.id} task={task} />}

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
                className="comment-composer flex-1 px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-hidden"
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
    </Modal>
  );
};

