import React, { useEffect, useRef, useState } from 'react';
import { Check, Eye, File, FileText, FolderOpen, Library, LoaderCircle, Paperclip, Pencil, Plus, Search, TableProperties, Trash2, Upload, X } from 'lucide-react';
import { request, uploadRequest, type ApiResponse } from '../../api/client';
import { apiConfig } from '../../api/client';
import { useApp } from '../../context/AppContext';
import { Button, Input, Select } from './Primitives';
import { hasRichTextContent, RichTextContent, RichTextEditor, richTextToPlainText, sanitizeRichTextHtml } from './RichTextEditor';

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
  mode: 'create' | 'append';
  tableId?: number;
  tableName: string;
  columns: AttachmentTableColumn[];
  /** First row retained for backward compatibility with queued drafts. */
  cells: Record<string, string>;
  rows?: Array<Record<string, string>>;
};
export type AttachmentDraft = {
  files: File[];
  /** DAM title entered by the user; the browser File and stored filename stay unchanged. */
  fileDisplayNames?: Record<string, string>;
  texts: AttachmentTextDraft[];
  assets: AttachmentLibraryAsset[];
  tables: AttachmentTableDraft[];
  folderId: string;
};
export type PersistedAttachment = {
  assetId: number;
  name: string;
  size: number | null;
  type: 'file' | 'content' | 'data_table';
  previewUrl: string;
  dataTableId?: number;
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


type Folder = { id: number; name: string; parent_id: number | null };
type AssetResponse = AttachmentLibraryAsset & { id: number };
type DataTableResponse = { id: number; name: string; columns?: AttachmentTableColumn[]; can_edit?: boolean };
type Mode = 'file' | 'text' | 'library' | 'table';

export const createEmptyAttachmentDraft = (): AttachmentDraft => ({ files: [], fileDisplayNames: {}, texts: [], assets: [], tables: [], folderId: '' });
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
    body.append('duplicate_action', 'reuse');
    if (value.folderId) body.append('folder_id', value.folderId);
    appendRelations(body, relations);
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
    const item: PersistedAttachment = { assetId: asset.id, name: asset.latest_file?.original_filename || asset.title, size: asset.latest_file?.file_size ?? null, type: asset.type || (asset.latest_file ? 'file' : 'content'), previewUrl: previewUrl(asset.id), assetVersionId: asset.latest_version?.id, assetVersionNumber: asset.latest_version?.version_number };
    saved.push(item);
    options.onPersisted?.(item, { kind: 'asset', key: String(asset.id) });
  }
  for (const tableDraft of value.tables || []) {
    let tableId = tableDraft.tableId;
    let tableName = tableDraft.tableName;
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
    for (const cells of rows) {
      const rowBody: Record<string, unknown> = { cells };
      if (relations.taskId && /^\d+$/.test(relations.taskId)) rowBody.task_id = Number(relations.taskId);
      if (relations.contentId && /^\d+$/.test(relations.contentId)) rowBody.content_id = Number(relations.contentId);
      await request(`/dam/data-tables/${tableId}/rows`, { method: 'POST', body: rowBody, signal: options.signal });
    }
    const item: PersistedAttachment = { assetId: tableId, dataTableId: tableId, name: `${tableName} — ${rows.length.toLocaleString('fa-IR')} ردیف اطلاعات`, size: null, type: 'data_table', previewUrl: '' };
    saved.push(item);
    options.onPersisted?.(item, { kind: 'table', key: tableDraft.id });
  }
  return saved;
}

