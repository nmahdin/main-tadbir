import type { ContentProcessTemplate, ContentStage, ContentStageStatus, User } from '../types';

/**
 * قرارداد «جریان محتوا» در مرورگر.
 *
 * این فایل تنها جای تصمیم‌گیری دربارهٔ «قالب جریان ← مرحله‌های واقعی محتوا» و
 * «پیش‌نیاز برآورده‌نشده» است تا صفحهٔ ساخت محتوا، صفحهٔ جزئیات محتوا و مدال
 * ویرایش جریان یک رفتار و یک متن داشته باشند. قانون نهایی همیشه روی سرور اجرا
 * می‌شود (`ContentStageTaskSync`)؛ نسخهٔ مرورگر فقط همان قانون را نمایش می‌دهد و
 * هیچ وضعیتی را جعل نمی‌کند.
 */

/**
 * مقایسهٔ امن شناسه‌ها.
 *
 * شناسه‌ها از دو منبع متفاوت می‌آیند: فرانت‌اند همه‌چیز را رشته نگه می‌دارد، اما
 * سرور برخی شناسه‌ها را عدد در payload می‌نویسد (`owner_id`, `manager_id`).
 * مقایسهٔ سخت‌گیرانه باعث می‌شد دکمه‌های مسئول مرحله برای خودِ مسئول خاموش شود و
 * کاربر فکر کند «ثبت خروجی» کار نمی‌کند.
 */
export const sameId = (left?: string | number | null, right?: string | number | null): boolean =>
  left !== null && left !== undefined && right !== null && right !== undefined
  && String(left) !== '' && String(right) !== '' && String(left) === String(right);

/** مرحله‌هایی که تمام‌شده به‌حساب می‌آیند؛ آینهٔ `ContentStageTaskSync::FINISHED_STAGE_STATUSES`. */
export const FINISHED_STAGE_STATUSES: ContentStageStatus[] = ['approved', 'completed', 'skipped'];

/** وضعیت‌هایی که «هنوز شروع نشده» به‌حساب می‌آیند و تغییر جریان را بی‌خطر می‌کنند. */
export const UNSETTLED_STAGE_STATUSES: ContentStageStatus[] = ['not_started', 'pending_dependency'];

/** وضعیت‌های مرحله با برچسب فارسی؛ منبع مشترک همهٔ نمایش‌های جریان. */
export const STAGE_STATUS_LABELS: Record<ContentStageStatus, string> = {
  not_started: 'شروع‌نشده',
  pending_dependency: 'در انتظار پیش‌نیاز',
  ready: 'آماده',
  in_progress: 'در حال انجام',
  ready_for_review: 'آماده ارزیابی',
  pending_approval: 'در انتظار تأیید',
  needs_revision: 'نیازمند اصلاح',
  revisions_needed: 'نیازمند اصلاح',
  approved: 'تأییدشده',
  completed: 'تکمیل‌شده',
  skipped: 'بدون نیاز / عبور',
};

export const stageStatusLabel = (status: ContentStageStatus | string): string =>
  STAGE_STATUS_LABELS[status as ContentStageStatus] || String(status);

export const stageIsFinished = (stage?: ContentStage | null): boolean =>
  Boolean(stage && FINISHED_STAGE_STATUSES.includes(stage.status));

/** آیا هیچ مرحله‌ای از این جریان شروع، بررسی یا تأیید شده است؟ */
export const flowHasStarted = (stages?: ContentStage[] | null): boolean =>
  (stages || []).some(stage => !UNSETTLED_STAGE_STATUSES.includes(stage.status));

/** مرحله‌های تمام‌شدهٔ یک جریان (ورودی هر نمایش پیشرفت). */
export const finishedStageCount = (stages?: ContentStage[] | null): number =>
  (stages || []).filter(stage => stageIsFinished(stage)).length;

/**
 * پیش‌نیازهای واقعی یک مرحله از سه منبع خودِ داده:
 * وابستگی اعلام‌شده (`dependsOnStageIds`)، ورودی ارجاع‌شده از مرحلهٔ دیگر
 * (`sourceStageId`) و زنجیرهٔ ترتیبی (`dependsOnPrevious` / `pending_dependency`).
 */
