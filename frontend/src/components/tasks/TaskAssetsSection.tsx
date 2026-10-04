import { resourceUrl } from '../../utils/resourceUrl';
import { useSearchParams } from 'react-router-dom';
import { ErrorState } from '../common/Primitives';
import { Pagination } from '../common/WorkspacePatterns';
import { RichTextContent } from '../common/RichTextEditor';
import type { PageResult } from '../../queries/workspacePages';
import { TaskAssetForm } from './TaskAssetForm';
import { readTaskAssetLink } from '../../utils/taskDeepLink';
import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Task } from '../../types';
import { request, apiConfig } from '../../api/client';
import { formatToJalaliNumber, toPersianDigits } from '../../utils/jalali';
import {
  Paperclip,
  Upload,
  FileText,
  Download,
  Trash2,
  LoaderCircle,
  Image as ImageIcon,
  Film,
  Music,
  Archive,
  FolderOpen,
  Table as TableIcon,
  Plus,
  Pencil,
  Link2Off,
  ExternalLink,
  X,
} from 'lucide-react';

interface RelatedAsset {
  type?: 'file' | 'content';
  content_item?: { content_body: string } | null;
  id: number;
  title: string;
  latest_file?: {
    original_filename: string;
    file_size: number;
    mime_type?: string;
  } | null;
  created_at: string;
}

interface TaskTableRow {
  can_edit?: boolean;
  id: number;
  table_id: number;
  cells?: Record<string, string>;
  content_id?: number | null;
  data_table?: { id: number; name: string } | null;
  content?: { id: number; title: string } | null;
  updated_at?: string;
}

interface TableColumn {
  id: string;
  name: string;
  type?: string;
  options?: string[];
}

const isNumericId = (id: string) => /^\d+$/.test(id);