export function AttachmentComposer({ value, onChange, disabled = false, title = 'ضمیمه‌ها', defaultFolderLabel = 'ریشه مخزن' }: {
  value: AttachmentDraft;
  onChange: (value: AttachmentDraft) => void;
  disabled?: boolean;
  title?: string;
  defaultFolderLabel?: string;
}) {
  const { hasPermission, users } = useApp();
  const canUpload = hasPermission('assets.upload');
  const canViewLibrary = hasPermission('assets.view');
  const canBrowse = canViewLibrary && hasPermission('assets.edit_info');
  const canUseTables = canUpload || canViewLibrary;
  const [mode, setMode] = useState<Mode>('file');
  const activeMode: Mode = mode === 'file' && !canUpload ? (canBrowse ? 'library' : canUseTables ? 'table' : 'file') : mode;
  const [folders, setFolders] = useState<Folder[]>([]);
  const [query, setQuery] = useState('');
  const [libraryItems, setLibraryItems] = useState<AttachmentLibraryAsset[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState<AttachmentTextDraft | null>(null);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, UploadProgressDetail>>({});
  const [tableOperation, setTableOperation] = useState<'create' | 'append'>(canViewLibrary ? 'append' : 'create');
  const [dataTables, setDataTables] = useState<DataTableResponse[]>([]);
  const [dataTablesLoading, setDataTablesLoading] = useState(false);
  const [dataTablesLoaded, setDataTablesLoaded] = useState(false);
  const [selectedTable, setSelectedTable] = useState<DataTableResponse | null>(null);
  const [tableDetailLoading, setTableDetailLoading] = useState(false);
  const [newTableName, setNewTableName] = useState('');
  const [newColumns, setNewColumns] = useState<AttachmentTableColumn[]>([
    { id: crypto.randomUUID(), name: '', type: 'text', required: false },
  ]);
  const [tableCells, setTableCells] = useState<Record<string, string>>({});
  const [newTableRows, setNewTableRows] = useState<Array<{ id: string; cells: Record<string, string> }>>([]);
  const [editingStagedRowId, setEditingStagedRowId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
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

  useEffect(() => {
    const receiveProgress = (event: Event) => {
      const detail = (event as CustomEvent<UploadProgressDetail>).detail;
      setUploadProgress(previous => ({ ...previous, [detail.key]: detail }));
    };
    window.addEventListener(UPLOAD_PROGRESS_EVENT, receiveProgress);
    return () => window.removeEventListener(UPLOAD_PROGRESS_EVENT, receiveProgress);
  }, []);

  useEffect(() => {
    if (!canUpload) return;
    request<{ data: Folder[] }>('/dam/library/folders').then(response => setFolders(response.data || [])).catch(() => setFolders([]));
  }, [canUpload]);

  const searchLibrary = async (text: string) => {
    setQuery(text);
    setLibraryLoading(true);
    try {
      const params = new URLSearchParams({ per_page: '30' });
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

  const chooseDataTable = async (id: string) => {
    setSelectedTable(null); setTableCells({});
    if (!id) return;
    setTableDetailLoading(true); setError('');
    try {
      const response = await request<ApiResponse<DataTableResponse>>(`/dam/data-tables/${id}`);
      setSelectedTable(response.data);
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
  const activeTableColumns = tableOperation === 'create' ? parsedNewColumns : (selectedTable?.columns || []);
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
    if (tableOperation === 'create' && !canUpload) { setError('برای ایجاد جدول جدید، مجوز بارگذاری دارایی لازم است.'); return; }
    if (tableOperation === 'create' && (!newTableName.trim() || parsedNewColumns.length === 0)) { setError('نام جدول و حداقل یک ستون را وارد کنید.'); return; }
    if (tableOperation === 'append' && (!selectedTable || selectedTable.can_edit === false)) { setError(selectedTable ? 'اجازه افزودن ردیف به این جدول را ندارید.' : 'یک جدول موجود را انتخاب کنید.'); return; }
    if ((tableOperation === 'append' || rowHasContent(tableCells)) && !validateRow(tableCells)) return;
    const currentRow = rowFromCells(tableCells);
    const rows = tableOperation === 'create'
      ? [...newTableRows.map(row => row.cells), ...(rowHasContent(tableCells) ? [currentRow] : [])]
      : [currentRow];
    if (tableOperation === 'create' && rows.length === 0) { setError('حداقل یک ردیف برای جدول جدید وارد کنید.'); return; }
    const draft: AttachmentTableDraft = {
      id: crypto.randomUUID(),
      mode: tableOperation,
      tableId: tableOperation === 'append' ? selectedTable?.id : undefined,
      tableName: tableOperation === 'create' ? newTableName.trim() : selectedTable!.name,
      columns: activeTableColumns,
      cells: rows[0],
      rows,
    };
    onChange({ ...value, tables: [...(value.tables || []), draft] });
    setTableCells({}); setNewTableRows([]); setEditingStagedRowId(null); setError('');
    if (tableOperation === 'create') {
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
      onChange({
        ...value,
        files: [...value.files, ...accepted],
        fileDisplayNames: {
          ...(value.fileDisplayNames || {}),
          ...Object.fromEntries(accepted.map(file => [fileKey(file), file.name])),
        },
      });
    }
    if (fileInput.current) fileInput.current.value = '';
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
  ];

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
          <div><p className="text-xs font-black text-slate-800">دارایی‌های موجود</p><p className="mt-1 text-[10px] leading-5 text-slate-500">دارایی اصلی جابه‌جا یا تکثیر نمی‌شود؛ فقط ارتباط آن با این رکورد ثبت خواهد شد.</p></div>
          <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input value={query} disabled={disabled || !canBrowse} onChange={event => void searchLibrary(event.target.value)} className="pl-9" placeholder="جست‌وجو بر اساس نام دارایی…" /></div>
          <div className="max-h-64 space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/50 p-2">
            {libraryLoading && <p className="flex items-center justify-center gap-2 py-8 text-[11px] text-slate-400"><LoaderCircle className="h-4 w-4 animate-spin" />در حال دریافت دارایی‌ها…</p>}
            {!libraryLoading && libraryItems.map(asset => { const checked = selectedIds.has(asset.id); return <label key={asset.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border bg-white px-3 py-2.5 text-[11px] ${checked ? 'border-indigo-300' : 'border-slate-100 hover:border-slate-200'}`}><input type="checkbox" checked={checked} onChange={() => onChange({ ...value, assets: checked ? value.assets.filter(item => item.id !== asset.id) : [...value.assets, asset] })} /><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600"><FolderOpen className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block truncate font-black text-slate-700">{asset.latest_file?.original_filename || asset.title}</span><span className="mt-0.5 block text-[9px] text-slate-400">{asset.latest_file ? sizeLabel(asset.latest_file.file_size) : 'دارایی متنی'}</span></span><span className={`rounded-md px-2 py-1 text-[9px] font-bold ${checked ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>{checked ? 'انتخاب شد' : 'انتخاب'}</span></label>; })}
            {!libraryLoading && !libraryItems.length && <p className="py-8 text-center text-[11px] text-slate-400">دارایی‌ای پیدا نشد.</p>}
          </div>
        </div>}

        {activeMode === 'table' && <div className="space-y-4">
          <div><p className="text-xs font-black text-slate-800">جدول اطلاعات</p><p className="mt-1 text-[10px] leading-5 text-slate-500">یک جدول تازه همراه ردیف اول بسازید یا یک ردیف را به جدول موجود اضافه کنید.</p></div>
          <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1">
            <button type="button" disabled={disabled || !canViewLibrary} onClick={() => { setTableOperation('append'); setTableCells({}); setNewTableRows([]); setError(''); }} className={`flex-1 rounded-lg px-3 py-2 text-[11px] font-bold ${tableOperation === 'append' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-500'}`}>افزودن ردیف به جدول موجود</button>
            <button type="button" disabled={disabled || !canUpload} onClick={() => { setTableOperation('create'); setTableCells({}); setNewTableRows([]); setError(''); }} className={`flex-1 rounded-lg px-3 py-2 text-[11px] font-bold disabled:opacity-40 ${tableOperation === 'create' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-500'}`}>ساخت جدول جدید</button>
          </div>

          {tableOperation === 'create' ? <div className="space-y-3">
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

          {activeTableColumns.length > 0 && <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-black text-slate-700">{tableOperation === 'create' ? `ورود ردیف ${(newTableRows.length + 1).toLocaleString('fa-IR')}` : 'مقادیر ردیف جدید'}</p>
              {tableOperation === 'create' && newTableRows.length > 0 && <span className="rounded-md bg-emerald-100 px-2 py-1 text-[9px] font-bold text-emerald-700">{newTableRows.length.toLocaleString('fa-IR')} ردیف ثبت‌شده</span>}
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
            {tableOperation === 'create' && (
              <Button type="button" variant="ghost" disabled={disabled || !rowHasContent(tableCells)} onClick={stageNewTableRow} className="text-xs">
                {editingStagedRowId ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{editingStagedRowId ? 'ذخیره تغییرات این ردیف' : 'ثبت این ردیف و افزودن ردیف دیگر'}
              </Button>
            )}
          </div>}
          {tableOperation === 'create' && newTableRows.length > 0 && (
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
          <Button type="button" variant="secondary" disabled={disabled || activeTableColumns.length === 0 || (tableOperation === 'create' && newTableRows.length === 0 && !rowHasContent(tableCells)) || (tableOperation === 'append' && (!selectedTable || selectedTable.can_edit === false))} onClick={addTableDraft} className="text-xs"><Plus className="h-4 w-4" />{tableOperation === 'create' ? `افزودن جدول و ${(newTableRows.length + (rowHasContent(tableCells) ? 1 : 0)).toLocaleString('fa-IR')} ردیف به فهرست آماده` : 'افزودن ردیف به فهرست آماده'}</Button>
        </div>}

        {canUpload && (activeMode === 'file' || activeMode === 'text') && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5"><div className="flex items-center gap-2 text-[10px] font-bold text-slate-600"><FolderOpen className="h-4 w-4 text-slate-400" />محل ذخیره در مخزن</div><Select aria-label="محل ذخیره در مخزن" value={value.folderId} onChange={event => onChange({ ...value, folderId: event.target.value })} className="h-9 max-w-72 py-1 text-xs"><option value="">{defaultFolderLabel}</option>{folders.map(folder => <option key={folder.id} value={folder.id}>{folderPathName(folder.id)}</option>)}</Select></div>}
        {!canUpload && !canBrowse && !canUseTables && <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] leading-6 text-amber-800">برای افزودن ضمیمه، مجوز مشاهده یا بارگذاری دارایی لازم است.</p>}
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
            <div className="flex min-w-0 items-center gap-2.5"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600"><File className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-[11px] font-black text-slate-700">{value.fileDisplayNames?.[key] || file.name}</span><span className="text-[9px] text-slate-400">{sizeLabel(file.size)}</span></span><button type="button" disabled={!!progress && !progress.complete} aria-label={`حذف ${file.name}`} onClick={() => { const names = { ...(value.fileDisplayNames || {}) }; delete names[key]; onChange({ ...value, files: value.files.filter(item => fileKey(item) !== key), fileDisplayNames: names }); }} className="p-1.5 text-slate-400 hover:text-rose-600 disabled:opacity-40"><Trash2 className="h-4 w-4" /></button></div>
            <label className="mt-2 block text-[9px] font-bold text-slate-500">نام نمایشی فایل<Input aria-label={`نام نمایشی ${file.name}`} value={value.fileDisplayNames?.[key] ?? file.name} disabled={disabled || (!!progress && !progress.complete)} onChange={event => onChange({ ...value, fileDisplayNames: { ...(value.fileDisplayNames || {}), [key]: event.target.value } })} maxLength={255} className="mt-1 h-9 py-1.5 text-[11px]" /></label>
            {progress && <div className="mt-2" aria-live="polite"><div className="mb-1 flex items-center justify-between gap-2 text-[9px] font-bold text-slate-500"><span>{progress.complete ? 'بارگذاری کامل شد' : 'در حال بارگذاری'}</span><span>{percent.toLocaleString('fa-IR')}٪ · {megabytes(progress.loaded)} از {megabytes(progress.total)}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full transition-[width] ${progress.complete ? 'bg-emerald-500' : 'bg-indigo-600'}`} style={{ width: `${percent}%` }} /></div></div>}
          </div>;
        })}
        {value.texts.map(text => <div key={text.id} className="flex min-w-0 items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600"><FileText className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-[11px] font-black text-slate-700">{text.title}</span><span className="text-[9px] text-slate-400">یادداشت متنی · {richTextToPlainText(text.body).length.toLocaleString('fa-IR')} نویسه</span></span><button type="button" aria-label={`پیش‌نمایش ${text.title}`} onClick={() => setPreviewText(text)} className="p-1.5 text-slate-400 hover:text-violet-600"><Eye className="h-4 w-4" /></button><button type="button" aria-label={`ویرایش ${text.title}`} onClick={() => editText(text)} className="p-1.5 text-slate-400 hover:text-indigo-600"><Pencil className="h-4 w-4" /></button><button type="button" aria-label={`حذف ${text.title}`} onClick={() => onChange({ ...value, texts: value.texts.filter(item => item.id !== text.id) })} className="p-1.5 text-slate-400 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button></div>)}
        {value.assets.map(asset => <div key={asset.id} className="flex min-w-0 items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600"><Library className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-[11px] font-black text-slate-700">{asset.latest_file?.original_filename || asset.title}</span><span className="text-[9px] text-slate-400">از مخزن · بدون تکثیر</span></span><button type="button" aria-label={`حذف ${asset.title}`} onClick={() => onChange({ ...value, assets: value.assets.filter(item => item.id !== asset.id) })} className="p-1.5 text-slate-400 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button></div>)}
        {(value.tables || []).map(table => <div key={table.id} className="flex min-w-0 items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600"><TableProperties className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-[11px] font-black text-slate-700">{table.tableName}</span><span className="text-[9px] text-slate-400">{table.mode === 'create' ? `جدول جدید و ${(table.rows?.length || 1).toLocaleString('fa-IR')} ردیف` : 'ردیف جدید در جدول موجود'} · {table.columns.length.toLocaleString('fa-IR')} ستون</span></span><button type="button" aria-label={`حذف ${table.tableName}`} onClick={() => onChange({ ...value, tables: (value.tables || []).filter(item => item.id !== table.id) })} className="p-1.5 text-slate-400 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button></div>)}
      </div>
    </div>}
    {previewText && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={`پیش‌نمایش ${previewText.title}`}>
      <div className="flex max-h-[88dvh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-5 py-4"><div className="min-w-0"><h3 className="truncate text-sm font-black text-slate-900">{previewText.title}</h3><p className="mt-1 text-[10px] text-slate-500">پیش‌نمایش دارایی متنی پیش از ثبت</p></div><button type="button" onClick={() => setPreviewText(null)} aria-label="بستن پیش‌نمایش" className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button></header>
        <div className="min-h-0 flex-1 overflow-y-auto p-6"><RichTextContent html={previewText.body} emptyText="متن خالی است." /></div>
        <footer className="flex shrink-0 justify-end gap-2 border-t border-slate-200 px-5 py-3"><Button type="button" variant="secondary" onClick={() => { editText(previewText); setPreviewText(null); }}><Pencil className="h-4 w-4" />ویرایش متن</Button><Button type="button" onClick={() => setPreviewText(null)}>بستن</Button></footer>
      </div>
    </div>}
  </section>;
}