export const stagePrerequisiteStages = (stages: ContentStage[], stage: ContentStage): ContentStage[] => {
  const index = stages.findIndex(candidate => String(candidate.id) === String(stage.id));
  if (index < 0) return [];
  const byId = new Map(stages.map(candidate => [String(candidate.id), candidate]));
  const required = new Map<string, ContentStage>();
  (stage.dependsOnStageIds || []).forEach(id => {
    const found = byId.get(String(id));
    if (found) required.set(String(found.id), found);
  });
  (stage.inputs || []).forEach(input => {
    const found = input.sourceStageId ? byId.get(String(input.sourceStageId)) : undefined;
    if (found) required.set(String(found.id), found);
  });
  // `dependsOnPrevious` صریح ممکن است در مرحله‌های ذخیره‌شده نباشد؛ در نبود آن
  // وضعیت `pending_dependency` همان معنا را می‌رساند.
  const dependsOnPrevious = (stage as ContentStage & { dependsOnPrevious?: boolean }).dependsOnPrevious === true;
  if (index > 0 && (dependsOnPrevious || stage.status === 'pending_dependency')) {
    required.set(String(stages[index - 1].id), stages[index - 1]);
  }
  required.delete(String(stage.id));

  return [...required.values()];
};

/**
 * متن «در انتظار …» یک مرحله؛ اگر پیش‌نیازش تمام شده باشد `null` برمی‌گرداند.
 * دقیقاً همان شرطی که سرور با آن ساخت تسک مرحله را به تعویق می‌اندازد.
 */
export const stageWaitingReason = (stages: ContentStage[], stage: ContentStage): string | null => {
  const waiting = stagePrerequisiteStages(stages, stage).filter(prerequisite => !stageIsFinished(prerequisite));
  if (waiting.length > 0) {
    return `در انتظار اتمام مرحله ${waiting.slice(0, 3).map(item => `«${item.title}»`).join(' و ')}`;
  }

  return stage.status === 'pending_dependency' ? 'این مرحله هنوز فعال نشده است' : null;
};

/** قالب جریان فعال این پرونده؛ `null` یعنی جریان اختصاصی همین پرونده. */
export const activeFlowTemplate = (
  processTemplateId: string | null | undefined,
  templates: ContentProcessTemplate[],
): ContentProcessTemplate | null => templates.find(template => template.id === processTemplateId) || null;

/** جریان‌های قابل استفاده برای یک نوع محتوا. */
export const flowsForContentType = (templates: ContentProcessTemplate[], contentType: string): ContentProcessTemplate[] =>
  templates.filter(template => template.type === contentType);

export type TemplateStageAssignment = {
  /** شناسهٔ اعضای دپارتمان مرحله؛ سرور فقط مسئول معتبر را می‌پذیرد. */
  candidateIds: string[];
  assigneeId?: string;
  reviewerId?: string;
};

export interface TemplateFlowContext {
  /** بذر یکتای شناسه‌های مرحله/ورودی/خروجی در این اجرا. */
  seed: number | string;
  departmentName: (departmentId: string) => string | undefined;
  /** قاعدهٔ انتخاب مسئول/ارزیاب هر مرحله؛ در همان صفحه‌ای می‌ماند که کاربر انتخاب می‌کند. */
  assignment: (stage: ContentProcessTemplate['stages'][number], index: number) => TemplateStageAssignment;
  ownerId?: string;
  contentDeadline?: string;
  addDays: (date: string | undefined, days: number) => string;
}

/**
 * مرحله‌های واقعی محتوا را از یک قالب جریان می‌سازد.
 *
 * همان قراردادی که هنگام ساخت محتوا اجرا می‌شد، حالا یک پیاده‌سازی مشترک دارد:
 * مهلت هر مرحله از سیاست خودش (`from_content`، `from_previous`، `relative_days`)
 * ساخته می‌شود، مرحله‌های وابسته با وضعیت `pending_dependency` شروع می‌کنند و
 * شناسه‌ها با بذر همان اجرا یکتا می‌مانند تا ویرایش دوباره رکورد تکراری نسازد.
 */
