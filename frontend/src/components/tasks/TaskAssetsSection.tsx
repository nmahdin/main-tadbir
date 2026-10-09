import { resourceUrl } from '../../utils/resourceUrl';
import { useSearchParams } from 'react-router-dom';
import { Button, ErrorState, Modal } from '../common/Primitives';
import { Pagination } from '../common/WorkspacePatterns';
import { TextAssetActions } from '../common/TextAssetActions';
import { TextAssetViewer } from '../common/TextAssetViewer';
import type { PageResult } from '../../queries/workspacePages';
import { AttachmentComposer, attachmentDraftCount, createEmptyAttachmentDraft, persistAttachmentDraft } from '../common/AttachmentComposer';
import { readTaskAssetLink } from '../../utils/taskDeepLink';
import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Task } from '../../types';
import { request, apiConfig } from '../../api/client';
import { formatToJalaliNumber, toPersianDigits } from '../../utils/jalali';
import {
  Paperclip,
  Check,
  FileText,
  Download,
  Trash2,
  LoaderCircle,
  Image as ImageIcon,
  Film,
  Music,
  Archive,
  Table as TableIcon,
  Plus,
  Pencil,
  Link2Off,
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

interface TaskTableDetail {
  id: number;
  name: string;
  columns?: TableColumn[];
  rows?: TaskTableRow[];
  can_edit?: boolean;
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
  const { currentUser, pendingMutationKeys, deleteAttachment, notify, hasPermission } = useApp();
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

  const [loading, setLoading] = useState(false);
  const [attachmentDraft, setAttachmentDraft] = useState(createEmptyAttachmentDraft);
  const [attachmentSaving, setAttachmentSaving] = useState(false);
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
  const [tableViewer, setTableViewer] = useState<TaskTableDetail | null>(null);
  const [tableViewerLoading, setTableViewerLoading] = useState(false);
  const [viewerEditing, setViewerEditing] = useState<{ rowId: number; columnId: string; value: string } | null>(null);
  const [viewingText, setViewingText] = useState<RelatedAsset | null>(null);

  const sectionRef = useRef<HTMLDivElement>(null);
  const [assetForm, setAssetForm] = useState<string | null>(null);
  const closeAssetForm = () => {
    setAssetForm(null);
    setAttachmentDraft(createEmptyAttachmentDraft());
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id]);

  const saveAttachmentDraft = async () => {
    if (!numericTask || attachmentSaving || attachmentDraftCount(attachmentDraft) === 0) return;
    setAttachmentSaving(true);
    try {
      await persistAttachmentDraft(attachmentDraft, {
        taskId: task.id,
        projectId: numericProject ? task.projectId : undefined,
        contentId: isNumericId(task.contentId || undefined) ? task.contentId || undefined : undefined,
      }, task.title);
      await Promise.all([loadRelated(), loadRows()]);
      notify({ type: 'success', title: 'دارایی‌ها متصل شدند', message: 'موارد انتخاب‌شده با مسیر پیش‌فرض وظیفه ثبت شدند.' });
      closeAssetForm();
    } catch (error) {
      notify({ type: 'error', title: 'ثبت دارایی ناموفق بود', message: error instanceof Error ? error.message : undefined });
    } finally {
      setAttachmentSaving(false);
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

  const openTableViewer = async (tableId: number) => {
    setTableViewerLoading(true);
    setViewerEditing(null);
    try {
      const result = await request<{ data: TaskTableDetail }>(`/dam/data-tables/${tableId}?per_page=100`);
      setTableViewer(result.data);
    } catch (error) {
      notify({ type: 'error', title: 'دریافت جدول ناموفق بود', message: error instanceof Error ? error.message : undefined });
    } finally {
      setTableViewerLoading(false);
    }
  };

  const saveViewerCell = async () => {
    if (!tableViewer || !viewerEditing || !tableViewer.can_edit) return;
    const row = (tableViewer.rows || []).find(item => item.id === viewerEditing.rowId);
    if (!row) return;
    const cells = { ...(row.cells || {}), [viewerEditing.columnId]: viewerEditing.value };
    try {
      const result = await request<{ data: TaskTableRow }>(`/dam/data-tables/${tableViewer.id}/rows/${row.id}`, { method: 'PATCH', body: { cells } });
      setTableViewer(current => current ? { ...current, rows: (current.rows || []).map(item => item.id === row.id ? { ...item, ...result.data } : item) } : current);
      setRows(current => current.map(item => item.id === row.id ? { ...item, ...result.data } : item));
      setViewerEditing(null);
    } catch (error) {
      notify({ type: 'error', title: 'ذخیره سلول ناموفق بود', message: error instanceof Error ? error.message : undefined });
    }
  };

  const rowSummary = (row: TaskTableRow) => {
    const values = Object.values(row.cells || {}).filter(v => String(v).trim() !== '').slice(0, 3);
    return values.length ? values.join(' • ') : 'ردیف بدون مقدار';
  };

  const totalCount = task.attachments.length + (assetMeta?.total ?? related.length);

  return (
    <div ref={sectionRef} className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs space-y-3">
      {assetForm && numericTask && <Modal open onClose={closeAssetForm} title="افزودن دارایی" description={`مسیر پیش‌فرض: وظایف / ${toPersianDigits(task.id)}`} icon={<Paperclip className="h-5 w-5" />} busy={attachmentSaving} size="xl">
        <div className="max-h-[calc(88dvh-82px)] space-y-4 overflow-y-auto p-5">
          <AttachmentComposer value={attachmentDraft} onChange={setAttachmentDraft} disabled={attachmentSaving} title="دارایی‌های مرتبط با وظیفه" defaultFolderLabel={`وظایف / ${toPersianDigits(task.id)} (پیش‌فرض)`} />
          <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-200 bg-white py-3"><Button action="cancel" variant="secondary" disabled={attachmentSaving} onClick={closeAssetForm}>انصراف</Button><Button action="save" loading={attachmentSaving} disabled={attachmentDraftCount(attachmentDraft) === 0} onClick={() => void saveAttachmentDraft()}>ثبت و اتصال دارایی‌ها</Button></div>
        </div>
      </Modal>}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Paperclip className="w-4 h-4 text-indigo-600" />
          <h4 className="text-xs font-bold text-slate-900">
            دارایی‌های مرتبط ({toPersianDigits(totalCount)})
          </h4>
        </div>
        {numericTask && <Button type="button" onClick={() => setAssetForm('create')} disabled={attachmentSaving} className="text-xs"><Plus className="h-4 w-4" />افزودن دارایی</Button>}
      </div>


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
                <p className="font-bold text-slate-900 truncate">{asset.title}</p>
                <p className="text-[10px] text-slate-500">
                  {asset.type === 'content' ? 'متن' : formatSize(asset.latest_file?.file_size)} • {formatToJalaliNumber(asset.created_at)}
                  <span className="mr-1.5 px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-bold">مخزن مرکزی</span>
                </p>

              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {asset.type === 'content' && <TextAssetActions title={asset.title} html={asset.content_item?.content_body || ''} onView={() => setViewingText(asset)} canDownload={hasPermission('assets.download')} />}
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
              <TableIcon className="w-4 h-4 text-indigo-600" />
              <h4 className="text-xs font-bold text-slate-900">
                ردیف‌های جدول اطلاعات ({toPersianDigits(rowMeta?.total ?? rows.length)})
              </h4>
            </div>
            <Button type="button" variant="secondary" onClick={() => void openRowModal()} className="text-[11px]"><Plus className="w-3.5 h-3.5" />افزودن ردیف</Button>
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
              className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50/70 p-3 text-xs transition-colors hover:border-indigo-200 hover:bg-indigo-50/40"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <TableIcon className="w-4 h-4 text-indigo-600 shrink-0" />
                <div className="min-w-0">
                  <p className="font-bold text-slate-900 truncate">{rowSummary(row)}</p>
                  <p className="text-[10px] text-slate-500">
                    {row.data_table?.name || `جدول ${row.table_id}`}
                    {row.content ? ` • ${row.content.title}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button type="button" variant="secondary" onClick={() => void openTableViewer(row.table_id)} className="h-8 min-h-8 px-2 text-[10px]"><TableIcon className="h-3.5 w-3.5" />مشاهده جدول</Button>
                <button
                  onClick={() => void openRowModal(row)}
                  disabled={!row.can_edit} aria-label="ویرایش ردیف" title="ویرایش ردیف"
                  className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
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

      {viewingText && <TextAssetViewer open onClose={() => setViewingText(null)} title={viewingText.title} html={viewingText.content_item?.content_body || ''} canDownload={hasPermission('assets.download')} />}

      {(tableViewer || tableViewerLoading) && (
        <Modal open onClose={() => { setTableViewer(null); setViewerEditing(null); }} title={tableViewer?.name || 'مشاهده جدول'} description="نمای کامل جدول اطلاعات مرتبط با وظیفه" icon={<TableIcon className="h-5 w-5" />} size="xl">
          <div className="max-h-[76dvh] overflow-auto p-5">
            {tableViewerLoading && <div className="flex items-center justify-center gap-2 py-16 text-xs text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" />در حال دریافت جدول…</div>}
            {!tableViewerLoading && tableViewer && <table className="w-full min-w-[640px] border-collapse text-xs"><thead><tr className="bg-slate-50">{(tableViewer.columns || []).map(column => <th key={column.id} className="border border-slate-200 px-3 py-2 text-right font-black text-slate-700">{column.name}</th>)}</tr></thead><tbody>{(tableViewer.rows || []).map(row => <tr key={row.id} className="hover:bg-slate-50/70">{(tableViewer.columns || []).map(column => { const editing = viewerEditing?.rowId === row.id && viewerEditing.columnId === column.id; const value = row.cells?.[column.id] || ''; return <td key={column.id} className="border border-slate-200 p-1.5">{editing ? <div className="flex items-center gap-1"><input autoFocus value={viewerEditing.value} onChange={event => setViewerEditing(current => current ? { ...current, value: event.target.value } : current)} onKeyDown={event => { if (event.key === 'Enter') void saveViewerCell(); if (event.key === 'Escape') setViewerEditing(null); }} className="ui-input h-8 min-h-8 text-xs" /><button type="button" onClick={() => void saveViewerCell()} className="rounded-lg p-1.5 text-indigo-600 hover:bg-indigo-50"><Check className="h-4 w-4" /></button></div> : <button type="button" disabled={!tableViewer.can_edit} onClick={() => setViewerEditing({ rowId: row.id, columnId: column.id, value })} className="block min-h-8 w-full rounded-lg px-2 py-1.5 text-right text-slate-700 hover:bg-indigo-50 disabled:cursor-default disabled:hover:bg-transparent">{value || <span className="text-slate-300">—</span>}</button>}</td>; })}</tr>)}</tbody></table>}
            {!tableViewerLoading && tableViewer && !(tableViewer.rows || []).length && <p className="py-12 text-center text-xs text-slate-400">این جدول هنوز ردیفی ندارد.</p>}
            {tableViewer?.can_edit && <p className="mt-3 text-[10px] text-slate-500">برای ویرایش، روی هر سلول کلیک کنید و با Enter ذخیره کنید.</p>}
          </div>
        </Modal>
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
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs outline-none focus:border-indigo-400"
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
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs outline-none focus:border-indigo-400"
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
                      className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs outline-none focus:border-indigo-400"
                    />
                  )}
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3.5">
              <button
                data-button-action="cancel"
                onClick={() => { setRowModalOpen(false); setEditingRow(null); }}
                className="ui-form-action rounded-xl px-3.5 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100"
              >
                انصراف
              </button>
              <button
                data-button-action={editingRow ? 'save' : 'create'}
                onClick={() => void saveRow()}
                disabled={rowSaving || (!editingRow && !rowTableId)}
                className="ui-form-action rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
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
