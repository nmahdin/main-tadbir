import React from 'react';
import { AlertTriangle, ClipboardList, Layers, ListChecks, Plus, Settings, ShieldCheck } from 'lucide-react';
import type { Content, ContentProcessTemplate, ContentStage, ContentStageStatus, User } from '../../types';
import { TaskStatusBadge } from '../common/PriorityPill';
import { formatPersianDate } from '../../utils/date';
import {
  activeFlowTemplate,
  flowsForContentType,
  flowHasStarted,
  stageStatusLabel,
  stageWaitingReason,
  finishedStageCount,
} from '../../utils/contentWorkflow';

/** یک تسک واقعی همان پرونده؛ همان چیزی که API تسک‌ها برمی‌گرداند. */
export type FlowStageTask = {
  id: string;
  contentStageId?: string | null;
  kind?: string;
  title?: string;
  status?: string;
  assigneeId?: string;
  isBlocked?: boolean;
  blockedReason?: string | null;
};

export interface ContentFlowPanelProps {
  content: Content;
  stages: ContentStage[];
  templates: ContentProcessTemplate[];
  users: User[];
  departments: Array<{ id: string; name: string }>;
  /** مجوز ویرایش خود پرونده؛ اعمال جریان روی پروندهٔ شروع‌نشده. */
  canEdit: boolean;
  /** مجوز مدیریت گردش کار؛ باز کردن ویرایشگر مراحل. */
  canManageWorkflow: boolean;
  canOpenSettings: boolean;
  onOpenWorkflowEditor: () => void;
  onOpenSettings: () => void;
  onApplyTemplate: (template: ContentProcessTemplate) => void;
  applyingTemplateId: string | null;
  /** تسک‌های واقعی همین پرونده؛ مبنای نمایش «تسک ساخته شده/نشده». */
  stageTasks: FlowStageTask[];
  tasksLoading: boolean;
  tasksError: boolean;
}

/** تن رنگی وضعیت مرحله؛ فقط معنای وضعیت را نشان می‌دهد، نه رنگ ماژول. */
const stageTone = (status: ContentStageStatus | string): string => {
  switch (status) {
    case 'approved':
    case 'completed':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'in_progress':
    case 'ready':
      return 'border-indigo-200 bg-indigo-50 text-indigo-700';
    case 'ready_for_review':
    case 'pending_approval':
      return 'border-indigo-200 bg-indigo-50 text-indigo-700';
    case 'needs_revision':
    case 'revisions_needed':
      return 'border-rose-200 bg-rose-50 text-rose-700';
    case 'pending_dependency':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    default:
      return 'border-slate-200 bg-slate-50 text-slate-600';
  }
};

/**
 * تب «جریان‌های محتوا»: جریان فعال پرونده، زنجیرهٔ مرحله‌ها با پیش‌نیاز واقعی
 * هر مرحله، وضعیت تسک ساخته‌شده برای همان مرحله و جریان‌های قابل اعمال روی این
 * نوع محتوا. هیچ عدد یا وضعیتی ساخته نمی‌شود: همه از payload سرور و API تسک‌ها
 * می‌آید و قاعدهٔ «تسک فقط پس از اتمام پیش‌نیاز» همان قانون سرور است.
 */