export function buildStagesFromTemplate(
  template: ContentProcessTemplate,
  context: TemplateFlowContext,
): ContentStage[] {
  let previousDeadline: string | undefined;

  return template.stages.map((stage, index) => {
    const assignment = context.assignment(stage, index);
    const dependsOnPrevious = index > 0 && stage.dependsOnPrevious !== false;
    const startDate = context.addDays(undefined, stage.daysFromStart || 0);
    const relativeDueDays = stage.relativeDueDays ?? 2;
    const deadlinePolicy = stage.deadlinePolicy || 'relative_days';
    const deadline = deadlinePolicy === 'from_content'
      ? context.contentDeadline || undefined
      : deadlinePolicy === 'none' || String(deadlinePolicy) === 'absolute_date'
        ? undefined
        : deadlinePolicy === 'from_previous' && previousDeadline
          ? context.addDays(previousDeadline, relativeDueDays)
          : context.addDays(startDate, relativeDueDays);
    previousDeadline = deadline || previousDeadline;

    return {
      id: `stg-${context.seed}-${index}`,
      stageKey: stage.stageKey,
      title: stage.title,
      description: stage.description,
      departmentId: stage.departmentId,
      departmentName: context.departmentName(stage.departmentId) || stage.departmentName,
      assigneeRole: stage.defaultRole,
      assigneeId: assignment.candidateIds.includes(assignment.assigneeId || '') ? assignment.assigneeId : undefined,
      reviewerId: assignment.reviewerId
        || (stage.reviewerStrategy === 'content_owner' ? context.ownerId || undefined : undefined),
      reviewRequired: stage.reviewRequired !== false,
      reviewerStrategy: stage.reviewerStrategy || 'stage_reviewer',
      advanceMode: stage.advanceMode || 'approval',
      order: index + 1,
      status: dependsOnPrevious ? 'pending_dependency' : 'not_started',
      startDate,
      deadline,
      dependsOnStageIds: dependsOnPrevious ? [`stg-${context.seed}-${index - 1}`] : [],
      inputs: stage.inputs.map((input, inputIndex) => ({
        id: `inp-${context.seed}-${index}-${inputIndex}`,
        title: input.title,
        description: input.description,
        type: input.type,
        isReady: !dependsOnPrevious,
      })),
      outputs: stage.outputs.map((output, outputIndex) => ({
        id: `out-${context.seed}-${index}-${outputIndex}`,
        name: output.name,
        type: output.type,
        isRequired: output.isRequired,
        isDelivered: false,
      })),
      checklist: (stage.checklist || []).map((item, checklistIndex) => ({
        id: `chk-${context.seed}-${index}-${checklistIndex}`,
        text: item.text,
        isCompleted: false,
      })),
      activityLog: [],
    };
  });
}

/** افزودن روز تقویمی به یک تاریخ `YYYY-MM-DD`؛ مشترک همهٔ محاسبات مهلت جریان. */
export const addCalendarDays = (date: string | undefined, days: number): string => {
  const base = date ? new Date(`${date}T00:00:00Z`) : new Date();
  base.setUTCHours(0, 0, 0, 0);
  base.setUTCDate(base.getUTCDate() + Math.max(0, days));

  return base.toISOString().split('T')[0];
};

/**
 * اعضای فعال یک دپارتمان؛ همان قاعده‌ای که هنگام ساخت محتوا مسئول مرحله را از
 * میان آن‌ها انتخاب می‌کند (اعضای رسمی دپارتمان + مدیر + کاربران همان دپارتمان).
 */
export const departmentMembers = (
  departmentId: string,
  departments: Array<{ id: string; managerId?: string | null; members?: Array<{ userId: string }> }>,
  users: User[],
): User[] => {
  const department = departments.find(item => String(item.id) === String(departmentId));
  const memberIds = new Set([
    ...(department?.members || []).map(member => String(member.userId)),
    ...(department?.managerId ? [String(department.managerId)] : []),
  ]);

  return users.filter(user => user.status === 'active'
    && (String(user.departmentId || '') === String(departmentId) || memberIds.has(String(user.id))));
};
