/**
 * «آماده انتشار» یک معنا دارد، نه چند تعریف.
 *
 * سه جا این پرسش را می‌پرسد: دکمهٔ انتشار صفحهٔ جزئیات، میز انتشار و تقویم.
 * پیش‌تر هر فایل شرط خودش را نوشته بود؛ نتیجه این بود که پرونده‌ای با همهٔ
 * مرحله‌های تمام‌شده در تقویم برچسب «آماده انتشار» نداشت و فقط وضعیت قدیمی
 * پرونده (در حال تولید، تأییدشده…) دیده می‌شد. حالا هر سه از همین فایل
 * می‌خوانند تا تقویم و پنل یک حرف بزنند.
 *
 * این فایل هیچ وابستگی وارد نمی‌کند تا آزمون‌های نود بتوانند همین منطق واقعی
 * را اجرا کنند.
 */

/** مرحله‌هایی که کارشان تمام شده است؛ همان واژگانی که سرور در پیشرفت می‌شمرد. */
export const STAGE_DONE_STATUSES = ['approved', 'completed', 'skipped'] as const;

/** وضعیت‌هایی که پرونده دیگر «در انتظار انتشار» نیست. */
export const PUBLISHED_CONTENT_STATUSES = ['published', 'archived', 'cancelled', 'suspended'] as const;

type StageLike = { status?: string | null };

/** همهٔ مرحله‌ها تمام شده‌اند (و دست‌کم یک مرحله وجود دارد). */
export const workflowReady = (stages?: ReadonlyArray<StageLike> | null): boolean =>
  Boolean(stages?.length) && (stages as ReadonlyArray<StageLike>).every(stage => (STAGE_DONE_STATUSES as readonly string[]).includes(String(stage.status)));

/** پرونده منتشر شده یا از چرخهٔ انتشار بیرون رفته است. */
export const isPublishedLike = (status?: string | null): boolean =>
  (PUBLISHED_CONTENT_STATUSES as readonly string[]).includes(String(status || ''));

/**
 * برچسبِ درست برای «آماده انتشار»:
 *  ۱) وضعیت ثبت‌شده خودش `ready_to_publish` است، یا
 *  ۲) همهٔ مرحله‌های جریان تمام شده‌اند و پرونده هنوز منتشر/بایگانی/لغو نشده است.
 *
 * در حالت دوم، وضعیت خام پرونده پاک نمی‌شود؛ فقط برچسب نمایشی تقویم/میز
 * «آماده انتشار» می‌شود تا کاربر بفهمد کار تولید تمام شده و نوبت انتشار است.
 */
export const isReadyToPublish = (content: { status?: string | null; stages?: ReadonlyArray<StageLike> | null }): boolean =>
  String(content.status || '') === 'ready_to_publish'
  || (!isPublishedLike(content.status) && workflowReady(content.stages));

/** کلید وضعیت نمایشی؛ همان چیزی که `contentStatusLabel`/`contentStatusColor` می‌خوانند. */
export const publicationDisplayStatus = (content: { status?: string | null; stages?: ReadonlyArray<StageLike> | null }): string =>
  isReadyToPublish(content) ? 'ready_to_publish' : String(content.status || '');