const formatSize = (bytes = 0) => {
  if (!bytes) return '—';
  const units = ['بایت', 'کیلوبایت', 'مگابایت', 'گیگابایت'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / (1024 ** i)).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} ${units[i]}`;
};

const fileIcon = (name: string, mime?: string) => {
  const m = (mime || '').toLowerCase();
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (m.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext))
    return <ImageIcon className="w-4 h-4 text-emerald-600 shrink-0" />;
  if (m.startsWith('video/') || ['mp4', 'mov', 'avi', 'mkv'].includes(ext))
    return <Film className="w-4 h-4 text-violet-600 shrink-0" />;
  if (m.startsWith('audio/') || ['mp3', 'wav', 'ogg'].includes(ext))
    return <Music className="w-4 h-4 text-amber-600 shrink-0" />;
  if (['zip', 'rar', '7z'].includes(ext))
    return <Archive className="w-4 h-4 text-slate-500 shrink-0" />;
  return <FileText className="w-4 h-4 text-indigo-600 shrink-0" />;
};

/**
 * بخش یکپارچه فایل‌های تسک: فقط فایل‌های مرتبط با همین تسک را نشان می‌دهد
 * (هم ضمیمه‌های محلی و هم دارایی‌های مخزن مرکزی) بدون فیلترها و تنظیمات اضافی.
 */
export const TaskAssetsSection: React.FC<{ task: Task }> = ({ task }) => {
  const { currentUser, pendingMutationKeys, addAttachment, deleteAttachment, notify, setActiveView, hasPermission } = useApp();
  const [related, setRelated] = useState<RelatedAsset[]>([]);
  const [params,setParams]=useSearchParams();
  const pageOf=(key:string)=>{const n=Number(params.get(key));return Number.isSafeInteger(n)&&n>0&&n<=100000?n:1;};
  const assetPage=pageOf('task_assets_page'), rowPage=pageOf('task_rows_page');
  const changePage=(key:string,page:number)=>setParams(previous=>{const next=new URLSearchParams(previous);next.set(key,String(page));return next;});
  const [assetMeta,setAssetMeta]=useState<PageResult['meta']>();
  const [rowMeta,setRowMeta]=useState<PageResult['meta']>();
  const [assetError,setAssetError]=useState<unknown>();
  const [rowError,setRowError]=useState<unknown>();
  const assetSequence=useRef(0),rowSequence=useRef(0);

  const [folders, setFolders] = useState<{ id: number; name: string }[]>([]);
  const [folderId, setFolderId] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // ردیف‌های جدول اطلاعات متصل به تسک
  const [rows, setRows] = useState<TaskTableRow[]>([]);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [rowModalOpen, setRowModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<TaskTableRow | null>(null);
  const [tables, setTables] = useState<{ id: number; name: string }[]>([]);
  const [rowTableId, setRowTableId] = useState('');
  const [rowColumns, setRowColumns] = useState<TableColumn[]>([]);
  const [rowCells, setRowCells] = useState<Record<string, string>>({});
  const [rowSaving, setRowSaving] = useState(false);

  const sectionRef = useRef<HTMLDivElement>(null);
  const [assetForm, setAssetForm] = useState<string | null>(null);
  const closeAssetForm = () => {
    setAssetForm(null);
    const url = new URL(window.location.href);
    if (url.searchParams.get('task') === task.id) { url.searchParams.delete('asset'); window.history.replaceState(null, '', url); }
  };

  const numericTask = isNumericId(task.id);
  const numericProject = isNumericId(task.projectId);

  const loadRelated = async () => {
    if (!numericTask) return;
    const sequence=++assetSequence.current; setLoading(true);setAssetError(undefined);
    try {
      const result=await request<{data:RelatedAsset[];current_page?:number;last_page?:number;total?:number}>(`/dam/library?task_id=${task.id}&per_page=20&page=${assetPage}`);
      if(sequence!==assetSequence.current)return;
      setRelated(result.data||[]);setAssetMeta({current_page:result.current_page||assetPage,last_page:result.last_page||1,total:result.total??result.data.length});
      if(result.last_page && assetPage>result.last_page)changePage('task_assets_page',result.last_page);
    } catch(error) {if(sequence===assetSequence.current){setAssetError(error);setRelated([]);}}
    finally {if(sequence===assetSequence.current)setLoading(false);}
  };
  const loadRows = async () => {
    if (!numericTask) return;
    const sequence=++rowSequence.current;setRowsLoading(true);setRowError(undefined);
    try {
      const result=await request<{data:TaskTableRow[];meta:PageResult['meta']}>(`/dam/data-tables/rows-by-task?task_id=${task.id}&per_page=20&page=${rowPage}`);
      if(sequence!==rowSequence.current)return;
      setRows(result.data||[]);setRowMeta(result.meta);
      if(result.meta?.last_page && rowPage>result.meta.last_page)changePage('task_rows_page',result.meta.last_page);
    } catch(error) {if(sequence===rowSequence.current){setRowError(error);setRows([]);}}
    finally {if(sequence===rowSequence.current)setRowsLoading(false);}
  };
  useEffect(()=>{void loadRelated();return ()=>{assetSequence.current++;};},[task.id,assetPage]);
  useEffect(()=>{void loadRows();return ()=>{rowSequence.current++;};},[task.id,rowPage]);

  useEffect(() => {
    const kind = readTaskAssetLink(window.location.search, task.id);
    setAssetForm(kind === 'row' ? null : kind);
    if (kind === 'row') void openRowModal();
    if (kind) sectionRef.current?.scrollIntoView({ block: 'start' });
    if (numericTask) {
      request<{ data: { id: number; name: string }[] }>('/dam/library/folders')
        .then(result => setFolders(result.data || []))
        .catch(() => setFolders([]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const formattedSize = file.size > 1024 * 1024
          ? `${(file.size / (1024 * 1024)).toFixed(1)} مگابایت`
          : `${(file.size / 1024).toFixed(0)} کیلوبایت`;

        if (numericTask) {
          // آپلود در مخزن مرکزی با اتصال خودکار به همین تسک (و پروژه در صورت عددی بودن)
          const form = new FormData();
          form.append('file', file);
          form.append('title', file.name);
          form.append('task_id', task.id);
          if (numericProject && task.projectId && hasPermission('projects.view')) form.append('project_id', task.projectId);
          if (folderId) form.append('folder_id', folderId);
          await request('/dam/library', { method: 'POST', body: form });
        } else {
          // تسک محلی: ذخیره ضمیمه محلی
          const url = URL.createObjectURL(file);
          const assetType = file.type.startsWith('image/') ? 'image'
            : file.type.startsWith('video/') ? 'video'
            : file.type.startsWith('audio/') ? 'audio' : 'document';
          addAttachment(task.id, { name: file.name, size: formattedSize, type: assetType, url });
        }
      }
      if (numericTask) await loadRelated();
      notify({ type: 'success', title: 'فایل ثبت شد', message: 'فایل‌های انتخاب‌شده به این تسک متصل شدند.' });
    } catch (error) {
      notify({ type: 'error', title: 'آپلود ناموفق بود', message: error instanceof Error ? error.message : undefined });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteRelated = async (asset: RelatedAsset) => {
    if (!confirm(`اتصال «${asset.title}» از این تسک قطع شود؟ خود دارایی و سایر ارتباط‌ها حفظ می‌شوند.`)) return;
    try {
      await request(`/dam/library/${asset.id}/tasks/${task.id}`, { method: 'DELETE' });
      await loadRelated();
    } catch (error) {
      notify({ type: 'error', title: 'حذف ناموفق بود', message: error instanceof Error ? error.message : undefined });
    }
  };

  const openRowModal = async (row?: TaskTableRow) => {
    setEditingRow(row || null);
    setRowTableId(row ? String(row.table_id) : '');
    setRowColumns([]);
    setRowCells(row?.cells || {});
    setRowModalOpen(true);
    try {
      const result = await request<{ data: { id: number; name: string }[] }>('/dam/data-tables');
      setTables(result.data || []);
      const tableId = row ? row.table_id : null;
      if (tableId) {
        const detail = await request<{ data: { columns?: TableColumn[] } }>(`/dam/data-tables/${tableId}`);
        setRowColumns(detail.data.columns || []);
      }
    } catch {
      setTables([]);
    }
  };

  const handleRowTableChange = async (tableId: string) => {
    setRowTableId(tableId);
    setRowCells({});
    setRowColumns([]);
    if (!tableId) return;
    try {
      const detail = await request<{ data: { columns?: TableColumn[] } }>(`/dam/data-tables/${tableId}`);
      setRowColumns(detail.data.columns || []);
    } catch {
      notify({ type: 'error', title: 'دریافت ستون‌ها ناموفق بود', message: undefined });
    }
  };

  const saveRow = async () => {
    if (!rowTableId || rowSaving) return;
    setRowSaving(true);
    try {
      if (editingRow) {
        const result = await request<{ data: TaskTableRow }>(
          `/dam/data-tables/${editingRow.table_id}/rows/${editingRow.id}`,
          { method: 'PATCH', body: { cells: rowCells } }
        );
        setRows(prev => prev.map(r => r.id === editingRow.id ? { ...r, ...result.data } : r));
        notify({ type: 'success', title: 'ردیف ذخیره شد', message: 'تغییرات ردیف ثبت شد.' });
      } else {
        const result = await request<{ data: TaskTableRow }>(
          `/dam/data-tables/${rowTableId}/rows`,
          { method: 'POST', body: { cells: rowCells, task_id: Number(task.id) } }
        );
        setRows(prev => [result.data, ...prev]);
        notify({ type: 'success', title: 'ردیف اضافه شد', message: 'ردیف جدید به این تسک متصل شد.' });
      }
      setRowModalOpen(false);
      setEditingRow(null);
      await loadRows();
    } catch (error) {
      notify({ type: 'error', title: 'ذخیره ردیف ناموفق بود', message: error instanceof Error ? error.message : undefined });
    } finally {
      setRowSaving(false);
    }
  };

  const unlinkRow = async (row: TaskTableRow) => {
    if (!confirm('اتصال این ردیف به تسک قطع شود؟ (ردیف از جدول حذف نمی‌شود)')) return;
    try {
      await request(`/dam/data-tables/${row.table_id}/rows/${row.id}`, { method: 'PATCH', body: { task_id: null } });
      await loadRows();
      notify({ type: 'success', title: 'اتصال قطع شد', message: 'ردیف از این تسک جدا شد.' });
    } catch (error) {
      notify({ type: 'error', title: 'قطع اتصال ناموفق بود', message: error instanceof Error ? error.message : undefined });
    }
  };

  const rowSummary = (row: TaskTableRow) => {
    const values = Object.values(row.cells || {}).filter(v => String(v).trim() !== '').slice(0, 3);
    return values.length ? values.join(' • ') : 'ردیف بدون مقدار';
  };

  const totalCount = task.attachments.length + (assetMeta?.total ?? related.length);

  return (
    <div ref={sectionRef} className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-3">
      {assetForm && numericTask && <TaskAssetForm task={task} initialKind={assetForm} onClose={closeAssetForm} onSaved={() => { void loadRelated(); notify({ type: 'success', title: 'دارایی ثبت شد', message: 'دارایی به همین تسک متصل شد.' }); }} onRow={() => { closeAssetForm(); void openRowModal(); }}/>}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Paperclip className="w-4 h-4 text-indigo-600" />
          <h4 className="text-xs font-bold text-slate-900">
            دارایی‌های مرتبط ({toPersianDigits(totalCount)})
          </h4>
        </div>
        <div className="flex items-center gap-1.5">
          {numericTask && folders.length > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-slate-500">
              <FolderOpen className="w-3.5 h-3.5" />
              <select
                value={folderId}
                onChange={(e) => setFolderId(e.target.value)}
                className="max-w-28 px-1.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-bold text-slate-700 focus:outline-hidden cursor-pointer"
                title="پوشه مقصد در مخزن"
              >
                <option value="">ریشه مخزن</option>
                {folders.map(f => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </span>
          )}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1.5 cursor-pointer bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1.5 rounded-xl transition-all disabled:opacity-50"
          >
            {uploading ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            <span>{uploading ? 'در حال آپلود...' : 'افزودن فایل'}</span>
          </button>
        </div>
      </div>

      {numericTask && !assetForm && <button type="button" onClick={() => setAssetForm('create')} className="text-xs font-bold text-indigo-700 border border-indigo-200 rounded-xl px-3 py-2 flex items-center gap-2"><Plus size={14}/>ثبت دارایی متنی، فایل یا ردیف جدول</button>}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={(e) => void handleFiles(e.target.files)}
        className="hidden"
      />

      <div className="space-y-2">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-4 text-xs text-slate-400">
            <LoaderCircle className="w-4 h-4 animate-spin" />
            در حال دریافت فایل‌های مرتبط...
          </div>
        )}

        {/* فایل‌های مخزن مرکزی مرتبط با همین تسک */}
        {related.map(asset => (
          <div
            key={`dam-${asset.id}`}
            className="flex items-center justify-between p-3 bg-indigo-50/40 rounded-2xl border border-indigo-100 text-xs hover:bg-indigo-50/70 transition-all"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {fileIcon(asset.latest_file?.original_filename || asset.title, asset.latest_file?.mime_type)}
              <div className="min-w-0">
                <p className="font-bold text-slate-900 truncate">{asset.latest_file?.original_filename || asset.title}</p>
                <p className="text-[10px] text-slate-500">
                  {asset.type === 'content' ? 'متن' : formatSize(asset.latest_file?.file_size)} • {formatToJalaliNumber(asset.created_at)}
                  <span className="mr-1.5 px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-bold">مخزن مرکزی</span>
                </p>
                {asset.type === 'content' && <details className="mt-2"><summary className="cursor-pointer text-violet-700">نمایش متن</summary><div className="max-h-52 overflow-auto pt-2"><RichTextContent html={asset.content_item?.content_body} emptyText="متن خالی است." className="text-xs" /></div></details>}
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {asset.latest_file && hasPermission('assets.download') && <a
                href={`${apiConfig.baseUrl}/dam/library/${asset.id}/download`}
                className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs font-bold text-indigo-600 hover:bg-indigo-50 transition-colors flex items-center gap-1"
              >
                <Download className="w-3.5 h-3.5" />
                <span>دانلود</span>
              </a>}
              <button
                disabled={!hasPermission('assets.edit_info')}
                onClick={() => void handleDeleteRelated(asset)}
                aria-label={`قطع اتصال دارایی ${asset.title}`} title="قطع اتصال از تسک"
                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}

        {/* ضمیمه‌های محلی تسک */}
        {task.attachments.map(att => (
          <div
            key={att.id}
            className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-200/80 text-xs hover:bg-slate-100/70 transition-all"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {fileIcon(att.name)}
              <div className="min-w-0">
                <p className="font-bold text-slate-900 truncate">{att.name}</p>
                <p className="text-[10px] text-slate-500 font-mono">{toPersianDigits(att.size)} • ثبت: {formatToJalaliNumber(att.uploadDate)}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {hasPermission('assets.download') && resourceUrl(att.url) && (
                <a
                  href={resourceUrl(att.url)!}
                  download={att.name}
                  target="_blank"
                  rel="noreferrer"
                  className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs font-bold text-indigo-600 hover:bg-indigo-50 transition-colors flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>دانلود</span>
                </a>
              )}
              <button
                onClick={() => {
                  if (confirm(`آیا از حذف فایل «${att.name}» اطمینان دارید؟`)) {
                    deleteAttachment(task.id, att.id);
                  }
                }}
                disabled={pendingMutationKeys.includes(`tasks:${task.id}`) || !(task.assigneeId===currentUser.id || hasPermission('tasks.edit'))} aria-label={`حذف پیوست ${att.name}`} title="حذف پیوست"
                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}

        {!!assetError && <ErrorState error={assetError} onRetry={()=>void loadRelated()} />}
        {!assetError && !loading && totalCount === 0 && (
          <div className="text-center py-6 border border-dashed border-slate-200 rounded-2xl text-slate-400 text-xs">
            هیچ فایلی برای این وظیفه ثبت نشده است.
          </div>
        )}
      </div>

      {!assetError && numericTask && <section aria-label="صفحه‌بندی دارایی‌های تسک"><Pagination meta={assetMeta} busy={loading} onPage={page=>changePage('task_assets_page',page)} /></section>}
      {/* ردیف‌های جدول اطلاعات متصل به تسک */}
      {numericTask && (
        <div className="pt-3 mt-1 border-t border-slate-100 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TableIcon className="w-4 h-4 text-emerald-600" />
              <h4 className="text-xs font-bold text-slate-900">
                ردیف‌های جدول اطلاعات ({toPersianDigits(rowMeta?.total ?? rows.length)})
              </h4>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setActiveView('assets')}
                title="مدیریت کامل در مخزن دارایی‌ها"
                className="text-[11px] font-bold text-slate-500 hover:text-emerald-700 flex items-center gap-1 cursor-pointer px-2 py-1.5 rounded-xl hover:bg-emerald-50 transition-all"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>مخزن</span>
              </button>
              <button
                onClick={() => void openRowModal()}
                className="text-[11px] font-bold text-emerald-600 hover:text-emerald-800 flex items-center gap-1 cursor-pointer bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1.5 rounded-xl transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>افزودن ردیف</span>
              </button>
            </div>
          </div>

          {rowsLoading && (
            <div className="flex items-center justify-center gap-2 py-3 text-xs text-slate-400">
              <LoaderCircle className="w-4 h-4 animate-spin" />
              در حال دریافت ردیف‌ها...
            </div>
          )}

          {!!rowError && <ErrorState error={rowError} onRetry={()=>void loadRows()} />}
          {!rowError && !rowsLoading && rows.length === 0 && (
            <div className="text-center py-4 border border-dashed border-slate-200 rounded-2xl text-slate-400 text-[11px]">
              ردیفی از جدول اطلاعات به این تسک متصل نیست.
            </div>
          )}

          {rows.map(row => (
            <div
              key={`row-${row.id}`}
              className="flex items-center justify-between p-3 bg-emerald-50/40 rounded-2xl border border-emerald-100 text-xs hover:bg-emerald-50/70 transition-all"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <TableIcon className="w-4 h-4 text-emerald-600 shrink-0" />
                <div className="min-w-0">
                  <p className="font-bold text-slate-900 truncate">{rowSummary(row)}</p>
                  <p className="text-[10px] text-slate-500">
                    {row.data_table?.name || `جدول ${row.table_id}`}
                    {row.content ? ` • ${row.content.title}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => void openRowModal(row)}
                  disabled={!row.can_edit} aria-label="ویرایش ردیف" title="ویرایش ردیف"
                  className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => void unlinkRow(row)}
                  disabled={!row.can_edit} aria-label="قطع اتصال ردیف" title="قطع اتصال از تسک"
                  className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
                >
                  <Link2Off className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
          {!rowError && <section aria-label="صفحه‌بندی ردیف‌های تسک"><Pagination meta={rowMeta} busy={rowsLoading} onPage={page=>changePage('task_rows_page',page)} /></section>}
        </div>
      )}

      {rowModalOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
              <h2 className="text-sm font-black text-slate-900">
                {editingRow ? 'ویرایش ردیف' : 'افزودن ردیف به تسک'}
              </h2>
              <button onClick={() => { setRowModalOpen(false); setEditingRow(null); }} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[60vh] space-y-3 overflow-y-auto p-5">
              {!editingRow && (
                <label className="block text-[11px] font-bold text-slate-600">
                  جدول
                  <select
                    value={rowTableId}
                    onChange={e => void handleRowTableChange(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs outline-none focus:border-emerald-400"
                  >
                    <option value="">انتخاب جدول...</option>
                    {tables.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </label>
              )}
              {editingRow && (
                <p className="rounded-xl bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
                  جدول: {editingRow.data_table?.name || `#${editingRow.table_id}`}
                </p>
              )}
              {rowTableId !== '' && rowColumns.length === 0 && (
                <p className="text-[11px] text-slate-400">این جدول ستونی ندارد.</p>
              )}
              {rowColumns.map(col => (
                <label key={col.id} className="block text-[11px] font-bold text-slate-600">
                  {col.name}
                  {col.type === 'select' && col.options?.length ? (
                    <select
                      value={rowCells[col.id] || ''}
                      onChange={e => setRowCells(prev => ({ ...prev, [col.id]: e.target.value }))}
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs outline-none focus:border-emerald-400"
                    >
                      <option value="">— انتخاب —</option>
                      {col.options.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={rowCells[col.id] || ''}
                      onChange={e => setRowCells(prev => ({ ...prev, [col.id]: e.target.value }))}
                      type={col.type === 'number' ? 'number' : col.type === 'date' ? 'date' : 'text'}
                      className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs outline-none focus:border-emerald-400"
                    />
                  )}
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3.5">
              <button
                onClick={() => { setRowModalOpen(false); setEditingRow(null); }}
                className="rounded-xl px-3.5 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100"
              >
                انصراف
              </button>
              <button
                onClick={() => void saveRow()}
                disabled={rowSaving || (!editingRow && !rowTableId)}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {rowSaving ? 'در حال ذخیره...' : editingRow ? 'ذخیره تغییرات' : 'افزودن ردیف'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