export const ContentFlowPanel: React.FC<ContentFlowPanelProps> = ({
  content,
  stages,
  templates,
  users,
  departments,
  canEdit,
  canManageWorkflow,
  canOpenSettings,
  onOpenWorkflowEditor,
  onOpenSettings,
  onApplyTemplate,
  applyingTemplateId,
  stageTasks,
  tasksLoading,
  tasksError,
}) => {
  const activeTemplate = activeFlowTemplate(content.processTemplateId, templates);
  const availableFlows = flowsForContentType(templates, content.type);
  const started = flowHasStarted(stages);
  const finished = finishedStageCount(stages);
  const progress = Number.isFinite(Number(content.progress)) ? Math.min(100, Math.max(0, Number(content.progress))) : 0;
  const waitingStages = stages.filter(stage => stageWaitingReason(stages, stage) !== null);

  const taskOf = (stageId: string, kind: string) =>
    stageTasks.find(task => String(task.contentStageId || '') === String(stageId) && task.kind === kind);

  return (
    <section className="space-y-6" aria-label="جریان‌های محتوا">
      <header className="flex items-start gap-3 border-b border-slate-100 pb-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
          <Layers className="h-5 w-5" />
        </span>
        <div>
          <h3 className="text-sm font-black text-slate-900">جریان‌های محتوای این پرونده</h3>
          <p className="mt-1 text-[11px] leading-5 text-slate-500">
            جریان فعال، ترتیب مرحله‌ها، پیش‌نیاز هر مرحله و تسکی که سرور برای آن ساخته است — همه از دادهٔ واقعی همین پرونده.
          </p>
        </div>
      </header>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-indigo-100 bg-indigo-50 text-indigo-600">
              <ListChecks className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-slate-400">جریان فعال</p>
              <h4 className="truncate text-sm font-black text-slate-900">
                {activeTemplate?.name || 'جریان اختصاصی این پرونده'}
              </h4>
              <p className="mt-0.5 text-[10px] text-slate-500">
                {activeTemplate
                  ? `قالب جریان «${activeTemplate.name}» از تنظیمات سازمان روی این پرونده اعمال شده است`
                  : 'مرحله‌های این پرونده دست‌ساز هستند یا قالب مبدأ آن دیگر در تنظیمات سازمان نیست'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex h-7 items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-3 text-[10px] font-bold text-slate-600">
              {stages.length.toLocaleString('fa-IR')} مرحله
            </span>
            <span className="inline-flex h-7 items-center gap-1 rounded-xl border border-indigo-200 bg-indigo-50 px-3 text-[10px] font-bold text-indigo-700">
              {finished.toLocaleString('fa-IR')} از {stages.length.toLocaleString('fa-IR')} تمام‌شده
            </span>
            {waitingStages.length > 0 && (
              <span className="inline-flex h-7 items-center gap-1 rounded-xl border border-amber-200 bg-amber-50 px-3 text-[10px] font-bold text-amber-700">
                {waitingStages.length.toLocaleString('fa-IR')} مرحله در انتظار پیش‌نیاز
              </span>
            )}
          </div>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between gap-2 text-[10px] font-bold text-slate-500">
            <span>پیشرفت جریان</span>
            <span className="font-black text-indigo-700">{progress.toLocaleString('fa-IR')}٪</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
            <div className="h-full rounded-full bg-indigo-600 transition-[width]" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <p className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/70 p-3 text-[11px] font-bold leading-5 text-indigo-900">
          تسک هر مرحله فقط پس از اتمام پیش‌نیاز همان مرحله ساخته می‌شود؛ تا آن زمان نه تسکی در کارتابل مسئول می‌آید و نه اعلان تخصیصی فرستاده می‌شود.
        </p>
      </div>

      <div className="space-y-2.5">
        <h4 className="flex items-center gap-2 text-xs font-black text-slate-800">
          <ClipboardList className="h-4 w-4 text-indigo-600" />
          مرحله‌ها، پیش‌نیازها و تسک هر مرحله
        </h4>
        {stages.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-xs font-bold text-slate-500">
            برای این پرونده هنوز مرحله‌ای ثبت نشده است.
          </div>
        )}
        {stages.map((stage, index) => {
          const waiting = stageWaitingReason(stages, stage);
          // دو حالت انتظار: پیش‌نیاز ناتمام، یا مرحله‌ای که هنوز فعال نشده است.
          const waitingForActivation = waiting === 'این مرحله هنوز فعال نشده است';
          const workTask = taskOf(String(stage.id), 'content_work');
          const reviewTask = taskOf(String(stage.id), 'content_review');
          const department = departments.find(item => String(item.id) === String(stage.departmentId))?.name || stage.departmentName;
          const assignee = workTask?.assigneeId ? users.find(user => String(user.id) === String(workTask.assigneeId)) : undefined;
          const blockedTask = workTask?.isBlocked ? workTask : reviewTask?.isBlocked ? reviewTask : undefined;

          return (
            <article key={stage.id} className={`rounded-2xl border p-3.5 ${waiting ? 'border-amber-200 bg-amber-50/40' : 'border-slate-200 bg-white'} shadow-2xs`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-black text-white ${waiting ? 'bg-amber-500' : 'bg-indigo-600'}`}>
                    {(index + 1).toLocaleString('fa-IR')}
                  </span>
                  <div className="min-w-0">
                    <h5 className="truncate text-xs font-black text-slate-900">{stage.title}</h5>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10px] text-slate-500">
                      <span>{department || 'دپارتمان تعیین نشده'}</span>
                      <span>·</span>
                      <span>{stage.deadline ? `مهلت ${formatPersianDate(stage.deadline)}` : 'بدون مهلت'}</span>
                      {stage.reviewRequired === false && <><span>·</span><span>بدون ارزیابی مستقل</span></>}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`inline-flex h-7 items-center rounded-xl border px-2.5 text-[10px] font-bold ${stageTone(stage.status)}`}>
                    {stageStatusLabel(stage.status)}
                  </span>
                  {waiting && (
                    <span className="inline-flex h-7 items-center gap-1 rounded-xl border border-amber-200 bg-white px-2.5 text-[10px] font-bold text-amber-700">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {waiting}
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-slate-100 pt-2.5 text-[10px] font-bold">
                {tasksLoading && <span className="text-slate-400">در حال خواندن تسک‌های این پرونده…</span>}
                {!tasksLoading && tasksError && <span className="text-slate-400">فهرست تسک‌ها در دسترس نیست؛ وضعیت مرحله‌ها معتبر است.</span>}
                {!tasksLoading && !tasksError && workTask && (
                  <>
                    <span className="flex items-center gap-1 text-slate-500">
                      <ShieldCheck className="h-3.5 w-3.5 text-indigo-500" />
                      تسک اجرا:
                    </span>
                    <span className="text-slate-800">{assignee?.name || 'مسئول تعیین نشده'}</span>
                    <TaskStatusBadge status={(workTask.status || 'backlog') as never} size="sm" />
                    {workTask.isBlocked && (
                      <span className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-800">
                        مسدود — {workTask.blockedReason || 'در انتظار پیش‌نیاز'}
                      </span>
                    )}
                  </>
                )}
                {!tasksLoading && !tasksError && !workTask && (
                  <span className={waiting ? 'text-amber-800' : 'text-slate-500'}>
                    {waitingForActivation
                      ? 'تسک اجرا ساخته نشده است؛ با فعال‌شدن همین مرحله ساخته می‌شود.'
                      : waiting
                        ? 'تسک اجرا ساخته نشده است؛ با اتمام پیش‌نیاز همین مرحله ساخته می‌شود.'
                        : 'برای این مرحله تسکی ساخته نشده است.'}
                  </span>
                )}
                {!tasksLoading && !tasksError && reviewTask && (
                  <span className="flex items-center gap-1 text-slate-500">
                    · تسک ارزیابی:
                    <TaskStatusBadge status={(reviewTask.status || 'backlog') as never} size="sm" />
                  </span>
                )}
                {blockedTask && <span className="text-slate-400">نشان مسدودی تا اتمام پیش‌نیاز پاک نمی‌شود.</span>}
              </div>
            </article>
          );
        })}
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="flex items-center gap-2 text-xs font-black text-slate-800">
            <Layers className="h-4 w-4 text-indigo-600" />
            جریان‌های موجود برای نوع «{content.type}»
          </h4>
          <div className="flex flex-wrap items-center gap-2">
            {canManageWorkflow && (
              <button type="button" onClick={onOpenWorkflowEditor} className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 shadow-2xs transition-colors hover:bg-slate-50">
                <Settings className="h-3.5 w-3.5 text-indigo-600" />
                ویرایش جریان و مراحل
              </button>
            )}
            {canOpenSettings && (
              <button type="button" onClick={onOpenSettings} className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700 shadow-2xs transition-colors hover:bg-slate-50">
                <Plus className="h-3.5 w-3.5 text-indigo-600" />
                مدیریت جریان‌ها در تنظیمات سامانه
              </button>
            )}
          </div>
        </div>

        {availableFlows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
            <p className="text-xs font-black text-slate-700">برای این نوع محتوا جریانی در تنظیمات سازمان ثبت نشده است.</p>
            <p className="mt-1.5 text-[11px] leading-5 text-slate-500">
              جریان‌ها در «تنظیمات سامانه → محتوا و فرایند → قالب‌های فرایند» ساخته می‌شوند و پس از آن هنگام ساخت پرونده یا از همین بخش قابل اعمال‌اند.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {availableFlows.map(template => {
              const active = template.id === content.processTemplateId;
              const busy = applyingTemplateId === template.id;
              return (
                <article key={template.id} className={`flex flex-col rounded-2xl border p-4 shadow-2xs ${active ? 'border-indigo-300 bg-indigo-50/60' : 'border-slate-200 bg-white'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h5 className="text-xs font-black text-slate-900">{template.name}</h5>
                      <p className="mt-1 line-clamp-2 text-[10px] leading-5 text-slate-500">{template.description || 'بدون توضیح'}</p>
                    </div>
                    {active && (
                      <span className="shrink-0 rounded-xl border border-indigo-300 bg-white px-2.5 py-1 text-[10px] font-black text-indigo-700">
                        جریان فعال
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-bold text-slate-500">
                    <span>{template.stages.length.toLocaleString('fa-IR')} مرحله</span>
                    {!!template.estimatedDays && <span>حدود {template.estimatedDays.toLocaleString('fa-IR')} روز</span>}
                  </div>
                  <div className="mt-3 border-t border-slate-100 pt-3 text-[10px] font-bold">
                    {active ? (
                      <span className="text-slate-500">همین جریان روی این پرونده فعال است.</span>
                    ) : canEdit && !started ? (
                      <button
                        type="button"
                        onClick={() => onApplyTemplate(template)}
                        disabled={busy}
                        className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-[11px] font-bold text-white transition-colors hover:bg-indigo-700 disabled:cursor-wait disabled:opacity-60"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        {busy ? 'در حال اعمال جریان…' : 'اعمال این جریان روی پرونده'}
                      </button>
                    ) : (
                      <span className="text-slate-500">
                        {started
                          ? 'مراحل این پرونده آغاز شده است؛ تغییر ساختار از «ویرایش جریان و مراحل» انجام می‌شود.'
                          : 'برای اعمال جریان، مجوز ویرایش محتوا لازم است.'}
                      </span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
        {!started && stages.length > 0 && availableFlows.length > 0 && (
          <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-[10px] font-bold leading-5 text-slate-600">
            چون هیچ مرحله‌ای از این پرونده آغاز نشده است، اعمال جریان دیگری بی‌خطر است: مرحله‌های شروع‌نشده با مرحله‌های جریان تازه جانشین می‌شوند و پیشرفت فعلی از دست نمی‌رود.
          </p>
        )}
      </div>
    </section>
  );
};
