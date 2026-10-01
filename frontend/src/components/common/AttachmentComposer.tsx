import React, { useEffect, useRef, useState } from 'react';
import { File, FileText, FolderOpen, Library, LoaderCircle, Paperclip, Plus, Search, TableProperties, Trash2, Upload } from 'lucide-react';
import { request, uploadRequest, type ApiResponse } from '../../api/client';
import { apiConfig } from '../../api/client';
import { useApp } from '../../context/AppContext';
import { Button, Input, Select, Textarea } from './Primitives';

export type AttachmentTextDraft = { id: string; title: string; body: string };
export type AttachmentLibraryAsset = {
  id: number;
  title: string;
  type?: 'file' | 'content';
  can_edit?: boolean;
  latest_file?: { original_filename?: string; file_size?: number; mime_type?: string } | null;
};
export type AttachmentTableColumn = { id: string; name: string; type?: 'text' | 'number' | 'date' | 'select'; required?: boolean; options?: string[] };
export type AttachmentTableDraft = {
  id: string;
  mode: 'create' | 'append';
  tableId?: number;
  tableName: string;
  columns: AttachmentTableColumn[];
  cells: Record<string, string>;
};
export type AttachmentDraft = {
  files: File[];
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
};
export type AttachmentRelations = {
  projectId?: string;
  taskId?: string;
  departmentId?: string;
  contentId?: string;
  contentBucket?: 'attachments' | 'outputs';
};

type Folder = { id: number; name: string; parent_id: number | null };
type AssetResponse = AttachmentLibraryAsset & { id: number };
type DataTableResponse = { id: number; name: string; columns?: AttachmentTableColumn[]; can_edit?: boolean };
type Mode = 'file' | 'text' | 'library' | 'table';

export const createEmptyAttachmentDraft = (): AttachmentDraft => ({ files: [], texts: [], assets: [], tables: [], folderId: '' });
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
    ['projectId', 'project_id'], ['taskId', 'task_id'], ['departmentId', 'department_id'], ['contentId', 'content_id'],
  ];
  for (const [source, target] of values) {
    const value = relations[source];
    if (!value || !/^\d+$/.test(value)) continue;
    if (body instanceof FormData) body.append(target, value);
    else body[target] = Number(value);
  }
  if (relations.contentBucket) {
    if (body instanceof FormData) body.append('content_bucket', relations.contentBucket);
    else body.content_bucket = relations.contentBucket;
  }
};

