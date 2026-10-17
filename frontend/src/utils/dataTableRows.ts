/**
 * کمک‌تابع‌های خالص برای «ردیف‌های جدول اطلاعات».
 *
 * این ماژول بدون وابستگی نوشته شده تا هم در بخش ضمیمه (AttachmentComposer) و هم
 * در صفحهٔ محتوا/تسک قابل استفاده باشد و در تست‌های نود هم مستقیم import شود.
 */

export type DataTableRowColumnLike = { id: string; name?: string };

export type DataTableRowLike = {
  id: number;
  cells?: Record<string, unknown> | null;
  task_id?: number | null;
  content_id?: number | null;
  task?: { id: number; title?: string | null } | null;
  content?: { id: number; title?: string | null } | null;
};

/** متنی که کاربر از یک ردیف می‌بیند؛ خالی‌بودن همهٔ ستون‌ها هم صریح گفته می‌شود. */
export const dataTableRowLabel = (
  row: DataTableRowLike,
  columns: DataTableRowColumnLike[] = [],
  options: { maxLength?: number; empty?: string } = {},
): string => {
  const maxLength = options.maxLength ?? 120;
  const cells = row.cells || {};
  const values = columns
    .map(column => ({ name: column.name, value: String(cells[column.id] ?? '').trim() }))
    .filter(entry => entry.value !== '')
    .map(entry => (entry.name ? `${entry.name}: ${entry.value}` : entry.value));
  const text = values.length ? values.slice(0, 4).join(' · ') : (options.empty || 'ردیف بدون مقدار');
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
};

/** خلاصهٔ مقادیر یک ردیف بدون نام ستون‌ها (همان قالبی که فهرست‌های تسک/محتوا نشان می‌دهند). */
export const dataTableRowValueSummary = (
  cells?: Record<string, unknown> | null,
  options: { max?: number; separator?: string; empty?: string } = {},
): string => {
  const values = Object.values(cells || {})
    .filter(value => String(value ?? '').trim() !== '')
    .slice(0, options.max ?? 3)
    .map(value => String(value));
  return values.length ? values.join(options.separator ?? ' • ') : (options.empty || 'ردیف بدون مقدار');
};

/**
 * فیلدهای پرشدهٔ یک ردیف همراه با نام ستون؛ همان چیزی که در پیش‌نمایش «این خروجی
 * ردیفی از جدول اطلاعات است» نشان داده می‌شود. ستون‌های خالی حذف می‌شوند و ستون‌های
 * دارای مقدار که در تعریف فعلی جدول نیستند (دادهٔ تاریخی) هم از قلم نمی‌افتند.
 */
export const dataTableRowFields = (
  cells?: Record<string, unknown> | null,
  columns: DataTableRowColumnLike[] = [],
  options: { max?: number } = {},
): Array<{ id: string; name: string; value: string }> => {
  const source = cells || {};
  const known = new Set(columns.map(column => column.id));
  const defined = columns
    .map(column => ({ id: column.id, name: column.name || column.id, value: String(source[column.id] ?? '').trim() }))
    .filter(field => field.value !== '');
  const historical = Object.keys(source)
    .filter(key => !known.has(key) && String(source[key] ?? '').trim() !== '')
    .map(key => ({ id: key, name: key, value: String(source[key]).trim() }));
  const fields = [...defined, ...historical];
  return options.max ? fields.slice(0, options.max) : fields;
};

/**
 * شناسهٔ جدولی که در متن یک خروجی قدیمی نوشته شده است.
 *
 * پیش از ثبت ساختاریافتهٔ «خروجی = ردیف جدول»، شناسهٔ جدول فقط در متن خروجی
 * (`جدول اطلاعات شماره ۱۲`) ذخیره می‌شد. این تابع فقط همان جملهٔ ساخت‌یافتهٔ خودِ
 * سامانه را در انتهای متن می‌شناسد تا خروجی‌های قدیمی هم بتوانند جدولشان را باز
 * کنند؛ هیچ حدس دیگری زده نمی‌شود و در نبود تطابق `null` برمی‌گردد.
 */
/** ارقام فارسی/عربی را به ارقام لاتین برمی‌گرداند (بدون وابستگی بیرونی). */
const toLatinDigits = (value: string): string => value.replace(/[\u06F0-\u06F9\u0660-\u0669]/g, character => {
  const code = character.charCodeAt(0);
  return String(code - (code >= 0x06F0 ? 0x06F0 : 0x0660));
});

export const dataTableIdFromOutputValue = (value?: string | null): number | null => {
  const match = toLatinDigits(String(value ?? '')).match(/جدول اطلاعات شماره[\s\u200c]+(\d+)\s*$/);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isFinite(id) && id > 0 ? id : null;
};

/** زمینه‌ای که یک ردیف به آن وصل است (تسک یا محتوا) — برای نشان‌دادن «قبلاً متصل است». */
export const dataTableRowLinkTarget = (
  row: DataTableRowLike,
  target: { taskId?: string | number | null; contentId?: string | number | null },
): 'task' | 'content' | null => {
  const wanted = [
    ['task', target.taskId],
    ['content', target.contentId],
  ] as const;
  for (const [kind, value] of wanted) {
    const id = value === undefined || value === null || value === '' ? NaN : Number(value);
    if (!Number.isFinite(id)) continue;
    const rowId = kind === 'task' ? row.task_id : row.content_id;
    if (Number(rowId) === id) return kind;
  }
  return null;
};

export const dataTableRowIsLinked = (
  row: DataTableRowLike,
  target: { taskId?: string | number | null; contentId?: string | number | null },
): boolean => dataTableRowLinkTarget(row, target) !== null;

/** توضیح پیوند فعلی ردیف (نام تسک یا محتوای متصل) برای ردیف‌های جدول. */
export const dataTableRowLinkLabel = (row: DataTableRowLike): string => {
  if (row.content?.title) return `محتوا: ${row.content.title}`;
  if (row.task?.title) return `تسک: ${row.task.title}`;
  if (row.content_id) return 'متصل به یک محتوا';
  if (row.task_id) return 'متصل به یک تسک';
  return 'بدون پیوند';
};
