/**
 * زمینهٔ «پوشهٔ پیش‌فرضِ بخش» برای ضمیمه‌ها.
 *
 * فایل تازه‌ای که در بخش ضمیمه‌های یک محتوا/ایده/جلسه/وظیفه آپلود می‌شود، از
 * ابتدا در پوشهٔ همان رکورد ذخیره می‌شود. دارایی موجودی که از مخزن انتخاب
 * می‌شود در پوشهٔ قبلی خود می‌ماند؛ این ماژول همان زمینه را به شکل بدنهٔ
 * درخواستِ `context-folder` تبدیل می‌کند تا سرور مقصد را با قاعدهٔ خودش تعیین
 * کند (نام‌گذاری و ساخت پوشه یک‌جا و سمت سرور می‌ماند).
 */
export interface AttachmentContextRelations {
  projectId?: string;
  taskId?: string;
  contentId?: string;
  contentBucket?: string;
  ideaId?: string;
  meetingId?: string;
}

type ContextPayload = Record<string, string | number>;

/**
 * بدنهٔ درخواست انتقال، یا `null` وقتی زمینه‌ای برای تعیین پوشه وجود ندارد.
 *
 * شناسه‌ها فقط وقتی عددی‌اند فرستاده می‌شوند؛ `content_bucket` نامِ دسته است و
 * به‌صورت رشته می‌ماند (سرور آن را با فهرست مجاز می‌سنجد).
 */
export const contextFolderPayload = (relations: AttachmentContextRelations): ContextPayload | null => {
  const payload: ContextPayload = {};
  const numeric: Array<[string, string | undefined]> = [
    ['content_id', relations.contentId],
    ['idea_id', relations.ideaId],
    ['meeting_id', relations.meetingId],
    ['task_id', relations.taskId],
    ['project_id', relations.projectId],
  ];
  for (const [key, value] of numeric) {
    if (!value || !/^\d+$/.test(value)) continue;
    payload[key] = Number(value);
  }
  if (relations.contentId && relations.contentBucket) payload.content_bucket = relations.contentBucket;

  return Object.keys(payload).some(key => key !== 'content_bucket') ? payload : null;
};