export async function persistAttachmentDraft(value: AttachmentDraft, relations: AttachmentRelations, subjectTitle: string): Promise<PersistedAttachment[]> {
  const saved: PersistedAttachment[] = [];
  for (const file of value.files) {
    const body = new FormData();
    body.append('file', file);
    body.append('title', file.name.slice(0, 255));
    body.append('description', `پیوست ${subjectTitle}`.slice(0, 5000));
    if (value.folderId) body.append('folder_id', value.folderId);
    appendRelations(body, relations);
    const key = fileKey(file);
    reportUploadProgress({ key, loaded: 0, total: file.size });
    const response = await uploadRequest<ApiResponse<AssetResponse>>('/dam/library', body, (loaded, total) => {
      reportUploadProgress({ key, loaded, total });
    });
    reportUploadProgress({ key, loaded: file.size, total: file.size, complete: true });
    saved.push({ assetId: response.data.id, name: response.data.latest_file?.original_filename || file.name, size: response.data.latest_file?.file_size ?? file.size, type: 'file', previewUrl: previewUrl(response.data.id) });
  }
  for (const text of value.texts) {
    const body: Record<string, unknown> = { title: text.title.trim().slice(0, 255), body: text.body.trim(), description: `پیوست متنی ${subjectTitle}`.slice(0, 5000) };
    if (value.folderId) body.folder_id = Number(value.folderId);
    appendRelations(body, relations);
    const response = await request<ApiResponse<AssetResponse>>('/dam/library', { method: 'POST', body });
    saved.push({ assetId: response.data.id, name: response.data.title, size: null, type: 'content', previewUrl: previewUrl(response.data.id) });
  }

  const relationEntries: Array<['project' | 'task' | 'department' | 'content', string | undefined]> = [
    ['project', relations.projectId], ['task', relations.taskId], ['department', relations.departmentId], ['content', relations.contentId],
  ];
  for (const asset of value.assets) {
    for (const [relatedType, relatedId] of relationEntries) {
      if (!relatedId || !/^\d+$/.test(relatedId)) continue;
      await request(`/dam/library/${asset.id}/relations`, { method: 'POST', body: { related_type: relatedType, related_id: Number(relatedId) } });
    }
    saved.push({ assetId: asset.id, name: asset.latest_file?.original_filename || asset.title, size: asset.latest_file?.file_size ?? null, type: asset.type || (asset.latest_file ? 'file' : 'content'), previewUrl: previewUrl(asset.id) });
  }
  for (const tableDraft of value.tables || []) {
    let tableId = tableDraft.tableId;
    let tableName = tableDraft.tableName;
    if (tableDraft.mode === 'create') {
      const created = await request<ApiResponse<DataTableResponse>>('/dam/data-tables', {
        method: 'POST',
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
    const rowBody: Record<string, unknown> = { cells: tableDraft.cells };
    if (relations.taskId && /^\d+$/.test(relations.taskId)) rowBody.task_id = Number(relations.taskId);
    if (relations.contentId && /^\d+$/.test(relations.contentId)) rowBody.content_id = Number(relations.contentId);
    await request(`/dam/data-tables/${tableId}/rows`, { method: 'POST', body: rowBody });
    saved.push({ assetId: tableId, dataTableId: tableId, name: `${tableName} — ردیف اطلاعات`, size: null, type: 'data_table', previewUrl: '' });
  }
  return saved;
}

export function AttachmentComposer({ value, onChange, disabled = false, title = 'ضمیمه‌ها' }: {
  value: AttachmentDraft;
  onChange: (value: AttachmentDraft) => void;
  disabled?: boolean;
  title?: string;
}) {
  const { hasPermission } = useApp();
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
  const [newColumnNames, setNewColumnNames] = useState('');
  const [tableCells, setTableCells] = useState<Record<string, string>>({});
  const fileInput = useRef<HTMLInputElement>(null);

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

  const parsedNewColumns: AttachmentTableColumn[] = newColumnNames.split(/[،,\n]/).map(name => name.trim()).filter(Boolean).slice(0, 20).map((name, index) => ({ id: `column_${index + 1}`, name, type: 'text' }));
  const activeTableColumns = tableOperation === 'create' ? parsedNewColumns : (selectedTable?.columns || []);
  const addTableDraft = () => {
    if (tableOperation === 'create' && !canUpload) { setError('برای ایجاد جدول جدید، مجوز بارگذاری دارایی لازم است.'); return; }
    if (tableOperation === 'create' && (!newTableName.trim() || parsedNewColumns.length === 0)) { setError('نام جدول و حداقل یک ستون را وارد کنید.'); return; }
    if (tableOperation === 'append' && (!selectedTable || selectedTable.can_edit === false)) { setError(selectedTable ? 'اجازه افزودن ردیف به این جدول را ندارید.' : 'یک جدول موجود را انتخاب کنید.'); return; }
    const missingRequired = activeTableColumns.find(column => column.required && !String(tableCells[column.id] || '').trim());
    if (missingRequired) { setError(`مقدار ستون «${missingRequired.name}» الزامی است.`); return; }
    const draft: AttachmentTableDraft = {
      id: crypto.randomUUID(),
      mode: tableOperation,
      tableId: tableOperation === 'append' ? selectedTable?.id : undefined,
      tableName: tableOperation === 'create' ? newTableName.trim() : selectedTable!.name,
      columns: activeTableColumns,
      cells: Object.fromEntries(activeTableColumns.map(column => [column.id, String(tableCells[column.id] || '').trim()])),
    };
    onChange({ ...value, tables: [...(value.tables || []), draft] });
    setTableCells({}); setError('');
    if (tableOperation === 'create') { setNewTableName(''); setNewColumnNames(''); }
  };

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const accepted: File[] = [];
    const existing = new Set(value.files.map(fileKey));
    for (const file of Array.from(files)) {
      if (file.size > 20 * 1024 * 1024) { setError(`فایل «${file.name}» بیشتر از ۲۰ مگابایت است.`); continue; }
      if (!existing.has(fileKey(file))) { accepted.push(file); existing.add(fileKey(file)); }
    }
    if (accepted.length) { setError(''); onChange({ ...value, files: [...value.files, ...accepted] }); }
    if (fileInput.current) fileInput.current.value = '';
  };

  const addText = () => {
    if (!draftTitle.trim() || !draftBody.trim()) { setError('برای پیوست متنی، عنوان و متن را کامل کنید.'); return; }
    onChange({ ...value, texts: [...value.texts, { id: crypto.randomUUID(), title: draftTitle.trim(), body: draftBody.trim() }] });
    setDraftTitle(''); setDraftBody(''); setError('');
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
          <Textarea value={draftBody} disabled={disabled || !canUpload} onChange={event => setDraftBody(event.target.value)} rows={5} maxLength={1000000} placeholder="متن یادداشت را وارد کنید…" className="resize-y leading-7" />
          <Button type="button" variant="secondary" disabled={disabled || !canUpload || !draftTitle.trim() || !draftBody.trim()} onClick={addText} className="text-xs"><Plus className="h-4 w-4" />افزودن به فهرست آماده</Button>
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
            <button type="button" disabled={disabled || !canViewLibrary} onClick={() => { setTableOperation('append'); setTableCells({}); setError(''); }} className={`flex-1 rounded-lg px-3 py-2 text-[11px] font-bold ${tableOperation === 'append' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-500'}`}>افزودن ردیف به جدول موجود</button>
            <button type="button" disabled={disabled || !canUpload} onClick={() => { setTableOperation('create'); setTableCells({}); setError(''); }} className={`flex-1 rounded-lg px-3 py-2 text-[11px] font-bold disabled:opacity-40 ${tableOperation === 'create' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-500'}`}>ساخت جدول جدید</button>
          </div>

          {tableOperation === 'create' ? <div className="space-y-3">
            <Input value={newTableName} disabled={disabled || !canUpload} onChange={event => setNewTableName(event.target.value)} maxLength={255} placeholder="نام جدول جدید" />
            <Textarea value={newColumnNames} disabled={disabled || !canUpload} onChange={event => { setNewColumnNames(event.target.value); setTableCells({}); }} rows={2} placeholder="نام ستون‌ها را با ویرگول جدا کنید؛ مثال: عنوان، تعداد، توضیحات" />
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

          {activeTableColumns.length > 0 && <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 sm:grid-cols-2">
            {activeTableColumns.map(column => <label key={column.id} className="space-y-1.5 text-[10px] font-bold text-slate-600"><span>{column.name}{column.required ? ' *' : ''}</span>
              {column.type === 'select' ? <Select value={tableCells[column.id] || ''} disabled={disabled || selectedTable?.can_edit === false} onChange={event => setTableCells(current => ({ ...current, [column.id]: event.target.value }))}><option value="">انتخاب کنید</option>{(column.options || []).map(option => <option key={option} value={option}>{option}</option>)}</Select> : <Input type={column.type === 'number' ? 'number' : column.type === 'date' ? 'date' : 'text'} value={tableCells[column.id] || ''} disabled={disabled || selectedTable?.can_edit === false} onChange={event => setTableCells(current => ({ ...current, [column.id]: event.target.value }))} />}
            </label>)}
          </div>}
          <Button type="button" variant="secondary" disabled={disabled || activeTableColumns.length === 0 || (tableOperation === 'append' && (!selectedTable || selectedTable.can_edit === false))} onClick={addTableDraft} className="text-xs"><Plus className="h-4 w-4" />{tableOperation === 'create' ? 'افزودن جدول و ردیف به فهرست آماده' : 'افزودن ردیف به فهرست آماده'}</Button>
        </div>}

        {canUpload && folders.length > 0 && (activeMode === 'file' || activeMode === 'text') && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5"><div className="flex items-center gap-2 text-[10px] font-bold text-slate-600"><FolderOpen className="h-4 w-4 text-slate-400" />محل ذخیره در مخزن</div><Select value={value.folderId} onChange={event => onChange({ ...value, folderId: event.target.value })} className="h-9 max-w-52 py-1 text-xs"><option value="">ریشه مخزن</option>{folders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</Select></div>}
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
          return <div key={fileKey(file)} className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2.5"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600"><File className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-[11px] font-black text-slate-700">{file.name}</span><span className="text-[9px] text-slate-400">فایل جدید · {sizeLabel(file.size)}</span></span><button type="button" disabled={!!progress && !progress.complete} aria-label={`حذف ${file.name}`} onClick={() => onChange({ ...value, files: value.files.filter(item => fileKey(item) !== fileKey(file)) })} className="p-1.5 text-slate-400 hover:text-rose-600 disabled:opacity-40"><Trash2 className="h-4 w-4" /></button></div>
            {progress && <div className="mt-2" aria-live="polite"><div className="mb-1 flex items-center justify-between gap-2 text-[9px] font-bold text-slate-500"><span>{progress.complete ? 'بارگذاری کامل شد' : 'در حال بارگذاری'}</span><span>{percent.toLocaleString('fa-IR')}٪ · {megabytes(progress.loaded)} از {megabytes(progress.total)}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full transition-[width] ${progress.complete ? 'bg-emerald-500' : 'bg-indigo-600'}`} style={{ width: `${percent}%` }} /></div></div>}
          </div>;
        })}
        {value.texts.map(text => <div key={text.id} className="flex min-w-0 items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600"><FileText className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-[11px] font-black text-slate-700">{text.title}</span><span className="text-[9px] text-slate-400">یادداشت متنی · {text.body.length.toLocaleString('fa-IR')} نویسه</span></span><button type="button" aria-label={`حذف ${text.title}`} onClick={() => onChange({ ...value, texts: value.texts.filter(item => item.id !== text.id) })} className="p-1.5 text-slate-400 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button></div>)}
        {value.assets.map(asset => <div key={asset.id} className="flex min-w-0 items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600"><Library className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-[11px] font-black text-slate-700">{asset.latest_file?.original_filename || asset.title}</span><span className="text-[9px] text-slate-400">از مخزن · بدون تکثیر</span></span><button type="button" aria-label={`حذف ${asset.title}`} onClick={() => onChange({ ...value, assets: value.assets.filter(item => item.id !== asset.id) })} className="p-1.5 text-slate-400 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button></div>)}
        {(value.tables || []).map(table => <div key={table.id} className="flex min-w-0 items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600"><TableProperties className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-[11px] font-black text-slate-700">{table.tableName}</span><span className="text-[9px] text-slate-400">{table.mode === 'create' ? 'جدول جدید و ردیف اول' : 'ردیف جدید در جدول موجود'} · {table.columns.length.toLocaleString('fa-IR')} ستون</span></span><button type="button" aria-label={`حذف ${table.tableName}`} onClick={() => onChange({ ...value, tables: (value.tables || []).filter(item => item.id !== table.id) })} className="p-1.5 text-slate-400 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button></div>)}
      </div>
    </div>}
  </section>;
}
