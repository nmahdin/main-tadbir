import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, Archive, CalendarDays, CheckCircle2, CheckSquare, Clock3,
  FolderKanban, History, MessageSquare, Pencil, RotateCcw, Send, Tags, Trash2, UserRound,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { Task, TaskStatus } from '../../types';
import { useContent, useTask } from '../../queries/resources';
import { contentWorkTaskStatuses } from '../../utils/contentWorkflow';
import { formatToJalaliNumber, toPersianDigits } from '../../utils/jalali';
import { Avatar } from '../common/Avatar';
import { PriorityPill, TaskStatusBadge } from '../common/PriorityPill';
import { Button, ErrorState, LoadingState, Modal } from '../common/Primitives';
import { TaskAssetsSection } from './TaskAssetsSection';
import { EditTaskModal } from './EditTaskModal';

function DetailItem({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5">
    <div className="mb-2 flex items-center gap-2 text-[10px] font-bold text-slate-500">{icon}<span>{label}</span></div>
    <div className="min-w-0 text-xs font-bold text-slate-800">{children}</div>
  </div>;
}

// Rows returned for task lists intentionally omit these heavier collections.
// Never render a list row as task details while the dedicated show request is loading.
const CONTENT_STAGE_STATUS_LABELS: Record<string, string> = {
  pending_dependency: 'در انتظار پیش‌نیاز', ready: 'آمادهٔ شروع', not_started: 'شروع‌نشده', in_progress: 'در حال انجام',
  ready_for_review: 'آمادهٔ بازبینی', pending_approval: 'در انتظار تأیید', needs_revision: 'نیازمند اصلاح',
  revisions_needed: 'نیازمند بازبینی', approved: 'تأییدشده', completed: 'تکمیل‌شده', skipped: 'عبور از مرحله',
};

const hasTaskDetails = (task?: Task): task is Task => !!task
  && Array.isArray(task.tags)
  && Array.isArray(task.subtasks)
  && Array.isArray(task.comments)
  && Array.isArray(task.attachments)
  && Array.isArray(task.activityHistory);

export const TaskDetailDrawer: React.FC = () => {
  const {
    pendingMutationKeys, isLoggedIn, selectedTaskId, setSelectedTaskId, tasks, projects, contents,
    hasPermission, setSelectedContentId, setActiveView, users, currentUser, taskStatuses,
    updateTask, cacheTask, deleteTask, archiveItem, unarchiveItem, moveTaskStatus,
    toggleSubtask, addSubtask, deleteSubtask, addComment,
  } = useApp();
  const [editing, setEditing] = useState(false);
  const [newSubtaskText, setNewSubtaskText] = useState('');
  const [newCommentText, setNewCommentText] = useState('');
  const localTask = selectedTaskId ? tasks.find(item => item.id === selectedTaskId) : undefined;
  const taskQuery = useTask(selectedTaskId || '');
  const contentQuery = useContent(localTask?.contentId || taskQuery.data?.contentId || '');

  useEffect(() => { if (taskQuery.data) cacheTask(taskQuery.data); }, [taskQuery.dataUpdatedAt]);
  useEffect(() => { setEditing(false); setNewSubtaskText(''); setNewCommentText(''); }, [selectedTaskId]);

  if (!isLoggedIn || !selectedTaskId) return null;
  const task = (hasTaskDetails(localTask) ? localTask : undefined) || (hasTaskDetails(taskQuery.data) ? taskQuery.data : undefined);
  const close = () => setSelectedTaskId(null);
  if (!task) return <Modal open onClose={close} title="جزئیات وظیفه">{taskQuery.isError ? <ErrorState error={taskQuery.error} onRetry={() => void taskQuery.refetch()} /> : <LoadingState label="در حال دریافت جزئیات وظیفه…" />}</Modal>;

  const busy = pendingMutationKeys.includes(`tasks:${task.id}`);
  const reviewTask = task.kind === 'content_review';
  const workTask = task.kind === 'content_work';
  const publicationTask = task.kind === 'content_publish';
  const workflowManaged = ['content_work', 'content_review', 'content_publish', 'content_correction'].includes(task.kind || '');
  const sourceFields = workflowManaged;
  const relatedContent = contents.find(item => item.id === task.contentId) || contentQuery.data;
  const relatedStages = relatedContent?.stages || [];
  const workflowStageIndex = relatedStages.findIndex(stage => stage.id === task.contentStageId);
  const workflowStage = workflowStageIndex >= 0 ? relatedStages[workflowStageIndex] : undefined;
  const workflowStatuses = workflowStage ? contentWorkTaskStatuses(workflowStage, workflowStageIndex, relatedStages) : [];
  const workflowActions = workflowStatuses.filter(status => status !== task.status);
  const workflowReady = relatedStages.length > 0 && relatedStages.every(stage => ['approved', 'completed', 'skipped'].includes(stage.status));
  const missingWorkflowOutput = workflowStage?.outputs.some(output => output.isRequired && output.isDelivered !== true
    && ![output.value, output.url, output.assetId, output.fileName].some(value => !!value)) || false;
  const workflowActionHint = !workflowStage ? 'جزئیات مرحله هنوز در دسترس نیست؛ محتوای مرتبط را باز کنید.'
    : workflowStage.status === 'pending_dependency' ? 'مرحله تا تکمیل یا ارجاع پیش‌نیازهایش قابل شروع نیست.'
      : ['ready_for_review', 'pending_approval'].includes(workflowStage.status) ? 'این مرحله در انتظار اقدام ارزیاب است.'
        : ['approved', 'completed', 'skipped'].includes(workflowStage.status) ? 'این مرحله پایان یافته و وضعیتش از گردش کار می‌آید.'
          : missingWorkflowOutput ? 'پیش از ارسال یا تکمیل مرحله، خروجی‌های ضروری را ثبت کنید.'
            : 'اکنون اقدام دیگری برای این مرحله مجاز نیست.';
  const contentPublished = relatedContent?.status === 'published' || relatedContent?.publishInfo?.status === 'published';
  const mayChangeTaskStatus = task.assigneeId === currentUser.id || hasPermission('tasks.status');
  const canStatus = !busy && (workTask
    ? task.assigneeId === currentUser.id && workflowActions.length > 0
    : publicationTask
      ? mayChangeTaskStatus && hasPermission('content.publish') && (contentPublished ? task.status === 'completed' : workflowReady && task.status !== 'completed')
      : mayChangeTaskStatus && (!reviewTask || (task.status !== 'completed' && hasPermission('content.approve'))));
  const workflowActionLabel = (status: TaskStatus) => status === 'in_progress'
    ? (workflowStage && ['needs_revision', 'revisions_needed'].includes(workflowStage.status) ? 'ادامهٔ اصلاح مرحله' : 'شروع مرحله')
    : status === 'review' ? 'ارسال برای بازبینی'
      : status === 'completed' ? 'تکمیل مرحله'
        : 'بازگردانی به شروع';
  const canChecklist = !busy && (task.assigneeId === currentUser.id || hasPermission('tasks.edit'));
  const canEdit = !sourceFields && !busy && hasPermission('tasks.edit');
  const project = projects.find(item => item.id === task.projectId);
  const assignee = users.find(item => item.id === task.assigneeId);
  const completedSubtasks = task.subtasks.filter(item => item.completed).length;
  const progress = task.subtasks.length ? Math.round((completedSubtasks / task.subtasks.length) * 100) : 0;

  if (editing) return <EditTaskModal task={task} onClose={() => setEditing(false)} />;

  const submitSubtask = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canChecklist || !newSubtaskText.trim()) return;
    if (await addSubtask(task.id, newSubtaskText.trim())) setNewSubtaskText('');
  };
  const submitComment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!newCommentText.trim() || busy) return;
    if (await addComment(task.id, newCommentText.trim())) setNewCommentText('');
  };

  return <Modal open onClose={close} title="جزئیات وظیفه" description="مشاهدهٔ اطلاعات، پیشرفت، دارایی‌ها و گفت‌وگو" icon={<CheckSquare className="h-5 w-5" />} busy={busy} size="xl">
    <div className="max-h-[calc(94dvh-82px)] overflow-y-auto bg-slate-50/40">
      <section className="border-b border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {project && <span className="rounded-lg px-2.5 py-1 text-[10px] font-black text-white" style={{ backgroundColor: project.color }}>{project.name}</span>}
              <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-500">#{toPersianDigits(task.id)}</span>
              <TaskStatusBadge status={task.status} size="sm" />
              <PriorityPill priority={task.priority} size="sm" />
            </div>
            <h3 className="text-xl font-black leading-9 text-slate-950 sm:text-2xl">{task.title}</h3>
            <p className="mt-3 max-w-3xl whitespace-pre-wrap text-sm leading-7 text-slate-600">{task.description || 'برای این وظیفه توضیحی ثبت نشده است.'}</p>
            {task.tags.length > 0 && <div className="mt-4 flex flex-wrap gap-1.5">{task.tags.map(tag => <span key={tag} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-600">#{tag}</span>)}</div>}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {canEdit && <Button variant="secondary" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" />ویرایش وظیفه</Button>}
            {workTask ? <>
              {workflowActions.map(status => <Button key={status} disabled={!canStatus} loading={busy} variant={status === 'completed' ? 'success' : 'secondary'} onClick={() => void moveTaskStatus(task.id, status)}><CheckCircle2 className="h-4 w-4" />{workflowActionLabel(status)}</Button>)}
              {workflowActions.length === 0 && <span className="max-w-56 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-bold leading-5 text-slate-500">وضعیت از گردش کار محتوا پیروی می‌کند؛ برای اقدام مجاز، مرحلهٔ مرتبط را بررسی کنید.</span>}
            </> : <Button disabled={!canStatus} loading={busy} variant={task.status === 'completed' ? 'secondary' : 'success'} onClick={() => void moveTaskStatus(task.id, publicationTask ? (contentPublished ? 'backlog' : 'completed') : task.status === 'completed' ? 'backlog' : 'completed')}><CheckCircle2 className="h-4 w-4" />{publicationTask ? (contentPublished ? 'لغو ثبت انتشار' : 'ثبت انتشار در تدبیر') : reviewTask ? (task.status === 'completed' ? 'تأییدشده' : 'تأیید و تکمیل') : task.status === 'completed' ? 'بازگشایی' : 'تکمیل'}</Button>}
            {!workflowManaged && (task.status === 'archived'
              ? <Button variant="ghost" disabled={!canStatus} title="بازیابی از بایگانی" aria-label="بازیابی از بایگانی" onClick={() => void unarchiveItem('task', task.id)}><RotateCcw className="h-4 w-4" /></Button>
              : <Button variant="ghost" disabled={!canStatus} title="بایگانی وظیفه" aria-label="بایگانی وظیفه" onClick={() => { if (confirm(`«${task.title}» بایگانی شود؟`)) void archiveItem('task', task.id); }}><Archive className="h-4 w-4" /></Button>)}
            <Button variant="ghost" disabled={busy || workflowManaged || !hasPermission('tasks.delete')} title="حذف وظیفه" aria-label="حذف وظیفه" onClick={() => void deleteTask(task.id)} className="text-rose-600"><Trash2 className="h-4 w-4" /></Button>
          </div>
        </div>
      </section>

      <div className="space-y-5 p-5 sm:p-6">
        {task.parentTaskId && hasPermission('tasks.view') && <button type="button" className="ui-button ui-button-secondary" onClick={() => setSelectedTaskId(task.parentTaskId!)}>مشاهدهٔ وظیفهٔ قبلی این اصلاح</button>}
        {task.isBlocked && <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-900"><div className="flex items-center gap-2 text-xs font-black"><AlertTriangle className="h-4 w-4" />این وظیفه مسدود شده است</div><p className="mt-2 text-xs leading-6 text-rose-700">{task.blockedReason || 'به‌دلیل وابستگی مرحلهٔ قبل متوقف شده است.'}</p>{canEdit && <button onClick={() => void updateTask(task.id, { isBlocked: false, blockedReason: undefined })} className="mt-2 text-xs font-bold text-rose-800 underline">رفع مسدودی</button>}</section>}

        {publicationTask && <section className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-xs leading-6 text-indigo-900"><p className="font-black">ثبت انتشار محتوا در سامانه</p><p>این اقدام پس از تکمیل گردش کار، وضعیت انتشار را در تدبیر ثبت می‌کند؛ ارسال محتوا به کانال‌های بیرونی انجام نمی‌شود.</p>{task.contentId && hasPermission('content.view') && <button className="mt-2 font-bold text-indigo-700 underline" onClick={() => { setSelectedContentId(task.contentId!); close(); setActiveView('content-detail'); }}>مشاهدهٔ محتوای مرتبط</button>}</section>}
        {workTask && <section className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-xs leading-6 text-sky-900"><p className="font-black">مرحلهٔ گردش کار: {workflowStage?.title || 'در حال دریافت اطلاعات مرحله'}</p><p className="mt-1">وضعیت فعلی: {workflowStage ? CONTENT_STAGE_STATUS_LABELS[workflowStage.status] || workflowStage.status : 'نامشخص'}. {workflowActionHint}</p>{task.contentId && hasPermission('content.view') && <button className="mt-2 font-bold text-sky-700 underline" onClick={() => { setSelectedContentId(task.contentId!); close(); setActiveView('content-detail'); }}>مشاهدهٔ پرونده و خروجی‌های مرحله</button>}</section>}
        {reviewTask && task.contentId && hasPermission('content.view') && <section className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-xs"><p>وضعیت این وظیفه تابع تصمیم مرحلهٔ محتوا است.</p><Link onClick={close} className="mt-2 inline-block font-bold text-indigo-700 underline" to={`/contents/${task.contentId}`}>مشاهدهٔ محتوای مرتبط</Link></section>}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <DetailItem icon={<UserRound className="h-3.5 w-3.5" />} label="مسئول انجام"><div className="flex items-center gap-2"><Avatar user={assignee} size="xs" /><span className="truncate">{assignee?.name || 'تعیین نشده'}</span></div></DetailItem>
          <DetailItem icon={<FolderKanban className="h-3.5 w-3.5" />} label="پروژه مرتبط"><span className="truncate">{project?.name || 'وظیفه مستقل'}</span></DetailItem>
          <DetailItem icon={<CalendarDays className="h-3.5 w-3.5" />} label="مهلت انجام">{task.deadline ? formatToJalaliNumber(task.deadline) : 'بدون مهلت'}</DetailItem>
          <DetailItem icon={<Clock3 className="h-3.5 w-3.5" />} label="برآورد زمان">{toPersianDigits(task.estimatedHours)} ساعت</DetailItem>
          <DetailItem icon={<CheckCircle2 className="h-3.5 w-3.5" />} label="وضعیت اجرایی">{canStatus && !workflowManaged ? <select value={task.status} onChange={event => void moveTaskStatus(task.id, event.target.value as TaskStatus)} className="ui-input h-9 py-1 text-xs">{[...taskStatuses].sort((a,b) => a.order-b.order).map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select> : <TaskStatusBadge status={task.status} size="sm" />}</DetailItem>
          <DetailItem icon={<Tags className="h-3.5 w-3.5" />} label="آخرین تغییر">{task.updatedAt ? formatToJalaliNumber(task.updatedAt) : 'نامشخص'}</DetailItem>
        </section>

        {task.subtasks.length > 0 && <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3"><div><h4 className="flex items-center gap-2 text-xs font-black text-slate-900"><CheckSquare className="h-4 w-4 text-indigo-600" />چک‌لیست وظیفه</h4><p className="mt-1 text-[10px] text-slate-500">{toPersianDigits(completedSubtasks)} از {toPersianDigits(task.subtasks.length)} مورد انجام شده</p></div><span className="text-xs font-black text-indigo-700">{toPersianDigits(progress)}٪</span></div>
          <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${progress}%` }} /></div>
          <div className="space-y-2">{task.subtasks.map(item => <div key={item.id} className="group flex items-center gap-3 rounded-xl border border-slate-100 px-3 py-2.5"><input type="checkbox" checked={item.completed} disabled={!canChecklist} onChange={() => void toggleSubtask(task.id, item.id)} className="h-4 w-4 rounded text-indigo-600" /><span className={`min-w-0 flex-1 text-xs ${item.completed ? 'text-slate-400 line-through' : 'font-bold text-slate-700'}`}>{item.title}</span>{canChecklist && <button aria-label={`حذف ${item.title}`} onClick={() => void deleteSubtask(task.id, item.id)} className="p-1 text-slate-400 opacity-0 transition group-hover:opacity-100 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>}</div>)}</div>
          <form onSubmit={submitSubtask} className="mt-4 flex gap-2 border-t border-slate-100 pt-4"><input value={newSubtaskText} onChange={event => setNewSubtaskText(event.target.value)} disabled={!canChecklist} placeholder="عنوان مورد جدید…" className="ui-input flex-1" /><Button type="submit" variant="secondary" disabled={!canChecklist || !newSubtaskText.trim()}>افزودن</Button></form>
        </section>}

        {hasPermission('assets.view') && <TaskAssetsSection key={task.id} task={task} />}

        <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="mb-4 flex items-center gap-2"><MessageSquare className="h-4 w-4 text-indigo-600" /><h4 className="text-xs font-black text-slate-900">دیدگاه‌ها و هماهنگی‌ها</h4><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{toPersianDigits(task.comments.length)}</span></div>
          <div className="space-y-3">{task.comments.map(comment => { const author = users.find(user => user.id === comment.userId); return <article key={comment.id} className="rounded-2xl bg-slate-50 p-3.5"><div className="flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-2"><Avatar user={author} size="xs" /><span className="truncate text-xs font-black text-slate-800">{author?.name || 'کاربر'}</span><span className="truncate text-[10px] text-slate-400">{author?.title}</span></div><time className="shrink-0 text-[10px] text-slate-400">{formatToJalaliNumber(comment.timestamp)}</time></div><p className="mt-2 whitespace-pre-wrap pr-7 text-xs leading-6 text-slate-700">{comment.text}</p></article>; })}</div>
          {task.comments.length === 0 && <p className="py-3 text-center text-xs text-slate-400">هنوز دیدگاهی ثبت نشده است.</p>}
          <form onSubmit={submitComment} className="mt-4 flex gap-2 border-t border-slate-100 pt-4"><input value={newCommentText} onChange={event => setNewCommentText(event.target.value)} placeholder={`ارسال دیدگاه به عنوان ${currentUser.name}…`} className="comment-composer ui-input flex-1" /><Button type="submit" disabled={!newCommentText.trim() || busy}><Send className="h-4 w-4 rotate-180" />ارسال</Button></form>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"><div className="mb-3 flex items-center gap-2"><History className="h-4 w-4 text-slate-500" /><h4 className="text-xs font-black text-slate-800">تاریخچه فعالیت</h4></div><div className="divide-y divide-slate-100">{task.activityHistory.slice(0, 8).map(activity => <div key={activity.id} className="flex items-start justify-between gap-4 py-2.5 text-[11px]"><span className="leading-6 text-slate-600"><strong className="text-slate-800">{users.find(user => user.id === activity.userId)?.name || 'سیستم'}:</strong> {activity.action}</span><time className="shrink-0 text-slate-400">{formatToJalaliNumber(activity.timestamp)}</time></div>)}</div>{task.activityHistory.length === 0 && <p className="py-3 text-center text-xs text-slate-400">تاریخچه‌ای ثبت نشده است.</p>}</section>
      </div>
    </div>
  </Modal>;
};
