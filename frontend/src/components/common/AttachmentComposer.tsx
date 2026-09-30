import React, { useEffect, useRef, useState } from 'react';
import { File, FileText, FolderOpen, Library, LoaderCircle, Paperclip, Plus, Search, Trash2, Upload } from 'lucide-react';
import { request, type ApiResponse } from '../../api/client';
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
export type AttachmentDraft = {
  files: File[];
  texts: AttachmentTextDraft[];
  assets: AttachmentLibraryAsset[];
  folderId: string;
};
export type PersistedAttachment = {
  assetId: number;
  name: string;
  size: number | null;
  type: 'file' | 'content';
  previewUrl: string;
};
export type AttachmentRelations = {
  projectId?: string;
  taskId?: string;
  departmentId?: string;
  contentId?: string;
};

type Folder = { id: number; name: string; parent_id: number | null };
type AssetResponse = AttachmentLibraryAsset & { id: number };
type Mode = 'file' | 'text' | 'library';

export const createEmptyAttachmentDraft = (): AttachmentDraft => ({ files: [], texts: [], assets: [], folderId: '' });
export const attachmentDraftCount = (value: AttachmentDraft) => value.files.length + value.texts.length + value.assets.length;

const previewUrl = (id: number) => `${apiConfig.baseUrl}/dam/library/${id}/preview`;
const fileKey = (file: File) => `${file.name}:${file.size}:${file.lastModified}`;
const sizeLabel = (bytes?: number | null) => {
  if (!bytes) return 'بدون حجم فایل';
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} مگابایت` : `${Math.max(1, Math.round(bytes / 1024))} کیلوبایت`;
};

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
    const response = await request<ApiResponse<AssetResponse>>('/dam/library', { method: 'POST', body });
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
  const [mode, setMode] = useState<Mode>('file');
  const activeMode: Mode = !canUpload && canBrowse ? 'library' : mode;
  const [folders, setFolders] = useState<Folder[]>([]);
  const [query, setQuery] = useState('');
  const [libraryItems, setLibraryItems] = useState<AttachmentLibraryAsset[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

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

  return <section className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4" aria-label={title}>
    <header className="flex flex-wrap items-center justify-between gap-2">
      <div><h3 className="flex items-center gap-2 text-xs font-black text-slate-800"><Paperclip className="h-4 w-4 text-indigo-600" />{title}</h3><p className="mt-1 text-[10px] text-slate-500">چند فایل، یادداشت متنی یا دارایی موجود را هم‌زمان انتخاب کنید.</p></div>
      {count > 0 && <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-[10px] font-bold text-indigo-700">{count.toLocaleString('fa-IR')} مورد آماده</span>}
    </header>

    <div className="grid grid-cols-3 gap-1 rounded-xl border border-slate-200 bg-white p-1" role="tablist" aria-label="قالب ضمیمه">
      {([
        ['file', 'فایل‌ها', Upload, canUpload], ['text', 'متن‌ها', FileText, canUpload], ['library', 'مخزن', Library, canBrowse],
      ] as const).map(([id, label, Icon, allowed]) => <button key={id} type="button" role="tab" aria-selected={activeMode === id} disabled={disabled || !allowed} onClick={() => { setMode(id); setError(''); }} className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-[11px] font-bold disabled:cursor-not-allowed disabled:opacity-40 ${activeMode === id ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}><Icon className="h-3.5 w-3.5" />{label}</button>)}
    </div>

    {activeMode === 'file' && <div className="space-y-2">
      <button type="button" disabled={disabled || !canUpload} onClick={() => fileInput.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-4 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40"><Upload className="h-4 w-4 text-indigo-600" />انتخاب چند فایل — حداکثر ۲۰ مگابایت برای هر فایل</button>
      <input ref={fileInput} hidden type="file" multiple onChange={event => addFiles(event.target.files)} />
      {value.files.length > 0 && <div className="grid gap-2 sm:grid-cols-2">{value.files.map(file => <div key={fileKey(file)} className="flex min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2"><File className="h-4 w-4 shrink-0 text-slate-400" /><div className="min-w-0 flex-1"><p className="truncate text-[11px] font-bold text-slate-700">{file.name}</p><p className="text-[9px] text-slate-400">{sizeLabel(file.size)}</p></div><button type="button" aria-label={`حذف ${file.name}`} onClick={() => onChange({ ...value, files: value.files.filter(item => fileKey(item) !== fileKey(file)) })} className="p-1 text-slate-400 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button></div>)}</div>}
    </div>}

    {activeMode === 'text' && <div className="space-y-2">
      <Input value={draftTitle} disabled={disabled || !canUpload} onChange={event => setDraftTitle(event.target.value)} maxLength={255} placeholder="عنوان یادداشت یا سند متنی" />
      <Textarea value={draftBody} disabled={disabled || !canUpload} onChange={event => setDraftBody(event.target.value)} rows={3} maxLength={1000000} placeholder="متن ضمیمه را وارد کنید..." />
      <Button type="button" variant="secondary" disabled={disabled || !canUpload || !draftTitle.trim() || !draftBody.trim()} onClick={addText} className="text-xs"><Plus className="h-3.5 w-3.5" />افزودن متن به فهرست</Button>
      {value.texts.length > 0 && <div className="space-y-2">{value.texts.map(text => <div key={text.id} className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2"><FileText className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" /><div className="min-w-0 flex-1"><p className="truncate text-[11px] font-bold text-slate-700">{text.title}</p><p className="mt-0.5 line-clamp-2 text-[10px] leading-5 text-slate-500">{text.body}</p></div><button type="button" aria-label={`حذف ${text.title}`} onClick={() => onChange({ ...value, texts: value.texts.filter(item => item.id !== text.id) })} className="p-1 text-slate-400 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button></div>)}</div>}
    </div>}

    {activeMode === 'library' && <div className="space-y-2">
      <div className="relative"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input value={query} disabled={disabled || !canBrowse} onChange={event => void searchLibrary(event.target.value)} className="pr-9" placeholder="جست‌وجو در مخزن مرکزی..." /></div>
      <div className="max-h-48 space-y-1.5 overflow-y-auto rounded-xl bg-white p-1.5">
        {libraryLoading && <p className="flex items-center justify-center gap-2 py-5 text-[11px] text-slate-400"><LoaderCircle className="h-3.5 w-3.5 animate-spin" />در حال دریافت دارایی‌ها…</p>}
        {!libraryLoading && libraryItems.map(asset => { const checked = selectedIds.has(asset.id); return <label key={asset.id} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-[11px] ${checked ? 'border-indigo-300 bg-indigo-50' : 'border-transparent hover:bg-slate-50'}`}><input type="checkbox" checked={checked} onChange={() => onChange({ ...value, assets: checked ? value.assets.filter(item => item.id !== asset.id) : [...value.assets, asset] })} /><FolderOpen className="h-3.5 w-3.5 shrink-0 text-indigo-500" /><span className="min-w-0 flex-1 truncate font-bold text-slate-700">{asset.latest_file?.original_filename || asset.title}</span><span className="shrink-0 text-[9px] text-slate-400">{sizeLabel(asset.latest_file?.file_size)}</span></label>; })}
        {!libraryLoading && !libraryItems.length && <p className="py-5 text-center text-[11px] text-slate-400">دارایی‌ای پیدا نشد.</p>}
      </div>
    </div>}

    {canUpload && folders.length > 0 && (activeMode === 'file' || activeMode === 'text') && <label className="block text-[10px] font-bold text-slate-600">پوشه مقصد در مخزن<Select value={value.folderId} onChange={event => onChange({ ...value, folderId: event.target.value })} className="mt-1.5 text-xs"><option value="">ریشه مخزن</option>{folders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</Select></label>}
    {!canUpload && !canBrowse && <p className="rounded-xl bg-amber-50 p-3 text-[11px] leading-6 text-amber-800">{canViewLibrary ? 'برای اتصال دارایی موجود، مجوز ویرایش اطلاعات دارایی لازم است.' : 'برای افزودن ضمیمه، مجوز مشاهده یا بارگذاری دارایی لازم است.'}</p>}
    {error && <p role="alert" className="text-[11px] leading-6 text-rose-700">{error}</p>}
  </section>;
}
