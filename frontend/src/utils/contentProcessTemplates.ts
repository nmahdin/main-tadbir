import type { ContentProcessTemplate } from '../types';

/**
 * متنِ امن برای داده‌های قدیمی.
 *
 * الگوهای فرایند در تنظیمات سازمان به‌صورت JSON ذخیره می‌شوند و پیش از این
 * نسخه‌ها، فیلدهایی مثل `description` یا متنِ چک‌لیست می‌توانستند `null` باشند
 * (یا کلیدشان وجود نداشته باشد). فرانت‌اند آن‌ها را داخل ورودی‌های متنی می‌ریخت
 * و اولین `trim()` با خطای «can't access property "trim", … is null» کل صفحه را
 * می‌شکست. همهٔ خواندن/نوشتنِ الگو از این تابع رد می‌شود.
 */
export const safeText = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
};

/** متنِ چک‌لیست با پشتیبانی از کلیدهای قدیمی (`label`/`title`) و موارد رشته‌ای. */
const checklistText = (item: unknown): string => {
  if (typeof item === 'string') return item;
  if (!item || typeof item !== 'object') return '';
  const record = item as Record<string, unknown>;
  return safeText(record.text ?? record.label ?? record.title);
};

/**
 * یک الگوی فرایند را به شکل قابل‌اتکا برای رابط کاربری درمی‌آورد.
 *
 * مقدارهای پوچ به رشتهٔ خالی تبدیل می‌شوند تا ورودی‌های کنترل‌شده هیچ‌وقت
 * `null` نگیرند و مرحله‌های خالی (بدون شیء) حذف شوند.
 */
export const normalizeProcessTemplate = (template: Partial<ContentProcessTemplate> | null | undefined): ContentProcessTemplate => {
  const source = (template || {}) as Record<string, unknown>;
  const stages = Array.isArray(source.stages) ? source.stages : [];
  return {
    ...(template as ContentProcessTemplate),
    id: safeText(source.id),
    name: safeText(source.name),
    type: safeText(source.type),
    description: safeText(source.description),
    iconName: safeText(source.iconName) || undefined,
    estimatedDays: source.estimatedDays !== null && source.estimatedDays !== undefined && source.estimatedDays !== ''
      && Number.isFinite(Number(source.estimatedDays)) && Number(source.estimatedDays) >= 0
      ? Number(source.estimatedDays)
      : undefined,
    stages: stages
      .filter((stage): stage is Record<string, unknown> => Boolean(stage) && typeof stage === 'object')
      .map((stage, index) => {
        const checklist = Array.isArray(stage.checklist) ? stage.checklist : [];
        return {
          ...(stage as ContentProcessTemplate['stages'][number]),
          stageKey: safeText(stage.stageKey) || `stg-${index + 1}`,
          title: safeText(stage.title),
          description: safeText(stage.description),
          departmentId: safeText(stage.departmentId),
          departmentName: safeText(stage.departmentName),
          defaultRole: safeText(stage.defaultRole),
          order: index + 1,
          daysFromStart: Number.isFinite(Number(stage.daysFromStart)) ? Number(stage.daysFromStart) : index,
          inputs: Array.isArray(stage.inputs) ? (stage.inputs as ContentProcessTemplate['stages'][number]['inputs']) : [],
          outputs: Array.isArray(stage.outputs) ? (stage.outputs as ContentProcessTemplate['stages'][number]['outputs']) : [],
          checklist: checklist
            .map((item, itemIndex) => ({
              id: safeText((item as Record<string, unknown>)?.id) || `${safeText(stage.stageKey) || `stg-${index + 1}`}-check-${itemIndex + 1}`,
              text: checklistText(item),
            }))
            .filter(item => item.text !== ''),
          deadlinePolicy: stage.deadlinePolicy as ContentProcessTemplate['stages'][number]['deadlinePolicy'],
          relativeDueDays: Number.isFinite(Number(stage.relativeDueDays)) ? Number(stage.relativeDueDays) : undefined,
          reviewerStrategy: stage.reviewerStrategy as ContentProcessTemplate['stages'][number]['reviewerStrategy'],
          advanceMode: stage.advanceMode as ContentProcessTemplate['stages'][number]['advanceMode'],
          reviewRequired: stage.reviewRequired !== false,
          dependsOnPrevious: index === 0 ? false : stage.dependsOnPrevious !== false,
        };
      }),
  };
};

/** فهرستِ کامل الگوها؛ همیشه آرایهٔ الگوهای نرمال‌شده برمی‌گرداند. */
export const normalizeProcessTemplates = (templates: unknown): ContentProcessTemplate[] => (
  Array.isArray(templates)
    ? templates
      .filter((template): template is Partial<ContentProcessTemplate> => Boolean(template) && typeof template === 'object')
      .map(normalizeProcessTemplate)
    : []
);
