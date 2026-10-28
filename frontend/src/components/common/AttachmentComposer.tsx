import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Eye, File, FileText, Folder, FolderOpen, HardDrive, Library, LoaderCircle, Paperclip, Pencil, Plus, Search, TableProperties, Trash2, Upload, X } from 'lucide-react';
import { request, uploadRequest, type ApiResponse } from '../../api/client';
import { apiConfig } from '../../api/client';
import { useApp } from '../../context/AppContext';
import { Button, Input, Select } from './Primitives';
import { hasRichTextContent, RichTextContent, RichTextEditor, richTextToPlainText, sanitizeRichTextHtml } from './RichTextEditor';
import { FolderBrowserModal, type RepositoryFolder } from '../dam/FolderBrowserModal';
import { dataTableRowIsLinked, dataTableRowLabel, dataTableRowLinkLabel } from '../../utils/dataTableRows';
import { contextFolderPayload } from '../../utils/attachmentContext';

export type AttachmentTextDraft = { id: string; title: string; body: string };
export type AttachmentLibraryAsset = {
  id: number;
  title: string;
  type?: 'file' | 'content';
  can_edit?: boolean;
  latest_file?: { original_filename?: string; file_size?: number; mime_type?: string } | null;
  latest_version?: { id: number; version_number: number } | null;
  versions?: { id: number; version_number: number }[];
};
export type AttachmentTableColumn = { id: string; name: string; type?: 'text' | 'long_text' | 'number' | 'date' | 'select' | 'boolean' | 'link' | 'user' | 'asset'; required?: boolean; options?: string[] };
export type AttachmentTableDraft = {
  id: string;
  mode: 'create' | 'append' | 'link';
  tableId?: number;
  tableName: string;
  columns: AttachmentTableColumn[];
  /** First row retained for backward compatibility with queued drafts. */
  cells: Record<string, string>;
  rows?: Array<Record<string, string>>;
  /** حالت «link»: شناسهٔ ردیف‌های موجود جدول که به این محتوا/تسک متصل می‌شوند. */
  rowIds?: number[];
  /** برچسب خوانای همان ردیف‌ها برای فهرست آماده و پیگیری کاربر. */
  rowLabels?: string[];
};
export type AttachmentDraft = {
  files: File[];
  /** DAM title entered by the user; the browser File and stored filename stay unchanged. */
  fileDisplayNames?: Record<string, string>;
  texts: AttachmentTextDraft[];
  assets: AttachmentLibraryAsset[];
  tables: AttachmentTableDraft[];
  folderId: string;
  /** پوشهٔ اختصاصی هر فایل (بارگذاری پوشه‌ای)؛ در نبودش همین folderId استفاده می‌شود. */
  fileFolderIds?: Record<string, string>;
  /**
   * دارایی‌هایی که از مخزن انتخاب می‌شوند، هنگام اتصال به پوشهٔ پیش‌فرضِ همین
   * بخش (محتوا/ایده/جلسه/وظیفه/پروژه) منتقل شوند.
   *
   * فایل تازه‌ای که در همین بخش آپلود می‌شود از ابتدا در آن پوشه ذخیره می‌شود؛
   * این گزینه همان رفتار را برای فایل موجودی که از مخزن انتخاب شده است فراهم
   * می‌کند تا ضمیمه‌ها در درخت پوشه‌ها پراکنده نمانند.
   */
  moveToContextFolder?: boolean;
  /**
   * فرادادهٔ مخزن که هنگام ساخت دارایی اعمال می‌شود: دسته‌بندی، سطح دسترسی،
   * وضعیت، برچسب‌ها و دسترسی‌های ویژه. در فرم‌های متنی سامانه خالی می‌ماند.
   */
  /**
   * سیاست فایل تکراری در مخزن مرکزی؛ پیش‌فرض «استفاده از فایل موجود» است تا
   * نسخهٔ فیزیکی دوباره ساخته نشود. سرور همچنان مرجع نهایی تصمیم است.
   */
  duplicateAction?: 'reuse' | 'new_version' | 'create';
  defaults?: {
    categoryId?: string;
    confidentiality?: 'public' | 'internal' | 'confidential';
    status?: string;
    tags?: string[];
    grants?: { projects?: string[]; users?: string[]; roles?: string[] };
  };
};
export type PersistedAttachment = {
  assetId: number;
  name: string;
  size: number | null;
  type: 'file' | 'content' | 'data_table';
  previewUrl: string;
  dataTableId?: number;
  /** ردیف‌هایی که این پیوست به آن‌ها اشاره می‌کند (ساخته‌شده یا متصل‌شده). */
  rowIds?: number[];
  /** برچسب خوانای همان ردیف‌ها؛ اگر بعداً دسترسی به جدول نباشد، همین می‌ماند. */
  rowLabels?: string[];
  assetVersionId?: number;
  assetVersionNumber?: number;
};
export type AttachmentRelations = {
  projectId?: string;
  taskId?: string;
  departmentId?: string;
  contentId?: string;
  contentBucket?: 'attachments' | 'inputs' | 'initial_input' | 'working' | 'outputs' | 'final' | 'publication';
  relationRole?: 'initial_input' | 'reference' | 'attachment' | 'stage_input' | 'stage_output' | 'final_output' | 'publication_asset';
  stageId?: string;
  outputId?: string;
  /** Idea/meeting context drives managed DAM folders and first-class DAM relations. */
  ideaId?: string;
  ideaTitle?: string;
  ideaKey?: string;
  meetingId?: string;
};
export type PersistedAttachmentSource = { kind: 'file' | 'text' | 'asset' | 'table'; key: string };
export type AttachmentPersistOptions = { onPersisted?: (item: PersistedAttachment, source: PersistedAttachmentSource) => void; signal?: AbortSignal };


type Folder = RepositoryFolder;
type AssetResponse = AttachmentLibraryAsset & { id: number };
type DataTableRowResponse = {
  id: number;
  cells?: Record<string, string>;
  task_id?: number | null;
  content_id?: number | null;
  task?: { id: number; title?: string } | null;
  content?: { id: number; title?: string } | null;
};
type DataTableResponse = {
  id: number;
  name: string;
  columns?: AttachmentTableColumn[];
  can_edit?: boolean;
  rows?: DataTableRowResponse[];
  rows_meta?: { current_page?: number; last_page?: number; per_page?: number; total?: number };
};
type Mode = 'file' | 'text' | 'library' | 'table';

export const createEmptyAttachmentDraft = (): AttachmentDraft => ({
  files: [], fileDisplayNames: {}, texts: [], assets: [], tables: [], folderId: '', moveToContextFolder: false,
});

/**
 * فرادادهٔ مخزن (دسته‌بندی، سطح دسترسی، وضعیت، برچسب‌ها و دسترسی‌های ویژه) را
 * به بدنهٔ ثبت دارایی اضافه می‌کند؛ مقادیر خالی هرگز ارسال نمی‌شوند.
 */
const appendAssetDefaults = (body: FormData | Record<string, unknown>, defaults?: AttachmentDraft['defaults']) => {
  if (!defaults) return;
  const grants = defaults.confidentiality === 'confidential' ? defaults.grants : undefined;
  const grantPayload = grants && (grants.projects?.length || grants.users?.length || grants.roles?.length)
    ? {
      projects: (grants.projects || []).filter(id => /^\d+$/.test(id)).map(Number),
      users: (grants.users || []).filter(id => /^\d+$/.test(id)).map(Number),
      roles: grants.roles || [],
    }
    : undefined;
  const entries: Array<[string, unknown]> = [
    ['category_id', defaults.categoryId],
    ['confidentiality', defaults.confidentiality],
    ['status', defaults.status],
    ['tags', defaults.tags],
    ['access_grants', grantPayload],
  ];
  for (const [key, value] of entries) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && !value.trim()) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (body instanceof FormData) {
      if (Array.isArray(value)) value.forEach((item, index) => body.append(`${key}[${index}]`, String(item)));
      else if (typeof value === 'object') Object.entries(value as Record<string, unknown>).forEach(([nested, list]) => (list as unknown[]).forEach((item, index) => body.append(`${key}[${nested}][${index}]`, String(item))));
      else body.append(key, String(value));
    } else if (typeof value === 'object' && !Array.isArray(value)) {
      body[key] = value;
    } else {
      body[key] = value;
    }
  }
};
export const attachmentDraftCount = (value: AttachmentDraft) => value.files.length + value.texts.length + value.assets.length + (value.tables || []).length;

const previewUrl = (id: number) => `${apiConfig.baseUrl}/dam/library/${id}/preview`;
const fileKey = (file: File) => `${file.name}:${file.size}:${file.lastModified}`;
const UPLOAD_PROGRESS_EVENT = 'tadbir:attachment-upload-progress';
type UploadProgressDetail = { key: string; loaded: number; total: number; complete?: boolean };
const reportUploadProgress = (detail: UploadProgressDetail) => window.dispatchEvent(new CustomEvent<UploadProgressDetail>(UPLOAD_PROGRESS_EVENT, { detail }));
const sizeLabel = (bytes?: number | null) => {
  if (!bytes) return 'بدون حجم فایل';
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} مگابایت` : `${Math.max(1, Math.round(bytes / 1024))} کیلوبایت`;
};
const megabytes = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(2)} مگابایت`;

