/**
 * نوعِ دیداریِ یک خروجیِ مرحله — مشترک بین پنجرهٔ «نمایش خروجی» و بقیهٔ نماها.
 *
 * قاعدهٔ دور ۸۲: تشخیص نوع **هیچ درخواست شبکه‌ای** نمی‌فرستد و بندانگشتی
 * نمی‌گیرد؛ فقط از همان فیلدهای سبکِ ردیف خروجی (نوع، نام فایل، نشانی، MIME و
 * نام جدول داده) خوانده می‌شود تا فهرست صدها خروجی هم رایگان باشد.
 */
export type OutputVisualKind =
  | 'image'
  | 'video'
  | 'audio'
  | 'pdf'
  | 'word'
  | 'excel'
  | 'powerpoint'
  | 'archive'
  | 'text'
  | 'table'
  | 'link'
  | 'file';

export interface OutputLike {
  type?: string;
  url?: string;
  fileName?: string;
  mimeType?: string;
  dataTableName?: string;
  dataTable?: unknown;
  value?: string;
}

const WORD = ['doc', 'docx', 'rtf', 'odt'];
const EXCEL = ['xls', 'xlsx', 'ods', 'csv'];
const POWERPOINT = ['ppt', 'pptx', 'odp'];
const ARCHIVE = ['zip', 'rar', '7z', 'tar', 'gz', 'tgz'];
const TEXT = ['txt', 'md', 'json', 'xml', 'log'];
const IMAGE = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'avif', 'heic'];
const VIDEO = ['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v', 'mpeg', 'mpg'];
const AUDIO = ['mp3', 'wav', 'm4a', 'ogg', 'oga', 'aac', 'flac', 'opus'];

/** پسوند فایل از نام فایل یا انتهای نشانی (بدون query string). */
export function outputExtension(output: OutputLike): string {
  const source = String(output.fileName || output.url || '').split(/[?#]/)[0];
  const match = /\.([a-z0-9]{1,8})$/i.exec(source);
  return match ? match[1].toLowerCase() : '';
}

export function outputVisualKind(output: OutputLike): OutputVisualKind {
  if (output.dataTableName || output.dataTable) return 'table';
  const ext = outputExtension(output);
  const mime = String(output.mimeType || '').toLowerCase();
  const type = String(output.type || '').toLowerCase();
  if (IMAGE.includes(ext) || mime.startsWith('image/') || type === 'image') return 'image';
  if (VIDEO.includes(ext) || mime.startsWith('video/') || type === 'video') return 'video';
  if (AUDIO.includes(ext) || mime.startsWith('audio/')) return 'audio';
  if (ext === 'pdf' || mime.includes('pdf')) return 'pdf';
  if (WORD.includes(ext) || mime.includes('word')) return 'word';
  if (EXCEL.includes(ext) || mime.includes('sheet') || mime.includes('excel')) return 'excel';
  if (POWERPOINT.includes(ext) || mime.includes('presentation')) return 'powerpoint';
  if (ARCHIVE.includes(ext) || mime.includes('zip') || mime.includes('compressed')) return 'archive';
  if (TEXT.includes(ext) || mime.startsWith('text/') || type === 'text') return 'text';
  if (type === 'link' || (!output.fileName && !output.url && /^https?:/i.test(String(output.value || '')))) return 'link';
  return 'file';
}

/** برچسب فارسی نوع خروجی؛ برای نشانِ کنار عنوان. */
export const OUTPUT_KIND_LABELS: Record<OutputVisualKind, string> = {
  image: 'تصویر',
  video: 'ویدیو',
  audio: 'صدا',
  pdf: 'PDF',
  word: 'Word',
  excel: 'Excel',
  powerpoint: 'PowerPoint',
  archive: 'فایل فشرده',
  text: 'متن',
  table: 'جدول داده',
  link: 'پیوند',
  file: 'فایل',
};

/** نشان قالب (مثل `PDF` یا `MP4`) که کاربر از یک نگاه ببیند. */
export function outputFormatBadge(output: OutputLike): string {
  const ext = outputExtension(output);
  if (ext && !WORD.includes(ext) && !EXCEL.includes(ext) && !POWERPOINT.includes(ext)) {
    return ext.toUpperCase();
  }
  return OUTPUT_KIND_LABELS[outputVisualKind(output)];
}
