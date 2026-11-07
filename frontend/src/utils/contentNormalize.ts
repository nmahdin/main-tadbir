import type { Content, ContentPublishInfo, ContentStage, ContentStageActivity, ContentStageInput, ContentStageOutput } from '../types';

/**
 * ورودی‌های محتوا از چند مسیر می‌آیند: payload ذخیره‌شده در دیتابیس (که ممکن است
 * از نسخه‌های قدیمی سامانه باشد)، پاسخ API و حالت نمایشی. بعضی پرونده‌های قدیمی
 * ساختار ناقص دارند — مثلاً `stages` اصلاً نیست یا به‌جای آرایه شیء است، یا مقدارِ
 * یک خروجی عدد/بولین است نه متن. چنین داده‌ای پیش‌تر در رندر، استثنا می‌داد و مرز
 * خطا پیام «خطای غیرمنتظره در این بخش» را نشان می‌داد؛ در حالی که بقیهٔ سامانه سالم
 * بود. این ماژول همان داده را به شکل قابل نمایش درمی‌آورد و مقدار ذخیره‌شده را
 * تغییر نمی‌دهد.
 */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** آرایهٔ اشیای معتبر؛ هر عضو ناقص (null، رشته، عدد) کنار گذاشته می‌شود. */
const recordList = <T,>(value: unknown): T[] =>
  Array.isArray(value) ? (value.filter(item => isRecord(item)) as T[]) : [];

/** آرایهٔ رشته‌ها؛ عدد و بولین هم به متن تبدیل می‌شوند تا نمایش آن‌ها نشکند. */
const textList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
      .filter(item => item !== null && item !== undefined && typeof item !== 'object')
      .map(item => String(item))
      .filter(item => item.trim() !== '')
    : [];

/** مقدار مختلط (عدد/بولین/متن) را برای نمایش به متن امن تبدیل می‌کند. */
export const contentTextValue = (value: unknown): string | undefined => {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') return value === '' ? undefined : value;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : undefined;
  if (typeof value === 'boolean') return value ? 'بله' : 'خیر';
  if (Array.isArray(value)) return textList(value).join('، ') || undefined;
  if (isRecord(value)) {
    const nested = value.value ?? value.text ?? value.label ?? value.title ?? value.name;
    return nested === undefined ? undefined : contentTextValue(nested);
  }
  return undefined;
};

const normalizeStageOutput = (output: Record<string, unknown>): ContentStageOutput => ({
  ...(output as unknown as ContentStageOutput),
  value: contentTextValue(output.value),
  rowIds: Array.isArray(output.rowIds)
    ? output.rowIds.map(id => String(id)).filter(id => /^\d+$/.test(id) && Number(id) > 0)
    : undefined,
  rowLabels: Array.isArray(output.rowLabels) ? textList(output.rowLabels) : undefined,
});

const normalizeStageInput = (input: Record<string, unknown>): ContentStageInput => ({
  ...(input as unknown as ContentStageInput),
  description: contentTextValue(input.description),
});

const normalizeStage = (stage: Record<string, unknown>): ContentStage => ({
  ...(stage as unknown as ContentStage),
  dependsOnStageIds: textList(stage.dependsOnStageIds),
  inputs: recordList<Record<string, unknown>>(stage.inputs).map(normalizeStageInput),
  outputs: recordList<Record<string, unknown>>(stage.outputs).map(normalizeStageOutput),
  checklist: recordList(stage.checklist),
  activityLog: recordList<ContentStageActivity>(stage.activityLog),
});

const normalizePublishInfo = (value: unknown): ContentPublishInfo | undefined => {
  if (!isRecord(value)) return undefined;
  return {
    ...(value as unknown as ContentPublishInfo),
    channels: textList(value.channels),
    metrics: isRecord(value.metrics) ? (value.metrics as ContentPublishInfo['metrics']) : undefined,
  };
};

/**
 * یک پروندهٔ محتوا را برای مصرف رابط آماده می‌کند:
 * آرایه‌های ساختاری همیشه آرایه‌اند، مراحل ناقص کنار گذاشته می‌شوند و مقدارهای
 * عددی/بولینی خروجی‌ها به متن تبدیل می‌شوند. شیء اصلی تغییر نمی‌کند (idempotent).
 */
export const normalizeContent = (value: Content): Content => {
  if (!isRecord(value)) return value;
  const source = value as unknown as Record<string, unknown>;
  const publishInfo = normalizePublishInfo(source.publishInfo);
  return {
    ...value,
    tags: textList(source.tags),
    assetIds: textList(source.assetIds),
    taskIds: textList(source.taskIds),
    targetAudiences: textList(source.targetAudiences),
    departmentIds: textList(source.departmentIds),
    creatorIds: textList(source.creatorIds),
    editorIds: textList(source.editorIds),
    reviewerIds: textList(source.reviewerIds),
    approverIds: textList(source.approverIds),
    reviewableStageIds: textList(source.reviewableStageIds),
    stages: recordList<Record<string, unknown>>(source.stages).map(normalizeStage),
    attachments: recordList(source.attachments),
    comments: recordList(source.comments),
    history: recordList(source.history),
    ...(publishInfo ? { publishInfo } : {}),
  };
};

/** همان نرمال‌سازی برای فهرست‌ها؛ اعضای ناخوانا حذف می‌شوند. */
export const normalizeContents = (value: Content[]): Content[] =>
  (Array.isArray(value) ? value : []).filter(isRecord).map(normalizeContent);