const appendRelations = (body: FormData | Record<string, unknown>, relations: AttachmentRelations) => {
  const values: Array<[keyof AttachmentRelations, string]> = [
    ['projectId', 'project_id'], ['taskId', 'task_id'], ['departmentId', 'department_id'], ['contentId', 'content_id'], ['meetingId', 'meeting_id'],
  ];
  for (const [source, target] of values) {
    const value = relations[source];
    if (!value || !/^\d+$/.test(value)) continue;
    if (body instanceof FormData) body.append(target, value);
    else body[target] = Number(value);
  }
  const contextValues: Array<[string, string | undefined]> = [
    ['content_bucket', relations.contentBucket],
    ['relation_role', relations.relationRole],
    ['stage_id', relations.stageId],
    ['output_id', relations.outputId],
  ];
  for (const [target, value] of contextValues) {
    if (!value) continue;
    if (body instanceof FormData) body.append(target, value);
    else body[target] = value;
  }
  const ideaValues: Array<[string, string | undefined]> = [
    ['idea_id', relations.ideaId && /^\d+$/.test(relations.ideaId) ? relations.ideaId : undefined],
    ['idea_title', relations.ideaTitle?.trim().slice(0, 255)],
    ['idea_key', relations.ideaKey],
  ];
  for (const [target, value] of ideaValues) {
    if (!value) continue;
    if (body instanceof FormData) body.append(target, value);
    else body[target] = target === 'idea_id' ? Number(value) : value;
  }
};

const persistedVersion = (asset: AssetResponse) => asset.latest_version || asset.versions?.slice().sort((a, b) => b.version_number - a.version_number)[0];

/**
 * نتیجهٔ انتقال پوشه برای نمایش به کاربر.
 *
 * اتصال دارایی حتی وقتی انتقال انجام نشود معتبر است (مثلاً کاربر مجوز جابه‌جایی
 * ندارد)؛ به همین دلیل خطا پرتاب نمی‌شود و فقط گزارشش به رابط کاربری می‌رسد.
 */
export type AttachmentFolderMoveNotice = { moved: number; unchanged: number; errors: string[] };
export const ATTACHMENT_FOLDER_MOVE_EVENT = 'tadbir:attachment-folder-move';
const reportFolderMove = (notice: AttachmentFolderMoveNotice) => {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent<AttachmentFolderMoveNotice>(ATTACHMENT_FOLDER_MOVE_EVENT, { detail: notice }));
};

export async function persistAttachmentDraft(value: AttachmentDraft, relations: AttachmentRelations, subjectTitle: string, options: AttachmentPersistOptions = {}): Promise<PersistedAttachment[]> {
  const saved: PersistedAttachment[] = [];
  for (const file of value.files) {
    const key = fileKey(file);
    const displayName = value.fileDisplayNames?.[key]?.trim() || file.name;
    const body = new FormData();
    body.append('file', file);
    body.append('title', displayName.slice(0, 255));
    body.append('description', `پیوست ${subjectTitle}`.slice(0, 5000));
    // Reusing a visible checksum match avoids needless physical copies. A match
    // outside this user's scope is intentionally indistinguishable from no match.
    body.append('duplicate_action', value.duplicateAction || 'reuse');
    const targetFolder = value.fileFolderIds?.[key] || value.folderId;
    if (targetFolder) body.append('folder_id', targetFolder);
    appendRelations(body, relations);
    appendAssetDefaults(body, value.defaults);
    reportUploadProgress({ key, loaded: 0, total: file.size });
    const response = await uploadRequest<ApiResponse<AssetResponse>>('/dam/library', body, (loaded, total) => {
      reportUploadProgress({ key, loaded, total });
    }, options.signal);
    reportUploadProgress({ key, loaded: file.size, total: file.size, complete: true });
    const version = persistedVersion(response.data);
    const item: PersistedAttachment = { assetId: response.data.id, name: response.data.title || displayName, size: response.data.latest_file?.file_size ?? file.size, type: 'file', previewUrl: previewUrl(response.data.id), assetVersionId: version?.id, assetVersionNumber: version?.version_number };
    saved.push(item);
    options.onPersisted?.(item, { kind: 'file', key });
  }
  for (const text of value.texts) {
    const body: Record<string, unknown> = { title: text.title.trim().slice(0, 255), body: sanitizeRichTextHtml(text.body), description: `پیوست متنی ${subjectTitle}`.slice(0, 5000) };
    if (value.folderId) body.folder_id = Number(value.folderId);
    appendRelations(body, relations);
    appendAssetDefaults(body, value.defaults);
    const response = await request<ApiResponse<AssetResponse>>('/dam/library', { method: 'POST', body, signal: options.signal });
    const version = persistedVersion(response.data);
    const item: PersistedAttachment = { assetId: response.data.id, name: response.data.title, size: null, type: 'content', previewUrl: previewUrl(response.data.id), assetVersionId: version?.id, assetVersionNumber: version?.version_number };
    saved.push(item);
    options.onPersisted?.(item, { kind: 'text', key: text.id });
  }

  const relationEntries: Array<['project' | 'task' | 'department' | 'content' | 'idea' | 'meeting', string | undefined]> = [
    ['project', relations.projectId], ['task', relations.taskId], ['department', relations.departmentId], ['content', relations.contentId],
    ['idea', relations.ideaId], ['meeting', relations.meetingId],
  ];
  const contextFolder = value.moveToContextFolder ? contextFolderPayload(relations) : null;
  const folderMove: AttachmentFolderMoveNotice = { moved: 0, unchanged: 0, errors: [] };
  for (const asset of value.assets) {
    for (const [relatedType, relatedId] of relationEntries) {
      if (!relatedId || !/^\d+$/.test(relatedId)) continue;
      await request(`/dam/library/${asset.id}/relations`, { method: 'POST', signal: options.signal, body: {
        related_type: relatedType,
        related_id: Number(relatedId),
        relation_role: relations.relationRole,
        stage_id: relations.stageId,
        output_id: relations.outputId,
        asset_version_id: asset.latest_version?.id,
      } });
    }
    // «انتقال به پوشهٔ این بخش» فقط برای دارایی موجود معنا دارد؛ فایل تازه از
    // ابتدا در همان پوشه ذخیره شده است.
    if (contextFolder) {
      try {
        const moved = await request<{ data?: { moved?: boolean; unchanged?: boolean; message?: string } }>(
          `/dam/library/${asset.id}/context-folder`,
          { method: 'POST', body: contextFolder, signal: options.signal },
        );
        if (moved.data?.moved) folderMove.moved++;
        else if (moved.data?.unchanged) folderMove.unchanged++;
      } catch (error) {
        folderMove.errors.push(error instanceof Error ? error.message : 'انتقال دارایی به پوشهٔ این بخش ناموفق بود.');
      }
    }
    const item: PersistedAttachment = { assetId: asset.id, name: asset.latest_file?.original_filename || asset.title, size: asset.latest_file?.file_size ?? null, type: asset.type || (asset.latest_file ? 'file' : 'content'), previewUrl: previewUrl(asset.id), assetVersionId: asset.latest_version?.id, assetVersionNumber: asset.latest_version?.version_number };
    saved.push(item);
    options.onPersisted?.(item, { kind: 'asset', key: String(asset.id) });
  }
  for (const tableDraft of value.tables || []) {
    let tableId = tableDraft.tableId;
    let tableName = tableDraft.tableName;
    if (tableDraft.mode === 'link') {
      // «اتصال» چیزی نمی‌سازد: همان ردیف‌های موجود جدول به این محتوا/تسک وصل
      // می‌شوند (PATCH همان ردیف). سرور فقط محتوا و تسک را به ردیف جدول وصل
      // می‌کند، پس فقدان زمینه صریح گفته می‌شود.
      if (!tableId) throw new Error('جدول انتخاب‌شده معتبر نیست.');
      const rowIds = tableDraft.rowIds || [];
      if (!rowIds.length) throw new Error('برای اتصال، حداقل یک ردیف از جدول انتخاب کنید.');
      const linkBody: Record<string, unknown> = {};
      if (relations.taskId && /^\d+$/.test(relations.taskId)) linkBody.task_id = Number(relations.taskId);
      if (relations.contentId && /^\d+$/.test(relations.contentId)) linkBody.content_id = Number(relations.contentId);
      if (!Object.keys(linkBody).length) throw new Error('اتصال ردیف جدول اطلاعات فقط برای محتوا یا تسک ممکن است.');
      for (const rowId of rowIds) {
        await request(`/dam/data-tables/${tableId}/rows/${rowId}`, { method: 'PATCH', body: linkBody, signal: options.signal });
      }
      const linked: PersistedAttachment = {
        assetId: tableId,
        dataTableId: tableId,
        rowIds: [...rowIds],
        rowLabels: (tableDraft.rowLabels || []).slice(0, 20),
        name: `${tableName} — ${rowIds.length.toLocaleString('fa-IR')} ردیف متصل‌شده`,
        size: null,
        type: 'data_table',
        previewUrl: '',
      };
      saved.push(linked);
      options.onPersisted?.(linked, { kind: 'table', key: tableDraft.id });
      continue;
    }
    if (tableDraft.mode === 'create') {
      const created = await request<ApiResponse<DataTableResponse>>('/dam/data-tables', {
        method: 'POST',
        signal: options.signal,
        body: {
          name: tableDraft.tableName.trim().slice(0, 255),
          description: `جدول اطلاعات پیوست ${subjectTitle}`.slice(0, 2000),
          columns: tableDraft.columns,
        },
      });
      tableId = created.data.id;
      tableName = created.data.name;
    }
    if (!tableId) throw new Error('جدول انتخاب‌شده معتبر نیست.');
    const rows = tableDraft.rows?.length ? tableDraft.rows : [tableDraft.cells];
    const createdRowIds: number[] = [];
    for (const cells of rows) {
      const rowBody: Record<string, unknown> = { cells };
      if (relations.taskId && /^\d+$/.test(relations.taskId)) rowBody.task_id = Number(relations.taskId);
      if (relations.contentId && /^\d+$/.test(relations.contentId)) rowBody.content_id = Number(relations.contentId);
      const created = await request<ApiResponse<DataTableRowResponse>>(`/dam/data-tables/${tableId}/rows`, { method: 'POST', body: rowBody, signal: options.signal });
      if (created?.data?.id) createdRowIds.push(created.data.id);
    }
    const item: PersistedAttachment = {
      assetId: tableId,
      dataTableId: tableId,
      rowIds: createdRowIds,
      rowLabels: rows.slice(0, 20).map(cells => dataTableRowLabel({ id: 0, cells }, tableDraft.columns || [])),
      name: `${tableName} — ${rows.length.toLocaleString('fa-IR')} ردیف اطلاعات`,
      size: null,
      type: 'data_table',
      previewUrl: '',
    };
    saved.push(item);
    options.onPersisted?.(item, { kind: 'table', key: tableDraft.id });
  }
  if (contextFolder && (folderMove.moved || folderMove.unchanged || folderMove.errors.length)) {
    reportFolderMove(folderMove);
  }
  return saved;
}

