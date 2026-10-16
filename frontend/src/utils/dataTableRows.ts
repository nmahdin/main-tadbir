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