export function AttachmentComposer({ value, onChange, disabled = false, title = 'ضمیمه‌ها', defaultFolderLabel = 'ریشه مخزن', allowDirectoryUpload = false, linkTarget, defaultFileDisplayName, allowedModes }: {
  value: AttachmentDraft;
  onChange: (value: AttachmentDraft) => void;
  disabled?: boolean;
  title?: string;
  defaultFolderLabel?: string;
  /** در مخزن مرکزی، انتخاب پوشهٔ سیستم برای ساخت همان درخت پوشه‌ها در DAM. */
  allowDirectoryUpload?: boolean;
  /**
   * نام نمایشی پیش‌فرضِ فایل‌های تازه. در ثبت خروجیِ مرحلهٔ محتوا، کد همان
   * پرونده است تا عنوان دارایی در مخزن از ابتدا معنادار باشد؛ کاربر همچنان
   * می‌تواند آن را پیش از ثبت تغییر دهد. در نبودِ این prop همان نام فایلِ
   * سیستم (رفتار همیشگی) به‌کار می‌رود.
   */
  defaultFileDisplayName?: string;
  /**
   * محدود کردن روش‌های افزودن؛ برای سلول‌هایی که فقط دارایی می‌پذیرند
   * (مثل ستون «دارایی دیجیتال»ِ جدول اطلاعات) به «فایل» و «انتخاب از مخزن».
   */
  allowedModes?: Array<'file' | 'text' | 'library' | 'table'>;
  /**
   * زمینهٔ اتصال ردیف جدول اطلاعات. سرور ردیف را فقط به محتوا یا تسک وصل
   * می‌کند؛ اگر این prop نیامده باشد (مثل فرم ساخت محتوای تازه که هنوز شناسه
   * ندارد) حالت «اتصال ردیف» نمایش داده نمی‌شود.
   */
  linkTarget?: { taskId?: string; contentId?: string };
}) {
  const { hasPermission, users } = useApp();
  const canUpload = hasPermission('assets.upload');
  const canViewLibrary = hasPermission('assets.view');
  const canBrowse = canViewLibrary && hasPermission('assets.edit_info');
  const canUseTables = canUpload || canViewLibrary;
  /** اتصال ردیف موجود فقط در زمینهٔ محتوا/تسک معنا دارد (قانون سرور). */
  const rowLinkTarget = linkTarget?.taskId || linkTarget?.contentId ? { taskId: linkTarget?.taskId, contentId: linkTarget?.contentId } : undefined;
  const canLinkRows = canViewLibrary && Boolean(rowLinkTarget);
  /**
   * نام نمایشیِ فایل تازه: پیش‌فرضِ داده‌شده (مثل کد محتوا) برای نخستین فایل و
   * شماره‌دار برای فایل‌های بعدی تا عنوان دارایی‌ها در مخزن یکتا بماند.
   */
  const displayNameFor = (file: File, taken: Set<string>): string => {
    const fallback = file.name;
    const base = (defaultFileDisplayName || '').trim();
    if (!base) return fallback;
    let candidate = base;
    let counter = 2;
    while (taken.has(candidate)) candidate = `${base} (${counter++})`;
    return candidate;
  };
  const [mode, setMode] = useState<Mode>('file');
  const activeMode: Mode = (() => {
    const fallback: Mode = mode === 'file' && !canUpload ? (canBrowse ? 'library' : canUseTables ? 'table' : 'file') : mode;
    if (!allowedModes || allowedModes.includes(fallback)) return fallback;
    return (allowedModes as Mode[]).find(item => item === 'library' && canBrowse)
      ?? (allowedModes as Mode[]).find(item => item === 'file' && canUpload)
      ?? (allowedModes as Mode[]).find(item => item === 'table' && canUseTables)
      ?? fallback;
  })();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  const [libraryFolderId, setLibraryFolderId] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [libraryItems, setLibraryItems] = useState<AttachmentLibraryAsset[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState<AttachmentTextDraft | null>(null);
  const [error, setError] = useState('');
  // نتیجهٔ «انتقال فایل‌های مخزن به پوشهٔ این بخش»؛ اتصال حتی با خطای انتقال معتبر است.
  const [folderNotice, setFolderNotice] = useState<{ tone: 'success' | 'warning'; text: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, UploadProgressDetail>>({});
  const [tableOperation, setTableOperation] = useState<'create' | 'append' | 'link'>(canViewLibrary ? 'append' : 'create');
  // حالت مؤثر جدول: اگر زمینهٔ محتوا/تسک نباشد، «اتصال ردیف» به حالت افزودن برمی‌گردد.
  const activeTableOperation: 'create' | 'append' | 'link' = tableOperation === 'link' && !canLinkRows ? 'append' : tableOperation;
  const [dataTables, setDataTables] = useState<DataTableResponse[]>([]);
  const [dataTablesLoading, setDataTablesLoading] = useState(false);
  const [dataTablesLoaded, setDataTablesLoaded] = useState(false);
  const [selectedTable, setSelectedTable] = useState<DataTableResponse | null>(null);
  const [tableDetailLoading, setTableDetailLoading] = useState(false);
  // حالت «اتصال ردیف‌های موجود»: ردیف‌های همان جدول با صفحه‌بندی و جست‌وجوی
  // سمت سرور خوانده می‌شوند و کاربر ردیف‌های موردنظر را انتخاب می‌کند.
  const [tableRows, setTableRows] = useState<DataTableRowResponse[]>([]);
  const [tableRowsLoading, setTableRowsLoading] = useState(false);
  const [tableRowsMeta, setTableRowsMeta] = useState<{ page: number; lastPage: number; total: number }>({ page: 1, lastPage: 1, total: 0 });
  const [rowSearch, setRowSearch] = useState('');
  const [rowSearchColumn, setRowSearchColumn] = useState('');
  const [selectedRowIds, setSelectedRowIds] = useState<number[]>([]);
  const [newTableName, setNewTableName] = useState('');
  const [newColumns, setNewColumns] = useState<AttachmentTableColumn[]>([
    { id: crypto.randomUUID(), name: '', type: 'text', required: false },
  ]);
  const [tableCells, setTableCells] = useState<Record<string, string>>({});
  const [newTableRows, setNewTableRows] = useState<Array<{ id: string; cells: Record<string, string> }>>([]);
  const [editingStagedRowId, setEditingStagedRowId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const directoryInput = useRef<HTMLInputElement>(null);
  const [directoryBusy, setDirectoryBusy] = useState(false);
  const folderPathName = (folderId: number) => {
    const names: string[] = [];
    let current = folders.find(folder => folder.id === folderId);
    let guard = 0;
    while (current && guard++ < 30) {
      names.unshift(current.name);
      current = current.parent_id ? folders.find(folder => folder.id === current!.parent_id) : undefined;
    }
    return names.join(' / ');
  };
  const folderPath = (folderId: number | null) => {
    const path: Folder[] = [];
    let current = folderId ? folders.find(folder => folder.id === folderId) : undefined;
    let guard = 0;
    while (current && guard++ < 30) {
      path.unshift(current);
      current = current.parent_id ? folders.find(folder => folder.id === current!.parent_id) : undefined;
    }
    return path;
  };
  const libraryPath = folderPath(libraryFolderId);
  const libraryChildFolders = folders.filter(folder => folder.parent_id === libraryFolderId);

  useEffect(() => {
    const receiveProgress = (event: Event) => {
      const detail = (event as CustomEvent<UploadProgressDetail>).detail;
      setUploadProgress(previous => ({ ...previous, [detail.key]: detail }));
    };
    window.addEventListener(UPLOAD_PROGRESS_EVENT, receiveProgress);
    return () => window.removeEventListener(UPLOAD_PROGRESS_EVENT, receiveProgress);
  }, []);

  useEffect(() => {
    if (!canUpload && !canBrowse) return;
    request<{ data: Folder[] }>('/dam/library/folders').then(response => setFolders(response.data || [])).catch(() => setFolders([]));
  }, [canUpload, canBrowse]);

  const createFolder = async (name: string, parentId: number | null) => {
    try {
      const response = await request<ApiResponse<Folder>>('/dam/library/folders', { method: 'POST', body: { name, parent_id: parentId } });
      setFolders(current => [...current, response.data]);
      setError('');
      return response.data;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'ساخت پوشه انجام نشد.');
      throw caught;
    }
  };

  const searchLibrary = async (text: string, folderId: number | null = libraryFolderId) => {
    setQuery(text);
    setLibraryLoading(true);
    try {
      const params = new URLSearchParams({ per_page: '30', folder_id: String(folderId || 0) });
      if (text.trim()) params.set('search', text.trim());
      const response = await request<{ data: AttachmentLibraryAsset[] }>(`/dam/library?${params}`);
      setLibraryItems(response.data || []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'دریافت دارایی‌ها انجام نشد.');
      setLibraryItems([]);
    } finally {
      setLibraryLoading(false);
    }
  };
  const openLibraryFolder = (folderId: number | null) => {
    setLibraryFolderId(folderId);
    void searchLibrary('', folderId);
  };

  useEffect(() => {
    const onFolderMove = (event: Event) => {
      const detail = (event as CustomEvent<AttachmentFolderMoveNotice>).detail;
      if (!detail) return;
      const parts: string[] = [];
      if (detail.moved) parts.push(`${detail.moved.toLocaleString('fa-IR')} دارایی به پوشهٔ این بخش منتقل شد`);
      if (detail.unchanged) parts.push(`${detail.unchanged.toLocaleString('fa-IR')} دارایی از قبل در همان پوشه بود`);
      if (detail.errors.length) {
        setFolderNotice({ tone: 'warning', text: [...parts, ...detail.errors].join(' · ') });
        return;
      }
      setFolderNotice(parts.length ? { tone: 'success', text: parts.join(' · ') } : null);
    };
    window.addEventListener(ATTACHMENT_FOLDER_MOVE_EVENT, onFolderMove);
    return () => window.removeEventListener(ATTACHMENT_FOLDER_MOVE_EVENT, onFolderMove);
  }, []);

  useEffect(() => {
    if (activeMode === 'library' && canBrowse && libraryItems.length === 0 && !libraryLoading) void searchLibrary('');
    // The initial request is tied to opening this mode; query edits call searchLibrary directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMode, canBrowse]);

  useEffect(() => {
    if (activeMode !== 'table' || !canViewLibrary || dataTablesLoaded || dataTablesLoading) return;
    setDataTablesLoading(true);
    request<{ data: DataTableResponse[] }>('/dam/data-tables')
      .then(response => setDataTables(response.data || []))
      .catch(caught => setError(caught instanceof Error ? caught.message : 'دریافت جدول‌های اطلاعات انجام نشد.'))
      .finally(() => { setDataTablesLoading(false); setDataTablesLoaded(true); });
  }, [activeMode, canViewLibrary, dataTablesLoaded, dataTablesLoading]);

  /** ردیف‌های یک جدول با صفحه‌بندی و فیلتر سمت سرور (فقط برای حالت اتصال). */
  const loadTableRows = async (tableId: number, page = 1, search = rowSearch, columnId = rowSearchColumn) => {
    setTableRowsLoading(true);
    try {
      const params = new URLSearchParams({ row_page: String(page), per_page: '20' });
      if (search.trim()) {
        // فیلتر سرور روی یک ستون اعمال می‌شود؛ پیش‌فرض نخستین ستون متنی جدول.
        const column = columnId || (selectedTable?.columns || []).find(item => ['text', 'long_text', 'link'].includes(item.type || 'text'))?.id || '';
        if (column) params.set(`filters[${column}]`, search.trim());
      }
      const response = await request<ApiResponse<DataTableResponse>>(`/dam/data-tables/${tableId}?${params}`);
      setTableRows(response.data.rows || []);
      setTableRowsMeta({
        page: response.data.rows_meta?.current_page || page,
        lastPage: Math.max(1, response.data.rows_meta?.last_page || 1),
        total: response.data.rows_meta?.total ?? (response.data.rows || []).length,
      });
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'دریافت ردیف‌های جدول انجام نشد.');
      setTableRows([]);
    } finally {
      setTableRowsLoading(false);
    }
  };

  const chooseDataTable = async (id: string) => {
    setSelectedTable(null); setTableCells({});
    setTableRows([]); setSelectedRowIds([]);
    if (!id) return;
    setTableDetailLoading(true); setError('');
    try {
      const response = await request<ApiResponse<DataTableResponse>>(`/dam/data-tables/${id}`);
      setSelectedTable(response.data);
      if (tableOperation === 'link') {
        const firstSearchable = (response.data.columns || []).find(column => ['text', 'long_text', 'link'].includes(column.type || 'text'))?.id || '';
        setRowSearchColumn(firstSearchable);
        setRowSearch('');
        await loadTableRows(Number(id), 1, '', firstSearchable);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'دریافت ساختار جدول انجام نشد.');
    } finally {
      setTableDetailLoading(false);
    }
  };

  const parsedNewColumns: AttachmentTableColumn[] = newColumns
    .map(column => ({ ...column, name: column.name.trim(), options: column.type === 'select' ? (column.options || []).map(option => option.trim()).filter(Boolean) : undefined }))
    .filter(column => column.name)
    .slice(0, 20);
  const activeTableColumns = activeTableOperation === 'create' ? parsedNewColumns : (selectedTable?.columns || []);
  const rowFromCells = (cells: Record<string, string>) => Object.fromEntries(activeTableColumns.map(column => [column.id, String(cells[column.id] || '').trim()]));
  const rowHasContent = (cells: Record<string, string>) => activeTableColumns.some(column => String(cells[column.id] || '').trim());
  const validateRow = (cells: Record<string, string>) => {
    const missingRequired = activeTableColumns.find(column => column.required && !String(cells[column.id] || '').trim());
    if (missingRequired) { setError(`مقدار ستون «${missingRequired.name}» الزامی است.`); return false; }
    return true;
  };
  const stageNewTableRow = () => {
    if (!rowHasContent(tableCells)) { setError('حداقل مقدار یکی از ستون‌های ردیف را وارد کنید.'); return; }
    if (!validateRow(tableCells)) return;
    const cells = rowFromCells(tableCells);
    setNewTableRows(rows => editingStagedRowId
      ? rows.map(row => row.id === editingStagedRowId ? { ...row, cells } : row)
      : [...rows, { id: crypto.randomUUID(), cells }]);
    setEditingStagedRowId(null);
    setTableCells({});
    setError('');
  };
  const addTableDraft = () => {
    if (activeTableOperation === 'link') {
      if (!rowLinkTarget) { setError('اتصال ردیف جدول اطلاعات فقط برای محتوا یا تسک ممکن است.'); return; }
      if (!selectedTable) { setError('یک جدول موجود را انتخاب کنید.'); return; }
      if (selectedTable.can_edit === false) { setError('برای اتصال ردیف، اجازهٔ ویرایش این جدول لازم است.'); return; }
      if (!selectedRowIds.length) { setError('برای اتصال، حداقل یک ردیف را انتخاب کنید.'); return; }
      const draft: AttachmentTableDraft = {
        id: crypto.randomUUID(),
        mode: 'link',
        tableId: selectedTable.id,
        tableName: selectedTable.name,
        columns: activeTableColumns,
        cells: {},
        rowIds: [...selectedRowIds],
        rowLabels: tableRows.filter(row => selectedRowIds.includes(row.id)).map(row => dataTableRowLabel(row, activeTableColumns)),
      };
      onChange({ ...value, tables: [...(value.tables || []), draft] });
      setSelectedRowIds([]); setError('');
      return;
    }
    if (activeTableOperation === 'create' && !canUpload) { setError('برای ایجاد جدول جدید، مجوز بارگذاری دارایی لازم است.'); return; }
    if (activeTableOperation === 'create' && (!newTableName.trim() || parsedNewColumns.length === 0)) { setError('نام جدول و حداقل یک ستون را وارد کنید.'); return; }
    if (activeTableOperation === 'append' && (!selectedTable || selectedTable.can_edit === false)) { setError(selectedTable ? 'اجازه افزودن ردیف به این جدول را ندارید.' : 'یک جدول موجود را انتخاب کنید.'); return; }
    if ((activeTableOperation === 'append' || rowHasContent(tableCells)) && !validateRow(tableCells)) return;
    const currentRow = rowFromCells(tableCells);
    const rows = activeTableOperation === 'create'
      ? [...newTableRows.map(row => row.cells), ...(rowHasContent(tableCells) ? [currentRow] : [])]
      : [currentRow];
    if (activeTableOperation === 'create' && rows.length === 0) { setError('حداقل یک ردیف برای جدول جدید وارد کنید.'); return; }
    const draft: AttachmentTableDraft = {
      id: crypto.randomUUID(),
      mode: activeTableOperation,
      tableId: activeTableOperation === 'append' ? selectedTable?.id : undefined,
      tableName: activeTableOperation === 'create' ? newTableName.trim() : selectedTable!.name,
      columns: activeTableColumns,
      cells: rows[0],
      rows,
    };
    onChange({ ...value, tables: [...(value.tables || []), draft] });
    setTableCells({}); setNewTableRows([]); setEditingStagedRowId(null); setError('');
    if (activeTableOperation === 'create') {
      setNewTableName('');
      setNewColumns([{ id: crypto.randomUUID(), name: '', type: 'text', required: false }]);
    }
  };

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const accepted: File[] = [];
    const existing = new Set(value.files.map(fileKey));
    for (const file of Array.from(files)) {
      if (file.size > 20 * 1024 * 1024) { setError(`فایل «${file.name}» بیشتر از ۲۰ مگابایت است.`); continue; }
      if (!existing.has(fileKey(file))) { accepted.push(file); existing.add(fileKey(file)); }
    }
    if (accepted.length) {
      setError('');
      const taken = new Set(Object.values(value.fileDisplayNames || {}));
      const names: Record<string, string> = {};
      for (const file of accepted) {
        const name = displayNameFor(file, taken);
        taken.add(name);
        names[fileKey(file)] = name;
      }
      onChange({
        ...value,
        files: [...value.files, ...accepted],
        fileDisplayNames: { ...(value.fileDisplayNames || {}), ...names },
      });
    }
    if (fileInput.current) fileInput.current.value = '';
  };

  /**
   * بارگذاری پوشه‌ای: مسیر هر فایل در مخزن مرکزی به همان درخت پوشه‌ها نگاشت
   * می‌شود و پوشه‌های نبود، ساخته می‌شوند؛ سپس هر فایل به پوشهٔ خودش می‌رود.
   */
  const addDirectory = async (files: FileList | null) => {
    if (!files?.length) return;
    setDirectoryBusy(true);
    try {
      const accepted: File[] = [];
      const folderByKey: Record<string, string> = {};
      const existing = new Set(value.files.map(fileKey));
      for (const file of Array.from(files)) {
        if (file.size > 20 * 1024 * 1024) { setError(`فایل «${file.name}» بیشتر از ۲۰ مگابایت است.`); continue; }
        if (existing.has(fileKey(file))) continue;
        existing.add(fileKey(file));
        accepted.push(file);
        const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || '';
        const segments = relativePath ? relativePath.split('/').slice(0, -1).filter(Boolean) : [];
        if (!segments.length) continue;
        let parent: number | null = value.folderId ? Number(value.folderId) : null;
        for (const segment of segments) {
          const found = folders.find(folder => folder.parent_id === parent && folder.name === segment);
          parent = found ? found.id : (await createFolder(segment, parent)).id;
        }
        folderByKey[fileKey(file)] = String(parent ?? '');
      }
      if (accepted.length) {
        setError('');
        const taken = new Set(Object.values(value.fileDisplayNames || {}));
        const names: Record<string, string> = {};
        for (const file of accepted) {
          const name = displayNameFor(file, taken);
          taken.add(name);
          names[fileKey(file)] = name;
        }
        onChange({
          ...value,
          files: [...value.files, ...accepted],
          fileFolderIds: { ...(value.fileFolderIds || {}), ...folderByKey },
          fileDisplayNames: { ...(value.fileDisplayNames || {}), ...names },
        });
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'ساخت پوشه‌های پوشهٔ انتخابی انجام نشد.');
    } finally {
      setDirectoryBusy(false);
      if (directoryInput.current) directoryInput.current.value = '';
    }
  };

  const addText = () => {
    if (!draftTitle.trim() || !hasRichTextContent(draftBody)) { setError('برای پیوست متنی، عنوان و متن را کامل کنید.'); return; }
    const saved = { id: editingTextId || crypto.randomUUID(), title: draftTitle.trim(), body: sanitizeRichTextHtml(draftBody) };
    onChange({ ...value, texts: editingTextId ? value.texts.map(text => text.id === editingTextId ? saved : text) : [...value.texts, saved] });
    setEditingTextId(null); setDraftTitle(''); setDraftBody(''); setError('');
  };
  const editText = (text: AttachmentTextDraft) => {
    setMode('text'); setEditingTextId(text.id); setDraftTitle(text.title); setDraftBody(text.body); setError('');
  };
  const selectedIds = new Set(value.assets.map(asset => asset.id));
  const count = attachmentDraftCount(value);

  const modes = [
    { id: 'file' as Mode, label: 'فایل', description: 'تصویر، سند و رسانه', icon: Upload, allowed: canUpload, count: value.files.length },
    { id: 'text' as Mode, label: 'یادداشت متنی', description: 'ثبت متن در مخزن', icon: FileText, allowed: canUpload, count: value.texts.length },
    { id: 'library' as Mode, label: 'انتخاب از مخزن', description: 'اتصال دارایی موجود', icon: Library, allowed: canBrowse, count: value.assets.length },
    { id: 'table' as Mode, label: 'جدول اطلاعات', description: 'ساخت جدول یا افزودن ردیف', icon: TableProperties, allowed: canUseTables, count: (value.tables || []).length },
  ].filter(item => !allowedModes || allowedModes.includes(item.id));

  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white" aria-label={title}>
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-4 sm:px-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-indigo-100 bg-indigo-50 text-indigo-600"><Paperclip className="h-5 w-5" /></span>
        <div><h3 className="text-sm font-black text-slate-900">{title}</h3><p className="mt-1 text-[11px] leading-5 text-slate-500">فایل، یادداشت یا جدول اطلاعات بسازید و دارایی‌های موجود را بدون تکثیر متصل کنید.</p></div>
      </div>
      <div className="flex items-center gap-2">
        {count > 0 && <span className="rounded-lg bg-indigo-50 px-2.5 py-1.5 text-[10px] font-black text-indigo-700">{count.toLocaleString('fa-IR')} مورد آماده</span>}
        {count > 0 && <button type="button" disabled={disabled} onClick={() => onChange(createEmptyAttachmentDraft())} className="text-[10px] font-bold text-slate-500 hover:text-rose-600 disabled:opacity-40">پاک‌کردن فهرست</button>}
      </div>
    </header>

    <div className="grid lg:grid-cols-[190px_minmax(0,1fr)]">
      <nav className="flex gap-2 overflow-x-auto border-b border-slate-200 bg-slate-50/70 p-3 lg:flex-col lg:border-b-0 lg:border-l" aria-label="روش افزودن ضمیمه">
        {modes.map(item => { const Icon = item.icon; const selected = activeMode === item.id; return <button key={item.id} type="button" disabled={disabled || !item.allowed} onClick={() => { setMode(item.id); setError(''); }} className={`min-w-[145px] rounded-xl border p-3 text-right transition-colors disabled:cursor-not-allowed disabled:opacity-40 lg:min-w-0 ${selected ? 'border-indigo-200 bg-white text-indigo-700' : 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-white'}`}>
          <span className="flex items-center justify-between gap-2"><span className="flex items-center gap-2 text-[11px] font-black"><Icon className="h-4 w-4" />{item.label}</span>{item.count > 0 && <span className="rounded-md bg-indigo-100 px-1.5 py-0.5 text-[9px] font-black text-indigo-700">{item.count.toLocaleString('fa-IR')}</span>}</span>
          <span className="mt-1.5 block text-[9px] leading-4 text-slate-400">{item.description}</span>
        </button>; })}
      </nav>

      <div className="min-w-0 p-4 sm:p-5">
        {activeMode === 'file' && <div className="space-y-3">
          <div onDragEnter={event => { event.preventDefault(); if (!disabled && canUpload) setDragging(true); }} onDragOver={event => event.preventDefault()} onDragLeave={event => { if (event.currentTarget === event.target) setDragging(false); }} onDrop={event => { event.preventDefault(); setDragging(false); if (!disabled && canUpload) addFiles(event.dataTransfer.files); }} className={`rounded-2xl border border-dashed px-5 py-8 text-center transition-colors ${dragging ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 bg-slate-50/60'}`}>
            <Upload className="mx-auto h-7 w-7 text-indigo-500" />
            <p className="mt-3 text-xs font-black text-slate-800">فایل‌ها را اینجا رها کنید</p>
            <p className="mt-1 text-[10px] text-slate-500">یا چند فایل را هم‌زمان انتخاب کنید؛ حداکثر ۲۰ مگابایت برای هر فایل</p>
            <Button type="button" variant="secondary" disabled={disabled || !canUpload} onClick={() => fileInput.current?.click()} className="mt-4 text-xs"><Plus className="h-4 w-4" />انتخاب فایل</Button>
            <input ref={fileInput} hidden type="file" multiple onChange={event => addFiles(event.target.files)} />
            {allowDirectoryUpload && <div className="mt-3 flex flex-col items-center gap-1">
              <Button type="button" variant="secondary" disabled={disabled || !canUpload || directoryBusy} onClick={() => directoryInput.current?.click()} className="text-xs">
                {directoryBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FolderOpen className="h-4 w-4" />}{directoryBusy ? 'در حال ساخت پوشه‌ها…' : 'انتخاب پوشه از رایانه'}
              </Button>
              <p className="text-[9px] text-slate-400">ساختار همان پوشه در مخزن مرکزی ساخته می‌شود و هر فایل در پوشهٔ خودش ثبت می‌شود.</p>
              <input ref={directoryInput} hidden type="file" multiple onChange={event => void addDirectory(event.target.files)} {...({ webkitdirectory: '', directory: '' } as Record<string, string>)} />
            </div>}
          </div>
        </div>}

        {activeMode === 'text' && <div className="space-y-3">
          <div><p className="text-xs font-black text-slate-800">ساخت یادداشت در مخزن</p><p className="mt-1 text-[10px] leading-5 text-slate-500">عنوان و متن به‌عنوان یک دارایی متنی مستقل ذخیره و به این رکورد متصل می‌شود.</p></div>
          <Input value={draftTitle} disabled={disabled || !canUpload} onChange={event => setDraftTitle(event.target.value)} maxLength={255} placeholder="عنوان یادداشت" />
          <RichTextEditor
            value={draftBody}
            onChange={setDraftBody}
            disabled={disabled || !canUpload}
            label="متن یادداشت"
            placeholder="متن یادداشت را وارد کنید…"
            minHeight={180}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" disabled={disabled || !canUpload || !draftTitle.trim() || !hasRichTextContent(draftBody)} onClick={addText} className="text-xs">
              {editingTextId ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{editingTextId ? 'ذخیره تغییرات متن' : 'افزودن به فهرست آماده'}
            </Button>
            {editingTextId && <Button type="button" variant="ghost" onClick={() => { setEditingTextId(null); setDraftTitle(''); setDraftBody(''); }} className="text-xs"><X className="h-4 w-4" />انصراف از ویرایش</Button>}
          </div>
        </div>}

        {activeMode === 'library' && <div className="space-y-3">
          <div><p className="text-xs font-black text-slate-800">مرور پوشه‌ای مخزن</p><p className="mt-1 text-[10px] leading-5 text-slate-500">{value.moveToContextFolder ? 'پوشه را باز کنید و دارایی‌های همان مسیر را انتخاب کنید؛ دارایی تکثیر نمی‌شود و پیش از ثبت، به پوشهٔ همین بخش منتقل می‌شود.' : 'پوشه را باز کنید و دارایی‌های همان مسیر را انتخاب کنید؛ دارایی اصلی جابه‌جا یا تکثیر نمی‌شود.'}</p></div>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-100 bg-slate-50/70 px-3 py-2 text-[10px]">
              <button type="button" onClick={() => openLibraryFolder(null)} className="flex shrink-0 items-center gap-1 font-black text-indigo-700"><HardDrive className="h-3.5 w-3.5" />ریشه مخزن</button>
              {libraryPath.map(folder => <React.Fragment key={folder.id}><ChevronLeft className="h-3 w-3 shrink-0 text-slate-300" /><button type="button" onClick={() => openLibraryFolder(folder.id)} className="max-w-32 shrink-0 truncate font-bold text-slate-600 hover:text-indigo-700">{folder.name}</button></React.Fragment>)}
            </div>
            <div className="p-3"><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input value={query} disabled={disabled || !canBrowse} onChange={event => void searchLibrary(event.target.value, libraryFolderId)} className="!pl-9" placeholder="جست‌وجو در همین پوشه…" /></div></div>
            <div className="max-h-72 space-y-2 overflow-y-auto border-t border-slate-100 bg-slate-50/50 p-2">
              {libraryFolderId !== null && <button type="button" onClick={() => openLibraryFolder(libraryPath.at(-2)?.id || null)} className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-right text-[11px] font-bold text-slate-600 hover:border-indigo-200"><ChevronRight className="h-4 w-4 text-slate-400" />پوشه بالاتر</button>}
              {!query.trim() && libraryChildFolders.map(folder => <button type="button" key={folder.id} title={folderPathName(folder.id)} onClick={() => openLibraryFolder(folder.id)} className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-right text-[11px] transition-colors hover:border-amber-300"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-500"><Folder className="h-4 w-4" /></span><span className="min-w-0 flex-1 truncate font-black text-slate-700">{folder.name}</span><ChevronLeft className="h-3.5 w-3.5 text-slate-300" /></button>)}
              {libraryLoading && <p className="flex items-center justify-center gap-2 py-8 text-[11px] text-slate-400"><LoaderCircle className="h-4 w-4 animate-spin" />در حال دریافت دارایی‌های پوشه…</p>}
              {!libraryLoading && libraryItems.map(asset => { const checked = selectedIds.has(asset.id); return <label key={asset.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border bg-white px-3 py-2.5 text-[11px] ${checked ? 'border-indigo-300' : 'border-slate-100 hover:border-slate-200'}`}><input type="checkbox" checked={checked} onChange={() => onChange({ ...value, assets: checked ? value.assets.filter(item => item.id !== asset.id) : [...value.assets, asset] })} /><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600"><File className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block truncate font-black text-slate-700">{asset.latest_file?.original_filename || asset.title}</span><span className="mt-0.5 block text-[9px] text-slate-400">{asset.latest_file ? sizeLabel(asset.latest_file.file_size) : 'دارایی متنی'}</span></span><span className={`rounded-md px-2 py-1 text-[9px] font-bold ${checked ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>{checked ? 'انتخاب شد' : 'انتخاب'}</span></label>; })}
              {!libraryLoading && !libraryItems.length && (query.trim() || !libraryChildFolders.length) && <p className="py-8 text-center text-[11px] text-slate-400">در این پوشه دارایی‌ای پیدا نشد.</p>}
            </div>
          </div>
          {/* انتقال فایل‌های مخزن به همان پوشه‌ای که آپلود تازه در این بخش استفاده می‌کند. */}
          <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
            <input
              type="checkbox"
              checked={Boolean(value.moveToContextFolder)}
              disabled={disabled}
              onChange={event => onChange({ ...value, moveToContextFolder: event.target.checked })}
              className="mt-0.5"
            />
            <span className="min-w-0 text-[10px] leading-5 text-slate-600">
              <span className="block font-black text-slate-700">انتقال دارایی‌های انتخاب‌شده به پوشهٔ این بخش</span>
              <span className="block text-slate-500">مقصد همان پوشهٔ پیش‌فرضی است که آپلود تازه در این بخش استفاده می‌کند: {defaultFolderLabel}</span>
              <span className="block text-slate-400">اگر مجوز جابه‌جایی دارایی را نداشته باشید، اتصال انجام می‌شود و فایل در پوشهٔ فعلی خود می‌ماند.</span>
            </span>
          </label>
        </div>}

        {activeMode === 'table' && <div className="space-y-4">
          <div><p className="text-xs font-black text-slate-800">جدول اطلاعات</p><p className="mt-1 text-[10px] leading-5 text-slate-500">جدول تازه بسازید، ردیف تازه به یک جدول موجود اضافه کنید، یا ردیف‌های موجودِ یک جدول را به این مورد متصل کنید.</p></div>
          <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1">
            <button type="button" disabled={disabled || !canViewLibrary} onClick={() => { setTableOperation('append'); setTableCells({}); setNewTableRows([]); setSelectedRowIds([]); setError(''); }} className={`flex-1 rounded-lg px-3 py-2 text-[11px] font-bold ${activeTableOperation === 'append' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-500'}`}>افزودن ردیف به جدول موجود</button>
            <button type="button" disabled={disabled || !canUpload} onClick={() => { setTableOperation('create'); setTableCells({}); setNewTableRows([]); setSelectedRowIds([]); setError(''); }} className={`flex-1 rounded-lg px-3 py-2 text-[11px] font-bold disabled:opacity-40 ${activeTableOperation === 'create' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-500'}`}>ساخت جدول جدید</button>
            {canLinkRows && <button type="button" disabled={disabled} onClick={() => { setTableOperation('link'); setTableCells({}); setNewTableRows([]); setSelectedRowIds([]); setError(''); if (selectedTable) { const firstSearchable = (selectedTable.columns || []).find(column => ['text', 'long_text', 'link'].includes(column.type || 'text'))?.id || ''; setRowSearchColumn(firstSearchable); void loadTableRows(selectedTable.id, 1, rowSearch, firstSearchable); } }} className={`flex-1 rounded-lg px-3 py-2 text-[11px] font-bold ${activeTableOperation === 'link' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-500'}`}>اتصال ردیف‌های موجود</button>}
          </div>

          {activeTableOperation === 'create' ? <div className="space-y-3">
            <Input value={newTableName} disabled={disabled || !canUpload} onChange={event => setNewTableName(event.target.value)} maxLength={255} placeholder="نام جدول جدید *" />
            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <div className="flex items-center justify-between gap-2"><p className="text-[10px] font-black text-slate-700">تعریف ستون‌های نوع‌دار *</p><Button type="button" variant="ghost" disabled={disabled || newColumns.length >= 20} onClick={() => setNewColumns(columns => [...columns, { id: crypto.randomUUID(), name: '', type: 'text', required: false }])} className="h-8 min-h-8 px-2 text-[10px]"><Plus className="h-3.5 w-3.5" />ستون</Button></div>
              {newColumns.map((column, index) => <div key={column.id} className="grid gap-2 rounded-xl border border-slate-200 bg-white p-2.5 sm:grid-cols-[minmax(0,1fr)_150px_auto_auto] sm:items-center">
                <Input aria-label={`نام ستون ${(index + 1).toLocaleString('fa-IR')}`} value={column.name} disabled={disabled || !canUpload} onChange={event => { const name = event.target.value; setNewColumns(columns => columns.map(item => item.id === column.id ? { ...item, name } : item)); setTableCells({}); setNewTableRows([]); }} maxLength={100} placeholder={`نام ستون ${(index + 1).toLocaleString('fa-IR')}`} />
                <Select aria-label={`نوع ستون ${column.name || index + 1}`} value={column.type || 'text'} disabled={disabled || !canUpload} onChange={event => { const type = event.target.value as AttachmentTableColumn['type']; setNewColumns(columns => columns.map(item => item.id === column.id ? { ...item, type, options: type === 'select' ? item.options || [] : undefined } : item)); setTableCells({}); setNewTableRows([]); }}>
                  <option value="text">متن</option><option value="long_text">متن بلند</option><option value="number">عدد</option><option value="date">تاریخ</option><option value="select">گزینه‌ای</option><option value="boolean">بله / خیر</option><option value="link">پیوند</option><option value="user">شخص</option><option value="asset">دارایی</option>
                </Select>
                <label className="flex items-center gap-1.5 whitespace-nowrap text-[10px] font-bold text-slate-600"><input type="checkbox" checked={!!column.required} onChange={event => setNewColumns(columns => columns.map(item => item.id === column.id ? { ...item, required: event.target.checked } : item))} />الزامی</label>
                <button type="button" disabled={newColumns.length === 1} onClick={() => { setNewColumns(columns => columns.filter(item => item.id !== column.id)); setTableCells({}); setNewTableRows([]); }} aria-label={`حذف ستون ${column.name || index + 1}`} className="p-1.5 text-slate-400 hover:text-rose-600 disabled:opacity-30"><Trash2 className="h-4 w-4" /></button>
                {column.type === 'select' && <Input value={(column.options || []).join('، ')} onChange={event => { const options = event.target.value.split(/[،,]/).map(option => option.trim()); setNewColumns(columns => columns.map(item => item.id === column.id ? { ...item, options } : item)); }} className="sm:col-span-4" placeholder="گزینه‌ها را با ویرگول جدا کنید *" />}
              </div>)}
            </div>
          </div> : <div className="space-y-2">
            <Select value={selectedTable?.id || ''} disabled={disabled || dataTablesLoading} onChange={event => void chooseDataTable(event.target.value)}>
              <option value="">انتخاب جدول موجود</option>
              {dataTables.map(table => <option key={table.id} value={table.id}>{table.name}</option>)}
            </Select>
            {dataTablesLoading && <p className="flex items-center gap-2 text-[10px] text-slate-400"><LoaderCircle className="h-3.5 w-3.5 animate-spin" />در حال دریافت جدول‌ها…</p>}
            {!dataTablesLoading && dataTablesLoaded && !dataTables.length && <p className="text-[10px] text-slate-400">جدول قابل مشاهده‌ای وجود ندارد؛ در صورت داشتن مجوز، یک جدول جدید بسازید.</p>}
            {tableDetailLoading && <p className="flex items-center gap-2 text-[10px] text-slate-400"><LoaderCircle className="h-3.5 w-3.5 animate-spin" />در حال دریافت ستون‌ها…</p>}
            {selectedTable?.can_edit === false && <p className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-[10px] text-amber-800">این جدول فقط برای مشاهده در دسترس شماست.</p>}
          </div>}

          {activeTableOperation === 'link' && <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
            <p className="text-[10px] leading-5 text-slate-500">
              ردیف‌های موجود همین جدول را انتخاب کنید تا بدون ساختن ردیف تازه، به این {rowLinkTarget?.contentId ? 'محتوا' : 'تسک'} متصل شوند.
            </p>
            {!selectedTable && <p className="text-[10px] text-slate-400">ابتدا از فهرست بالا یک جدول انتخاب کنید.</p>}
            {selectedTable && selectedTable.can_edit === false && <p className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-[10px] text-amber-800">برای اتصال ردیف، اجازهٔ ویرایش این جدول لازم است؛ این جدول فقط برای مشاهده در دسترس شماست.</p>}
            {selectedTable && selectedTable.can_edit !== false && <>
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                <label className="space-y-1.5 text-[10px] font-bold text-slate-600">ستون جست‌وجو
                  <Select value={rowSearchColumn} disabled={disabled || tableRowsLoading} onChange={event => { setRowSearchColumn(event.target.value); void loadTableRows(selectedTable.id, 1, rowSearch, event.target.value); }}>
                    <option value="">بدون فیلتر ستونی</option>
                    {(selectedTable.columns || []).map(column => <option key={column.id} value={column.id}>{column.name}</option>)}
                  </Select>
                </label>
                <label className="space-y-1.5 text-[10px] font-bold text-slate-600">متن جست‌وجو
                  <Input value={rowSearch} disabled={disabled || tableRowsLoading} onChange={event => setRowSearch(event.target.value)} placeholder="مثلاً نام یا کد" />
                </label>
                <Button type="button" variant="secondary" disabled={disabled || tableRowsLoading} onClick={() => void loadTableRows(selectedTable.id, 1)} className="self-end text-[11px]"><Search className="h-4 w-4" />جست‌وجو</Button>
              </div>
              {tableRowsLoading && <p className="flex items-center gap-2 text-[10px] text-slate-400"><LoaderCircle className="h-3.5 w-3.5 animate-spin" />در حال دریافت ردیف‌های جدول…</p>}
              {!tableRowsLoading && !tableRows.length && <p className="text-[10px] text-slate-400">ردیفی با این جست‌وجو پیدا نشد.</p>}
              {!tableRowsLoading && tableRows.map(row => {
                const alreadyLinked = rowLinkTarget ? dataTableRowIsLinked(row, rowLinkTarget) : false;
                const checked = selectedRowIds.includes(row.id);
                return <label key={row.id} className={`flex cursor-pointer items-start gap-2.5 rounded-xl border bg-white px-3 py-2.5 text-[11px] ${alreadyLinked ? 'border-emerald-200' : checked ? 'border-indigo-300' : 'border-slate-100 hover:border-slate-200'}`}>
                  <input type="checkbox" checked={checked} disabled={disabled || alreadyLinked} onChange={() => setSelectedRowIds(ids => checked ? ids.filter(id => id !== row.id) : [...ids, row.id])} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-black text-slate-700">{dataTableRowLabel(row, selectedTable.columns || [])}</span>
                    <span className="mt-0.5 block text-[9px] text-slate-400">
                      شناسهٔ ردیف {row.id.toLocaleString('fa-IR')} · {alreadyLinked ? 'قبلاً به همین مورد متصل است' : dataTableRowLinkLabel(row)}
                    </span>
                  </span>
                </label>;
              })}
              {tableRowsMeta.lastPage > 1 && <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500">
                <button type="button" disabled={tableRowsLoading || tableRowsMeta.page <= 1} onClick={() => void loadTableRows(selectedTable.id, tableRowsMeta.page - 1)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-bold disabled:opacity-40">صفحهٔ قبل</button>
                <span>صفحهٔ {tableRowsMeta.page.toLocaleString('fa-IR')} از {tableRowsMeta.lastPage.toLocaleString('fa-IR')} · {tableRowsMeta.total.toLocaleString('fa-IR')} ردیف</span>
                <button type="button" disabled={tableRowsLoading || tableRowsMeta.page >= tableRowsMeta.lastPage} onClick={() => void loadTableRows(selectedTable.id, tableRowsMeta.page + 1)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-bold disabled:opacity-40">صفحهٔ بعد</button>
              </div>}
              {selectedRowIds.length > 0 && <p className="text-[10px] font-bold text-indigo-700">{selectedRowIds.length.toLocaleString('fa-IR')} ردیف برای اتصال انتخاب شده است.</p>}
            </>}
          </div>}

          {activeTableOperation !== 'link' && activeTableColumns.length > 0 && <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-black text-slate-700">{activeTableOperation === 'create' ? `ورود ردیف ${(newTableRows.length + 1).toLocaleString('fa-IR')}` : 'مقادیر ردیف جدید'}</p>
              {activeTableOperation === 'create' && newTableRows.length > 0 && <span className="rounded-md bg-emerald-100 px-2 py-1 text-[9px] font-bold text-emerald-700">{newTableRows.length.toLocaleString('fa-IR')} ردیف ثبت‌شده</span>}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {activeTableColumns.map(column => <label key={column.id} className="space-y-1.5 text-[10px] font-bold text-slate-600"><span>{column.name}{column.required ? ' *' : ''}</span>
                {column.type === 'select' ? <Select value={tableCells[column.id] || ''} disabled={disabled || selectedTable?.can_edit === false} onChange={event => setTableCells(current => ({ ...current, [column.id]: event.target.value }))}><option value="">انتخاب کنید</option>{(column.options || []).map(option => <option key={option} value={option}>{option}</option>)}</Select>
                  : column.type === 'boolean' ? <Select value={tableCells[column.id] || ''} disabled={disabled || selectedTable?.can_edit === false} onChange={event => setTableCells(current => ({ ...current, [column.id]: event.target.value }))}><option value="">انتخاب کنید</option><option value="1">بله</option><option value="0">خیر</option></Select>
                  : column.type === 'user' ? <Select value={tableCells[column.id] || ''} disabled={disabled || selectedTable?.can_edit === false} onChange={event => setTableCells(current => ({ ...current, [column.id]: event.target.value }))}><option value="">انتخاب شخص</option>{users.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}</Select>
                  : column.type === 'long_text' ? <textarea className="ui-input min-h-24" value={tableCells[column.id] || ''} disabled={disabled || selectedTable?.can_edit === false} onChange={event => setTableCells(current => ({ ...current, [column.id]: event.target.value }))} />
                  : <Input type={column.type === 'number' ? 'number' : column.type === 'date' ? 'date' : column.type === 'link' ? 'url' : 'text'} value={tableCells[column.id] || ''} disabled={disabled || selectedTable?.can_edit === false} onChange={event => setTableCells(current => ({ ...current, [column.id]: event.target.value }))} />}
              </label>)}
            </div>
            {activeTableOperation === 'create' && (
              <Button type="button" variant="ghost" disabled={disabled || !rowHasContent(tableCells)} onClick={stageNewTableRow} className="text-xs">
                {editingStagedRowId ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{editingStagedRowId ? 'ذخیره تغییرات این ردیف' : 'ثبت این ردیف و افزودن ردیف دیگر'}
              </Button>
            )}
          </div>}
          {activeTableOperation === 'create' && newTableRows.length > 0 && (
            <div className="space-y-2 rounded-xl border border-emerald-100 bg-emerald-50/40 p-3">
              <p className="text-[10px] font-black text-emerald-800">ردیف‌های آماده برای جدول جدید</p>
              {newTableRows.map((row, index) => (
                <div key={row.id} className="flex items-center gap-2 rounded-lg bg-white px-2.5 py-2 text-[10px] text-slate-600">
                  <b className="shrink-0 text-emerald-700">ردیف {(index + 1).toLocaleString('fa-IR')}</b>
                  <span className="min-w-0 flex-1 truncate">{activeTableColumns.map(column => row.cells[column.id]).filter(Boolean).join(' · ') || 'بدون مقدار'}</span>
                  <button type="button" aria-label={`ویرایش ردیف ${(index + 1).toLocaleString('fa-IR')}`} onClick={() => { setEditingStagedRowId(row.id); setTableCells({ ...row.cells }); }} className="p-1 text-slate-400 hover:text-indigo-600"><Pencil className="h-3.5 w-3.5" /></button>
                  <button type="button" aria-label={`حذف ردیف ${(index + 1).toLocaleString('fa-IR')}`} onClick={() => { setNewTableRows(rows => rows.filter(item => item.id !== row.id)); if (editingStagedRowId === row.id) { setEditingStagedRowId(null); setTableCells({}); } }} className="p-1 text-slate-400 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          )}
          <Button type="button" variant="secondary" disabled={disabled || (activeTableOperation === 'link'
            ? (!selectedTable || selectedTable.can_edit === false || selectedRowIds.length === 0)
            : (activeTableColumns.length === 0 || (activeTableOperation === 'create' && newTableRows.length === 0 && !rowHasContent(tableCells)) || (activeTableOperation === 'append' && (!selectedTable || selectedTable.can_edit === false))))} onClick={addTableDraft} className="text-xs"><Plus className="h-4 w-4" />{activeTableOperation === 'create' ? `افزودن جدول و ${(newTableRows.length + (rowHasContent(tableCells) ? 1 : 0)).toLocaleString('fa-IR')} ردیف به فهرست آماده` : activeTableOperation === 'link' ? `افزودن ${selectedRowIds.length.toLocaleString('fa-IR')} ردیف انتخاب‌شده به فهرست آماده` : 'افزودن ردیف به فهرست آماده'}</Button>
        </div>}

        {canUpload && (activeMode === 'file' || activeMode === 'text') && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5"><div className="flex items-center gap-2 text-[10px] font-bold text-slate-600"><FolderOpen className="h-4 w-4 text-slate-400" />محل ذخیره در مخزن</div><Button type="button" variant="secondary" disabled={disabled} onClick={() => setFolderPickerOpen(true)} className="max-w-full justify-between text-xs sm:min-w-72"><span className="min-w-0 truncate">{value.folderId ? folderPathName(Number(value.folderId)) || defaultFolderLabel : defaultFolderLabel}</span><ChevronLeft className="h-4 w-4 shrink-0 text-slate-400" /></Button></div>}
        {!canUpload && !canBrowse && !canUseTables && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] leading-6 text-amber-800">برای افزودن ضمیمه، مجوز مشاهده یا بارگذاری دارایی لازم است.</p>}
        {folderNotice && <p role="status" className={`mt-3 rounded-xl border p-3 text-[11px] leading-6 ${folderNotice.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>{folderNotice.text}</p>}
        {error && <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-[11px] leading-6 text-rose-700">{error}</p>}
      </div>
    </div>

    {count > 0 && <div className="border-t border-slate-200 bg-slate-50/60 px-4 py-4 sm:px-5">
      <div className="mb-3 flex items-center justify-between"><p className="text-[11px] font-black text-slate-800">فهرست آمادهٔ اتصال</p><p className="text-[10px] text-slate-500">پس از ذخیره فرم، این موارد متصل می‌شوند.</p></div>
      <div className="grid gap-2 sm:grid-cols-2">
        {value.files.map(file => {
          const progress = uploadProgress[fileKey(file)];
          const percent = progress?.total ? Math.min(100, Math.round(progress.loaded * 100 / progress.total)) : 0;
          const key = fileKey(file);
          return <div key={key} className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2.5"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600"><File className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-[11px] font-black text-slate-700">{value.fileDisplayNames?.[key] || file.name}</span><span className="text-[9px] text-slate-400">{(file as File & { webkitRelativePath?: string }).webkitRelativePath || sizeLabel(file.size)}{(file as File & { webkitRelativePath?: string }).webkitRelativePath ? ` · ${sizeLabel(file.size)}` : ''}</span></span><button type="button" disabled={!!progress && !progress.complete} aria-label={`حذف ${file.name}`} onClick={() => { const names = { ...(value.fileDisplayNames || {}) }; delete names[key]; const folderIds = { ...(value.fileFolderIds || {}) }; delete folderIds[key]; onChange({ ...value, files: value.files.filter(item => fileKey(item) !== key), fileDisplayNames: names, fileFolderIds: folderIds }); }} className="p-1.5 text-slate-400 hover:text-rose-600 disabled:opacity-40"><Trash2 className="h-4 w-4" /></button></div>
            <label className="mt-2 block text-[9px] font-bold text-slate-500">نام نمایشی فایل<Input aria-label={`نام نمایشی ${file.name}`} value={value.fileDisplayNames?.[key] ?? file.name} disabled={disabled || (!!progress && !progress.complete)} onChange={event => onChange({ ...value, fileDisplayNames: { ...(value.fileDisplayNames || {}), [key]: event.target.value } })} maxLength={255} className="mt-1 h-9 py-1.5 text-[11px]" /></label>
            {progress && <div className="mt-2" aria-live="polite"><div className="mb-1 flex items-center justify-between gap-2 text-[9px] font-bold text-slate-500"><span>{progress.complete ? 'بارگذاری کامل شد' : 'در حال بارگذاری'}</span><span>{percent.toLocaleString('fa-IR')}٪ · {megabytes(progress.loaded)} از {megabytes(progress.total)}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full transition-[width] ${progress.complete ? 'bg-emerald-500' : 'bg-indigo-600'}`} style={{ width: `${percent}%` }} /></div></div>}
          </div>;
        })}
        {value.texts.map(text => <div key={text.id} className="flex min-w-0 items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600"><FileText className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-[11px] font-black text-slate-700">{text.title}</span><span className="text-[9px] text-slate-400">یادداشت متنی · {richTextToPlainText(text.body).length.toLocaleString('fa-IR')} نویسه</span></span><button type="button" aria-label={`پیش‌نمایش ${text.title}`} onClick={() => setPreviewText(text)} className="p-1.5 text-slate-400 hover:text-violet-600"><Eye className="h-4 w-4" /></button><button type="button" aria-label={`ویرایش ${text.title}`} onClick={() => editText(text)} className="p-1.5 text-slate-400 hover:text-indigo-600"><Pencil className="h-4 w-4" /></button><button type="button" aria-label={`حذف ${text.title}`} onClick={() => onChange({ ...value, texts: value.texts.filter(item => item.id !== text.id) })} className="p-1.5 text-slate-400 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button></div>)}
        {value.assets.map(asset => <div key={asset.id} className="flex min-w-0 items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600"><Library className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-[11px] font-black text-slate-700">{asset.latest_file?.original_filename || asset.title}</span><span className="text-[9px] text-slate-400">{value.moveToContextFolder ? 'از مخزن · انتقال به پوشهٔ همین بخش' : 'از مخزن · بدون تکثیر'}</span></span><button type="button" aria-label={`حذف ${asset.title}`} onClick={() => onChange({ ...value, assets: value.assets.filter(item => item.id !== asset.id) })} className="p-1.5 text-slate-400 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button></div>)}
        {(value.tables || []).map(table => <div key={table.id} className="flex min-w-0 items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600"><TableProperties className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-[11px] font-black text-slate-700">{table.tableName}</span><span className="text-[9px] text-slate-400">{table.mode === 'create' ? `جدول جدید و ${(table.rows?.length || 1).toLocaleString('fa-IR')} ردیف` : table.mode === 'link' ? `${(table.rowIds?.length || 0).toLocaleString('fa-IR')} ردیف موجود، بدون ساختن ردیف تازه` : 'ردیف جدید در جدول موجود'} · {table.columns.length.toLocaleString('fa-IR')} ستون</span></span><button type="button" aria-label={`حذف ${table.tableName}`} onClick={() => onChange({ ...value, tables: (value.tables || []).filter(item => item.id !== table.id) })} className="p-1.5 text-slate-400 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button></div>)}
      </div>
    </div>}
    {folderPickerOpen && <FolderBrowserModal
      folders={folders}
      initialFolderId={value.folderId ? Number(value.folderId) : null}
      title="انتخاب محل ذخیره پیوست"
      onCreate={createFolder}
      onSelect={folderId => { onChange({ ...value, folderId: folderId ? String(folderId) : '' }); setFolderPickerOpen(false); }}
      onClose={() => setFolderPickerOpen(false)}
    />}
    {previewText && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={`پیش‌نمایش ${previewText.title}`}>
      <div className="flex max-h-[88dvh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-5 py-4"><div className="min-w-0"><h3 className="truncate text-sm font-black text-slate-900">{previewText.title}</h3><p className="mt-1 text-[10px] text-slate-500">پیش‌نمایش دارایی متنی پیش از ثبت</p></div><button type="button" onClick={() => setPreviewText(null)} aria-label="بستن پیش‌نمایش" className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button></header>
        <div className="min-h-0 flex-1 overflow-y-auto p-6"><RichTextContent html={previewText.body} emptyText="متن خالی است." /></div>
        <footer className="flex shrink-0 justify-end gap-2 border-t border-slate-200 px-5 py-3"><Button type="button" variant="secondary" onClick={() => { editText(previewText); setPreviewText(null); }}><Pencil className="h-4 w-4" />ویرایش متن</Button><Button type="button" onClick={() => setPreviewText(null)}>بستن</Button></footer>
      </div>
    </div>}
  </section>;
}
