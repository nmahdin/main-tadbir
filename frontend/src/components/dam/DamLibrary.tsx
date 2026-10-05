import { readDamEntryLink } from '../../utils/damEntryLink';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive, ArrowDown, ArrowRight, ArrowUp, Check, ChevronDown, ChevronLeft, ChevronRight, Copy,
  Clock3, Download, Eye, File, FileText, Folder, FolderPlus, HardDrive, Image, Link2,
  LayoutGrid, List, LoaderCircle, LockKeyhole, MoreHorizontal,
  Move, Plus, Search, Shield, SlidersHorizontal,
  Table as TableIcon, Tag, Trash2, Upload, Users, X,
} from 'lucide-react';
import { ApiResponse, apiConfig, request } from '../../api/client';
import { useApp } from '../../context/AppContext';
import { DamDataTables } from './DamDataTables';
import { FolderBrowserModal } from './FolderBrowserModal';
import { hasRichTextContent, RichTextEditor, sanitizeRichTextHtml } from '../common/RichTextEditor';
import { TextAssetActions } from '../common/TextAssetActions';
import { TextAssetViewer } from '../common/TextAssetViewer';
import { Button } from '../common/Primitives';

type AssetType = 'file' | 'content';
type Context = { project_id?: number; task_id?: number; department_id?: number; content_id?: number; idea_id?: number; meeting_id?: number };
type DamFile = {
  id: number; original_filename: string; extension?: string; mime_type?: string;
  file_size: number; checksum?: string; is_latest: boolean;
  storage_disk?: string | null; storage_path?: string | null; stored_filename?: string | null;
};
type DamVersion = {
  id: number; version_number: number; created_at: string;
  change_description?: string; created_by?: number; file_id?: number;
  file?: DamFile | null; creator?: { id: number; name: string } | null;
};
type DamActivity = {
  id: number; action: string; metadata?: Record<string, unknown>; created_at: string;
  actor?: { id: number; name: string }; asset?: { id: number; title: string; type: AssetType };
};
type Asset = {
  id: number; type: AssetType; title: string; description?: string; status: string;
  confidentiality: string; created_at: string; updated_at: string; deleted_at?: string;
  latest_file?: DamFile; files?: DamFile[]; content_item?: { content_body: string; content_plain_text: string };
  versions?: DamVersion[]; activities?: DamActivity[]; tags?: { id: number; name: string }[];
  folder_id?: number | null; category_id?: number | null; department_id?: number | null;
  folder?: FolderRecord | null; category?: { id: number; name: string } | null;
  owner?: { id: number; name: string }; creator?: { id: number; name: string };
  latest_version?: DamVersion; versions_max_version_number?: number;
  relations?: { id: number; related_type: string; related_id: number; relation_type?: string; stage_id?: string; output_id?: string; asset_version_id?: number }[];
  used_in?: { type: string; id: number; label: string; relationRole: string; stageId?: string; stageLabel?: string; outputId?: string; assetVersionId?: number }[];
  used_in_count?: number;
  access_grants?: { projects?: number[]; users?: number[]; roles?: string[] } | null;
  storage_root?: string | null; preview_url?: string | null; download_url?: string | null;
};
type AccessGrantsSelection = { projects: string[]; users: string[]; roles: string[] };
type FolderRecord = { id: number; name: string; parent_id: number | null; department_id?: number | null; management_type?: 'system' | 'user'; system_key?: string | null };
type Category = { id: number; name: string; parent_id?: number | null };
type Page<T> = { data: T[]; current_page: number; last_page: number; total: number };
type Summary = { total: number; files: number; contents: number; storage_bytes: number; storage_limit_bytes: number; folders: number };
type QueueItem = { id: string; file: File; displayTitle: string; progress: number; error?: string; duplicate?: { assetId: number; title: string }; duplicateAction?: 'reuse' | 'new_version' | 'create' };
type ProjectOption = { id: string | number; name: string; status?: string };
type TaskOption = { id: string | number; title: string; projectId?: string | number };
type DepartmentOption = { id: string | number; name: string };
type ContentOption = { id: string | number; title: string };

const STATUS_LABELS: Record<string, string> = {
  draft: 'پیش‌نویس', review: 'در حال بررسی', approved: 'تأییدشده',
  published: 'منتشرشده', archived: 'بایگانی‌شده', rejected: 'ردشده',
};
const PRIVACY_LABELS: Record<string, string> = { public: 'عمومی', internal: 'داخلی', confidential: 'دسترسی مجوزدار' };
// عمومی: همه کاربران مجاز DAM و اعضای محتوای مرتبط؛ داخلی: فقط دارندگان مجوز DAM؛ مجوزدار: مالک/مدیر یا کمک‌هزینه صریح.
const ACCESS_OPTIONS = [
  { value: 'public', label: 'عمومی سازمان' },
  { value: 'internal', label: 'داخلی (فقط کاربران دارای مجوز مخزن)' },
  { value: 'confidential', label: 'دسترسی مجوزدار' },
] as const;
const ACTIVITY_LABELS: Record<string, string> = {
  created: 'ایجاد دارایی', updated: 'ویرایش مشخصات', moved: 'انتقال به پوشه', downloaded: 'دانلود فایل', previewed: 'پیش‌نمایش فایل',
  attached: 'اتصال به یک بخش', deleted: 'بایگانی', restored: 'بازیابی', version_created: 'ایجاد نسخه',
  version_restored: 'بازیابی نسخه', temporary_link_created: 'ساخت پیوند موقت دو ساعته', status_changed: 'تغییر وضعیت',
  confidentiality_changed: 'تغییر سطح محرمانگی', ownership_changed: 'تغییر مالک',
};
const formatSize = (bytes = 0) => {
  if (!bytes) return '۰ بایت';
  const units = ['بایت', 'کیلوبایت', 'مگابایت', 'گیگابایت', 'ترابایت'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / (1024 ** i)).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} ${units[i]}`;
};
const formatDate = (date?: string) => date
  ? new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date))
  : '—';
const fileKey = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const getError = (error: unknown) => error instanceof Error ? error.message : 'عملیات انجام نشد. دوباره تلاش کنید.';

/** Fetch once, report network progress, then save the already downloaded Blob. */
async function downloadAssetOnce(asset: Asset, onProgress: (percent: number, loaded: number) => void): Promise<void> {
  const response = await fetch(`${apiConfig.baseUrl}/dam/library/${asset.id}/download`, { credentials: 'include', headers: { Accept: 'application/octet-stream' } });
  if (!response.ok) throw new Error(`دانلود فایل ناموفق بود (${response.status.toLocaleString('fa-IR')}).`);
  const total = Number(response.headers.get('Content-Length') || asset.latest_file?.file_size || 0);
  const reader = response.body?.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) { chunks.push(value); loaded += value.byteLength; onProgress(total ? Math.min(100, Math.round(loaded * 100 / total)) : 0, loaded); }
    }
  } else {
    const buffer = new Uint8Array(await response.arrayBuffer());
    chunks.push(buffer); loaded = buffer.byteLength; onProgress(100, loaded);
  }
  const blob = new Blob(chunks, { type: response.headers.get('Content-Type') || asset.latest_file?.mime_type || 'application/octet-stream' });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = asset.latest_file?.original_filename || asset.title;
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
  onProgress(100, loaded);
}

type LibraryView = 'grid' | 'table' | 'list' | 'explorer';
type TableColumnKey = 'name' | 'type' | 'related' | 'status' | 'version' | 'owner' | 'department' | 'size' | 'updated' | 'createdBy' | 'createdAt';
const TABLE_COLUMNS: Array<{ id: TableColumnKey; label: string }> = [
  { id: 'name', label: 'نام' }, { id: 'type', label: 'نوع' }, { id: 'related', label: 'مرتبط با' },
  { id: 'status', label: 'وضعیت' }, { id: 'version', label: 'نسخه' }, { id: 'owner', label: 'مالک' },
  { id: 'department', label: 'دپارتمان' }, { id: 'size', label: 'حجم' }, { id: 'updated', label: 'آخرین تغییر' },
  { id: 'createdBy', label: 'ایجادکننده' }, { id: 'createdAt', label: 'تاریخ ایجاد' },
];
const DEFAULT_TABLE_COLUMNS: TableColumnKey[] = ['name', 'type', 'related', 'status', 'version', 'updated'];

/** Universal DAM entry point. Supplying context binds new assets to that entity. */
export const DamLibrary: React.FC<{
  context?: Context;
  initialType?: 'all' | AssetType;
  onAssetsChanged?: () => void;
}> = ({ context, initialType = 'all', onAssetsChanged }) => {
  const { hasPermission, damStatuses, detailAssetId, setDetailAssetId, users: workspaceUsers } = useApp();
  const canReadLinkedContent = Number.isSafeInteger(context?.content_id) && Number(context?.content_id) > 0;
  const statusOptions = useMemo(
    () => [...damStatuses].sort((a, b) => a.order - b.order),
    [damStatuses],
  );
  const damStatusLabel = useCallback(
    (id: string) => statusOptions.find(item => item.id === id)?.label || STATUS_LABELS[id] || id,
    [statusOptions],
  );
  const [items, setItems] = useState<Asset[]>([]);
  const [folders, setFolders] = useState<FolderRecord[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [tasks, setTasks] = useState<TaskOption[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [contentOptions, setContentOptions] = useState<ContentOption[]>([]);
  const [relationsLoaded, setRelationsLoaded] = useState(false);
  const [projectFilter, setProjectFilter] = useState('');
  const [taskFilter, setTaskFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [contentFilter, setContentFilter] = useState('');
  const [viewMode, setViewMode] = useState<LibraryView>(() => {
    const saved = window.localStorage.getItem('tadbir:dam:view');
    return saved === 'grid' || saved === 'table' || saved === 'list' || saved === 'explorer' ? saved : 'table';
  });
  const [visibleColumns, setVisibleColumns] = useState<TableColumnKey[]>(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem('tadbir:dam:columns') || 'null');
      return Array.isArray(saved) ? saved.filter(id => TABLE_COLUMNS.some(column => column.id === id)) : DEFAULT_TABLE_COLUMNS;
    } catch { return DEFAULT_TABLE_COLUMNS; }
  });
  const [columnPickerOpen, setColumnPickerOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [search, setSearch] = useState('');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [type, setType] = useState<'all' | AssetType>(initialType);
  const [status, setStatus] = useState('');
  const [confidentiality, setConfidentiality] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [createdFrom, setCreatedFrom] = useState('');
  const [createdTo, setCreatedTo] = useState('');
  const [orphanOnly, setOrphanOnly] = useState(false);
  const [categoryId, setCategoryId] = useState('');
  const [folderId, setFolderId] = useState<number | null>(() => {
    const raw = new URLSearchParams(window.location.search).get('dam_folder');
    return raw !== null && /^\d+$/.test(raw) ? Number(raw) : null;
  });
  const [sort, setSort] = useState<'updated_at' | 'title' | 'file_size'>('updated_at');
  const [direction, setDirection] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [activeView, setActiveView] = useState<'library' | 'tables'>('library');
  const [entryOpen, setEntryOpen] = useState(false);
  useEffect(() => {
    if (context || !readDamEntryLink(window.location.search) || !hasPermission('assets.view') || !hasPermission('assets.upload')) return;
    setEntryOpen(true);
    const url = new URL(window.location.href);
    url.searchParams.delete('dam_entry');
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);
  }, [context, hasPermission]);

  const [attachOpen, setAttachOpen] = useState(false);
  const [folderSaving, setFolderSaving] = useState(false);
  const [folderDialog, setFolderDialog] = useState<{ mode: 'create' | 'rename'; folder?: FolderRecord } | null>(null);
  const [folderName, setFolderName] = useState('');
  const [attachItems, setAttachItems] = useState<Asset[]>([]);
  const [attachSearch, setAttachSearch] = useState('');
  const [attachBusy, setAttachBusy] = useState(false);
  const [selected, setSelected] = useState<Asset | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [transferTarget, setTransferTarget] = useState<{ kind: 'assets'; ids: number[] } | { kind: 'asset'; asset: Asset } | { kind: 'folder'; folder: FolderRecord } | null>(null);
  const [transferBusy, setTransferBusy] = useState(false);
  const [detailBusy, setDetailBusy] = useState(false);
  const [refreshIndex, setRefreshIndex] = useState(0);

  useEffect(() => { window.localStorage.setItem('tadbir:dam:view', viewMode); }, [viewMode]);
  useEffect(() => { window.localStorage.setItem('tadbir:dam:columns', JSON.stringify(visibleColumns)); }, [visibleColumns]);
  useEffect(() => {
    if (context) return;
    const url = new URL(window.location.href);
    if (folderId === null) url.searchParams.delete('dam_folder');
    else url.searchParams.set('dam_folder', String(folderId));
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);
  }, [folderId, context]);

  useEffect(() => {
    if (status && statusOptions.length && !statusOptions.some(option => option.id === status)) {
      setStatus('');
      setPage(1);
    }
  }, [status, statusOptions]);

  const refreshTaxonomy = useCallback(async () => {
    if (!hasPermission('assets.view')) {
      setFolders([]);
      setCategories([]);
      return;
    }
    try {
      const [folderResult, categoryResult] = await Promise.all([
        request<{ data: FolderRecord[] }>('/dam/library/folders'),
        request<{ data: Category[] }>('/dam/library/categories'),
      ]);
      setFolders(folderResult.data);
      setCategories(categoryResult.data);
    } catch (e) {
      setError(getError(e));
    }
  }, [hasPermission]);

  const refreshSummary = useCallback(async () => {
    if (!hasPermission('assets.view')) {
      setSummary(null);
      return;
    }
    try {
      const result = await request<ApiResponse<Summary>>('/dam/library/summary');
      setSummary(result.data);
    } catch {
      // The list itself remains usable if the optional summary is unavailable.
    }
  }, [hasPermission]);

  useEffect(() => { void refreshTaxonomy(); void refreshSummary(); }, [refreshTaxonomy, refreshSummary]);

  useEffect(() => {
    // Relation selectors are not needed to render the library. Defer their four
    // potentially large lists until the user opens filters or the create form.
    if (relationsLoaded || (!showFilters && !entryOpen)) return;
    setRelationsLoaded(true);
    void Promise.allSettled([
      hasPermission('projects.view') ? request<Page<ProjectOption>>('/projects?per_page=100') : Promise.resolve({data:[]}),
      hasPermission('tasks.view') ? request<Page<TaskOption>>('/tasks?per_page=100') : Promise.resolve({data:[]}),
      hasPermission('departments.view') ? request<{ data: DepartmentOption[] }>('/departments') : Promise.resolve({data:[]}),
      request<Page<ContentOption>>('/contents?per_page=100'),
    ]).then(([projectResult, taskResult, departmentResult, contentResult]) => {
      if (projectResult.status === 'fulfilled') setProjects(projectResult.value.data || []);
      if (taskResult.status === 'fulfilled') setTasks(taskResult.value.data || []);
      if (departmentResult.status === 'fulfilled') setDepartments(departmentResult.value.data || []);
      if (contentResult.status === 'fulfilled') setContentOptions(contentResult.value.data || []);
    });
  }, [showFilters, entryOpen, relationsLoaded, hasPermission]);

  useEffect(() => {
    if (activeView === 'tables') {
      setLoading(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError('');
      const params = new URLSearchParams({ page: String(page), per_page: '20', sort, direction });
      if (search.trim()) params.set('search', search.trim());
      if (type !== 'all') params.set('type', type);
      if (status) params.set('status', status);
      if (confidentiality) params.set('confidentiality', confidentiality);
      if (ownerFilter) params.set('owner_id', ownerFilter);
      if (createdFrom) params.set('created_from', createdFrom);
      if (createdTo) params.set('created_to', createdTo);
      if (orphanOnly) params.set('orphan', '1');
      if (categoryId) params.set('category_id', categoryId);
      if (projectFilter) params.set('project_id', projectFilter);
      if (taskFilter) params.set('task_id', taskFilter);
      if (departmentFilter) params.set('department_id', departmentFilter);
      if (contentFilter) params.set('content_id', contentFilter);
      if (folderId !== null || viewMode === 'explorer') params.set('folder_id', String(folderId || 0));
      Object.entries(context || {}).forEach(([key, value]) => { if (value) params.set(key, String(value)); });
      request<Page<Asset>>(`/dam/library?${params}`)
        .then(result => {
          setItems(result.data);
          setTotal(result.total || 0);
          setLastPage(result.last_page || 1);
          setSelectedIds([]);
        })
        .catch(e => setError(getError(e)))
        .finally(() => setLoading(false));
    }, search.trim() ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [activeView, viewMode, search, type, status, confidentiality, ownerFilter, createdFrom, createdTo, orphanOnly, categoryId, projectFilter, taskFilter, departmentFilter, contentFilter, folderId, page, sort, direction,
    context?.project_id, context?.task_id, context?.department_id, context?.content_id, context?.idea_id, context?.meeting_id, refreshIndex]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const folderPath = useMemo(() => {
    const path: FolderRecord[] = [];
    let current = folders.find(folder => folder.id === folderId) || null;
    while (current) {
      path.unshift(current);
      current = current.parent_id ? folders.find(folder => folder.id === current?.parent_id) || null : null;
    }
    return path;
  }, [folders, folderId]);
  const childFolders = useMemo(() => folders.filter(folder => folder.parent_id === folderId), [folders, folderId]);

  /** مسیر کامل پوشه برای نمایش بدون ابهام (اصلاح مغایرت نام نمایشی با محل واقعی). */
  const folderPathName = useCallback((id: number | null | undefined): string => {
    if (id === null || id === undefined) return 'ریشه';
    const names: string[] = [];
    let current = folders.find(folder => folder.id === id) || null;
    while (current) {
      names.unshift(current.name);
      current = current.parent_id ? folders.find(folder => folder.id === current?.parent_id) || null : null;
    }
    return names.length ? names.join(' / ') : 'ریشه';
  }, [folders]);

  /** شناسه‌های خود پوشه و همه زیرپوشه‌ها (برای جلوگیری از انتقال چرخه‌ای). */
  const folderSubtreeIds = useCallback((id: number): Set<number> => {
    const ids = new Set<number>([id]);
    let grown = true;
    while (grown) {
      grown = false;
      folders.forEach(folder => {
        if (folder.parent_id !== null && ids.has(folder.parent_id) && !ids.has(folder.id)) {
          ids.add(folder.id);
          grown = true;
        }
      });
    }
    return ids;
  }, [folders]);


  const reload = () => {
    void refreshSummary();
    setRefreshIndex(value => value + 1);
    onAssetsChanged?.();
  };
  const openAsset = async (asset: Pick<Asset, 'id'>) => {
    setDetailBusy(true);
    setError('');
    try {
      const result = await request<ApiResponse<Asset>>(`/dam/library/${asset.id}`);
      setSelected(result.data);
    } catch (e) { setError(getError(e)); }
    finally { setDetailBusy(false); }
  };

  useEffect(() => {
    const assetId = Number(detailAssetId);
    if (context || !Number.isSafeInteger(assetId) || assetId <= 0) return;
    setDetailAssetId(null);
    void openAsset({ id: assetId });
  }, [detailAssetId, context?.project_id, context?.task_id, context?.department_id, context?.content_id, context?.idea_id, context?.meeting_id]);

  const createFolder = () => { setFolderName(''); setFolderDialog({ mode: 'create' }); };
  const moveFolder = (folder: FolderRecord) => setTransferTarget({ kind: 'folder', folder });

  const createCategory = async () => {
    const name = window.prompt('نام دسته‌بندی جدید را وارد کنید:')?.trim();
    if (!name) return;
    try {
      const result = await request<ApiResponse<Category>>('/dam/library/categories', { method: 'POST', body: { name } });
      setCategories(previous => [...previous, result.data]);
      setCategoryId(String(result.data.id));
      setToast(`دسته‌بندی «${name}» ساخته شد.`);
    } catch (e) { setError(getError(e)); }
  };

  const renameFolder = (folder: FolderRecord) => { setFolderName(folder.name); setFolderDialog({ mode: 'rename', folder }); };

  const deleteFolder = async (folder: FolderRecord) => {
    if (!window.confirm(`پوشه «${folder.name}» حذف شود؟ پوشه‌های دارای زیرپوشه یا دارایی حذف نمی‌شوند.`)) return;
    try {
      await request(`/dam/library/folders/${folder.id}`, { method: 'DELETE' });
      setFolders(previous => previous.filter(item => item.id !== folder.id));
      if (folderId === folder.id) { setFolderId(null); setPage(1); }
      setToast(`پوشه «${folder.name}» حذف شد.`);
    } catch (e) { setError(getError(e)); }
  };

  const saveFolder = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = folderName.trim();
    if (!name || !folderDialog || folderSaving) return;
    setFolderSaving(true);
    try {
      if (folderDialog.mode === 'rename' && folderDialog.folder) {
        const result = await request<ApiResponse<FolderRecord>>(`/dam/library/folders/${folderDialog.folder.id}`, { method: 'PATCH', body: { name } });
        setFolders(previous => previous.map(item => item.id === result.data.id ? result.data : item));
        setToast('نام پوشه تغییر کرد.');
      } else {
        const result = await request<ApiResponse<FolderRecord>>('/dam/library/folders', {
          method: 'POST', body: { name, parent_id: folderId || null, department_id: context?.department_id || null },
        });
        setFolders(previous => [...previous, result.data]);
        setToast(`پوشه «${name}» ساخته شد.`);
      }
      setFolderDialog(null);
    } catch (e) { setError(getError(e)); } finally { setFolderSaving(false); }
  };

  const archiveSelected = async () => {
    if (!selectedIds.length || !window.confirm(`آیا ${selectedIds.length} دارایی انتخاب‌شده بایگانی شوند؟`)) return;
    try {
      await request('/dam/library/bulk/archive', { method: 'POST', body: { ids: selectedIds } });
      setToast(`${selectedIds.length} دارایی بایگانی شد.`);
      setSelectedIds([]);
      setPage(1);
      reload();
    } catch (e) { setError(getError(e)); }
  };

  const createFolderInBrowser = async (name: string, parentId: number | null) => {
    const result = await request<ApiResponse<FolderRecord>>('/dam/library/folders', {
      method: 'POST', body: { name, parent_id: parentId, department_id: context?.department_id || null },
    });
    setFolders(previous => [...previous, result.data]);
    return result.data;
  };
  const completeTransfer = async (targetFolderId: number | null) => {
    if (!transferTarget || transferBusy) return;
    setTransferBusy(true);
    try {
      if (transferTarget.kind === 'folder') {
        const result = await request<ApiResponse<FolderRecord>>(`/dam/library/folders/${transferTarget.folder.id}`, { method: 'PATCH', body: { parent_id: targetFolderId } });
        setFolders(previous => previous.map(item => item.id === result.data.id ? result.data : item));
        setToast(`پوشه «${transferTarget.folder.name}» منتقل شد.`);
      } else if (transferTarget.kind === 'asset') {
        const result = await request<ApiResponse<Asset>>(`/dam/library/${transferTarget.asset.id}`, { method: 'PATCH', body: { folder_id: targetFolderId } });
        setSelected(result.data); reload();
        setToast('دارایی به پوشه انتخاب‌شده منتقل شد.');
      } else {
        await request('/dam/library/bulk/move', { method: 'POST', body: { ids: transferTarget.ids, folder_id: targetFolderId } });
        setToast(`${transferTarget.ids.length.toLocaleString('fa-IR')} دارایی به پوشه انتخاب‌شده منتقل شد.`);
        setSelectedIds([]);
        setPage(1);
        reload();
      }
      setTransferTarget(null);
    } catch (e) { setError(getError(e)); }
    finally { setTransferBusy(false); }
  };

  const tagSelected = async () => {
    if (!selectedIds.length) return;
    const raw = window.prompt('برچسب‌ها را با ویرگول جدا کنید:')?.trim();
    if (!raw) return;
    const tags = raw.split(/[,،]/).map(tag => tag.trim()).filter(Boolean);
    try {
      await request('/dam/library/bulk/update', { method: 'POST', body: { ids: selectedIds, tags } });
      setToast('برچسب‌ها پس از تأیید سرور به دارایی‌های انتخاب‌شده افزوده شد.');
      setSelectedIds([]); reload();
    } catch (e) { setError(getError(e)); }
  };

  const statusSelected = async () => {
    if (!selectedIds.length) return;
    const next = window.prompt(`شناسه وضعیت جدید (${statusOptions.map(option => option.id).join('، ')}):`)?.trim();
    if (!next) return;
    try {
      await request('/dam/library/bulk/update', { method: 'POST', body: { ids: selectedIds, status: next } });
      setToast('وضعیت دارایی‌های انتخاب‌شده پس از تأیید سرور تغییر کرد.');
      setSelectedIds([]); reload();
    } catch (e) { setError(getError(e)); }
  };

  const openAttachExisting = async () => {
    setAttachOpen(true); setAttachBusy(true); setAttachSearch('');
    try {
      const result = await request<Page<Asset>>('/dam/library?per_page=20');
      setAttachItems(result.data);
    } catch (e) { setError(getError(e)); setAttachOpen(false); }
    finally { setAttachBusy(false); }
  };

  const searchAttachExisting = async (search: string) => {
    setAttachSearch(search); setAttachBusy(true);
    try {
      const params = new URLSearchParams({ per_page: '20' });
      if (search.trim()) params.set('search', search.trim());
      const result = await request<Page<Asset>>(`/dam/library?${params}`);
      setAttachItems(result.data);
    } catch (e) { setError(getError(e)); }
    finally { setAttachBusy(false); }
  };

  const attachExisting = async (asset: Asset) => {
    const relations: [string, number][] = [];
    if (context?.project_id) relations.push(['project', context.project_id]);
    if (context?.task_id) relations.push(['task', context.task_id]);
    if (context?.department_id) relations.push(['department', context.department_id]);
    if (context?.content_id) relations.push(['content', context.content_id]);
    if (context?.idea_id) relations.push(['idea', context.idea_id]);
    if (context?.meeting_id) relations.push(['meeting', context.meeting_id]);
    if (!relations.length) return;
    setAttachBusy(true);
    try {
      for (const [related_type, related_id] of relations) {
        await request(`/dam/library/${asset.id}/relations`, { method: 'POST', body: { related_type, related_id } });
      }
      setAttachOpen(false);
      setToast(`«${asset.title}» بدون آپلود مجدد متصل شد.`);
      reload();
    } catch (e) { setError(getError(e)); }
    finally { setAttachBusy(false); }
  };

  const updateAsset = async (asset: Asset, changes: Record<string, unknown>) => {
    try {
      const result = await request<ApiResponse<Asset>>(`/dam/library/${asset.id}`, { method: 'PATCH', body: changes });
      setSelected(result.data);
      setItems(previous => previous.map(item => item.id === asset.id ? { ...item, ...result.data } : item));
      setToast('تغییرات ذخیره شد.');
      reload();
    } catch (e) { setError(getError(e)); }
  };

  const restoreVersion = async (asset: Asset, version: DamVersion) => {
    if (!window.confirm(`نسخه ${version.version_number} بازیابی شود؟ بازیابی به‌عنوان نسخه جدید ثبت خواهد شد.`)) return;
    try {
      const result = await request<ApiResponse<Asset>>(`/dam/library/${asset.id}/versions/${version.version_number}/restore`, { method: 'POST' });
      setSelected(result.data);
      setToast(`نسخه ${version.version_number} بازیابی شد.`);
      reload();
    } catch (e) { setError(getError(e)); }
  };

  const deleteAsset = async (asset: Asset) => {
    if (!window.confirm(`«${asset.title}» به سطل بایگانی منتقل شود؟`)) return;
    try {
      await request(`/dam/library/${asset.id}`, { method: 'DELETE' });
      setSelected(null);
      setToast('دارایی بایگانی شد. فایل نسخه‌ها حذف نشده است.');
      reload();
    } catch (e) { setError(getError(e)); }
  };

  return (
    <section dir="rtl" className="space-y-5 text-right">
      <header className="flex flex-col gap-4 rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-md shadow-indigo-200"><HardDrive className="h-6 w-6" /></div>
          <div>
            <p className="mb-0.5 text-[11px] font-bold text-indigo-600">فضای کاری تدبیر / مخزن مرکزی</p>
            <h1 className="text-lg font-black text-slate-900 sm:text-xl">مدیریت دارایی‌های دیجیتال</h1>
            <p className="mt-1 text-xs text-slate-500">فایل‌ها، اسناد و محتواهای سازمان را در یک مخزن امن مدیریت کنید.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {context && hasPermission('assets.edit_info') && <Button variant="secondary" onClick={() => void openAttachExisting()} className="text-xs text-indigo-700"><Plus className="h-4 w-4" />اتصال دارایی موجود</Button>}
          {hasPermission('assets.upload') && <Button action="create" onClick={() => setEntryOpen(true)} className="text-xs"><Plus className="h-4 w-4" />افزودن دارایی جدید</Button>}
          {hasPermission('assets.upload') && <Button action="create" variant="secondary" onClick={createFolder} className="text-xs"><FolderPlus className="h-4 w-4 text-amber-500" />پوشه جدید</Button>}
        </div>
      </header>

      {!context && viewMode !== 'explorer' && <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric icon={<File className="h-4 w-4" />} label="کل دارایی‌ها" value={summary?.total} color="indigo" />
          <Metric icon={<Image className="h-4 w-4" />} label="فایل‌ها" value={summary?.files} color="blue" />
          <Metric icon={<FileText className="h-4 w-4" />} label="محتوای متنی" value={summary?.contents} color="violet" />
          <Metric icon={<HardDrive className="h-4 w-4" />} label="فضای مصرف‌شده" value={summary ? formatSize(summary.storage_bytes) : '—'} color="amber" />
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-3 text-xs font-bold"><span className="text-slate-700">فضای مخزن مرکزی</span><span className="text-slate-500">{summary ? `${formatSize(summary.storage_bytes)} از ${formatSize(summary.storage_limit_bytes)}` : 'در حال محاسبه…'}</span></div>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-label="فضای مصرف‌شده مخزن" aria-valuemin={0} aria-valuemax={100} aria-valuenow={summary?.storage_limit_bytes ? Math.min(100, Math.round(summary.storage_bytes / summary.storage_limit_bytes * 100)) : 0}><div className="h-full rounded-full bg-amber-500 transition-[width]" style={{ width: `${summary?.storage_limit_bytes ? Math.min(100, summary.storage_bytes / summary.storage_limit_bytes * 100) : 0}%` }} /></div>
        </div>
      </div>}

      {context && <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-indigo-100 bg-indigo-50/70 px-4 py-3 text-xs text-indigo-900">
        <Shield className="h-4 w-4 text-indigo-600" /><span className="font-bold">ثبت در بستر فعلی</span>
        {context.project_id && <span className="rounded-full bg-white px-2.5 py-1">پروژه #{context.project_id}</span>}
        {context.task_id && <span className="rounded-full bg-white px-2.5 py-1">وظیفه #{context.task_id}</span>}
        {context.department_id && <span className="rounded-full bg-white px-2.5 py-1">دپارتمان #{context.department_id}</span>}
        {context.content_id && <span className="rounded-full bg-white px-2.5 py-1">محتوا #{context.content_id}</span>}
        {context.idea_id && <span className="rounded-full bg-white px-2.5 py-1">ایده #{context.idea_id}</span>}
        {context.meeting_id && <span className="rounded-full bg-white px-2.5 py-1">جلسه #{context.meeting_id}</span>}
        <span className="text-indigo-700">ارتباط هنگام ثبت به‌صورت خودکار اعمال می‌شود.</span>
      </div>}

      {viewMode === 'explorer' && activeView === 'library' ? <section data-dam-mode="file-manager" className="min-h-[72dvh] bg-slate-100/80 p-3 sm:p-5">
        <header className="border-b border-slate-200 bg-white p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <button type="button" disabled={folderId === null} onClick={() => { const current = folders.find(folder => folder.id === folderId); setFolderId(current?.parent_id ?? null); setPage(1); }} aria-label="بازگشت به پوشه بالاتر" title="بازگشت به پوشه بالاتر" className="ui-button ui-button-secondary ui-icon-button disabled:opacity-40"><ArrowRight className="h-4 w-4" /></button>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600"><Folder className="h-5 w-5" /></span>
              <div className="min-w-0"><h2 className="text-sm font-black text-slate-900">مدیریت فایل‌های مخزن</h2><p className="mt-1 truncate text-[10px] text-slate-500">نمای مستقل پوشه‌ها و دارایی‌ها</p></div>
            </div>
            <Button variant="secondary" onClick={() => { setViewMode('table'); setFolderId(null); setPage(1); }} className="text-xs"><TableIcon className="h-4 w-4" />بازگشت به کتابخانه</Button>
          </div>
          <nav aria-label="مسیر پوشه" className="mt-4 flex min-w-0 flex-wrap items-center gap-1 rounded-xl bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
            <button type="button" onClick={() => { setFolderId(null); setPage(1); }} className="font-bold text-indigo-700 hover:text-indigo-900">ریشه مخزن</button>
            {folderPath.map(folder => <React.Fragment key={folder.id}><ChevronLeft className="h-3.5 w-3.5 shrink-0" /><button type="button" onClick={() => { setFolderId(folder.id); setPage(1); }} className="max-w-40 truncate font-bold text-slate-700 hover:text-indigo-700">{folder.name}</button></React.Fragment>)}
            <span className="mr-auto shrink-0 text-slate-400">{childFolders.length.toLocaleString('fa-IR')} پوشه · {total.toLocaleString('fa-IR')} دارایی</span>
          </nav>
          <div className="mt-3 grid gap-2 md:grid-cols-[minmax(220px,1fr)_160px_180px_180px]">
            <label className="relative"><Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="جست‌وجو در همین پوشه" className="ui-input pr-9 text-xs" /></label>
            <select aria-label="فیلتر نوع دارایی" value={type} onChange={event => { setType(event.target.value as typeof type); setPage(1); }} className="ui-input text-xs"><option value="all">همه نوع‌ها</option><option value="file">فایل‌ها</option><option value="content">محتوای متنی</option></select>
            <select aria-label="فیلتر وضعیت دارایی" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }} className="ui-input text-xs"><option value="">همه وضعیت‌ها</option>{(statusOptions.length ? statusOptions.map(item => ({ value: item.id, label: item.label })) : Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
            <div className="flex items-center gap-1"><select aria-label="مرتب‌سازی فایل‌ها" value={sort} onChange={event => { setSort(event.target.value as typeof sort); setPage(1); }} className="ui-input min-w-0 flex-1 text-xs"><option value="updated_at">آخرین تغییر</option><option value="title">نام</option><option value="file_size">حجم</option></select><button type="button" onClick={() => setDirection(current => current === 'asc' ? 'desc' : 'asc')} aria-label="تغییر جهت مرتب‌سازی" className="ui-button ui-button-secondary ui-icon-button">{direction === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}</button></div>
          </div>
        </header>
        <div className="min-h-[52dvh] bg-white p-3 sm:p-5">
          {error && <div role="alert" className="mb-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-700"><Shield className="mt-0.5 h-4 w-4 shrink-0" />{error}<button onClick={() => setError('')} className="mr-auto"><X className="h-4 w-4" /></button></div>}
          {loading ? <div className="flex min-h-64 items-center justify-center gap-2 text-xs text-slate-400"><LoaderCircle className="h-4 w-4 animate-spin" />در حال دریافت پوشه…</div>
            : items.length === 0 && childFolders.length === 0 ? <EmptyState canCreate={hasPermission('assets.upload')} onCreate={() => setEntryOpen(true)} />
            : <AssetExplorer folders={childFolders} assets={items} statusLabel={damStatusLabel} onOpenFolder={id => { setFolderId(id); setPage(1); }} onOpenAsset={asset => void openAsset(asset)} />}
        </div>
        <footer className="flex items-center justify-between border-t border-slate-200 bg-white px-4 py-3 text-[11px] text-slate-500"><span>صفحه {page.toLocaleString('fa-IR')} از {lastPage.toLocaleString('fa-IR')}</span><div className="flex items-center gap-1"><button disabled={page <= 1 || loading} onClick={() => setPage(value => Math.max(1, value - 1))} className="rounded-lg border border-slate-200 p-1.5 hover:bg-slate-50 disabled:opacity-40" aria-label="صفحه قبلی"><ChevronRight className="h-4 w-4" /></button><button disabled={page >= lastPage || loading} onClick={() => setPage(value => Math.min(lastPage, value + 1))} className="rounded-lg border border-slate-200 p-1.5 hover:bg-slate-50 disabled:opacity-40" aria-label="صفحه بعدی"><ChevronLeft className="h-4 w-4" /></button></div></footer>
      </section> : <div className="grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="space-y-4 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between px-2 py-1">
            <h2 className="text-xs font-black text-slate-800">مخزن دارایی‌ها</h2>

          </div>
          <button onClick={() => { setActiveView('library'); setType('all'); setFolderId(null); setPage(1); }} className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-right text-xs font-bold ${activeView === 'library' && type === 'all' && folderId === null ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}>
            <HardDrive className="h-4 w-4" /> همه دارایی‌ها
          </button>
          <button onClick={() => { setActiveView('library'); setType('file'); setFolderId(null); setPage(1); }} className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-right text-xs font-bold ${type === 'file' && activeView === 'library' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}><File className="h-4 w-4" /> فایل‌ها</button>
          <button onClick={() => { setActiveView('library'); setType('content'); setFolderId(null); setPage(1); }} className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-right text-xs font-bold ${type === 'content' && activeView === 'library' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}><FileText className="h-4 w-4" /> محتوای متنی</button>
          {hasPermission('assets.view') && <button onClick={() => setActiveView('tables')} className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-right text-xs font-bold ${activeView === 'tables' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}><TableIcon className="h-4 w-4" /> جدول اطلاعات</button>}

          <div className="border-t border-slate-100 pt-3">
            <div className="mb-2 flex items-center justify-between px-2"><h3 className="text-[11px] font-black text-slate-500">پوشه‌ها</h3><span className="text-[10px] text-slate-400">{folders.length}</span></div>
            <div className="max-h-[420px] space-y-0.5 overflow-y-auto">
              <button onClick={() => { setActiveView('library'); setType('all'); setFolderId(0); setPage(1); }} className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-right text-xs ${folderId === 0 ? 'bg-amber-50 font-bold text-amber-800' : 'text-slate-600 hover:bg-slate-50'}`}><Folder className="h-4 w-4 text-amber-500" /> بدون پوشه / ریشه</button>
              {folders.filter(folder => folder.parent_id === null).map(folder => <FolderTree key={folder.id} folder={folder} all={folders} currentId={folderId} onSelect={id => { setActiveView('library'); setType('all'); setFolderId(id); setPage(1); }} onRename={renameFolder} canRename={hasPermission('assets.rename')} onMove={moveFolder} canMove={hasPermission('assets.move')} onDelete={folder => void deleteFolder(folder)} canDelete={hasPermission('assets.delete')} />)}
              {!folders.length && <p className="px-3 py-2 text-[11px] text-slate-400">هنوز پوشه‌ای ایجاد نشده است.</p>}
            </div>
          </div>
        </aside>

        <div className="min-w-0 space-y-3">
          {activeView === 'tables' ? <DamDataTables /> : <>
            <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1 text-xs text-slate-500">
                  <button onClick={() => { setFolderId(null); setPage(1); }} className="shrink-0 hover:text-indigo-600">دارایی‌ها</button>
                  {folderPath.map(folder => <React.Fragment key={folder.id}><ChevronLeft className="h-3.5 w-3.5 shrink-0" /><button onClick={() => { setFolderId(folder.id); setPage(1); }} className="max-w-32 truncate font-bold text-slate-800 hover:text-indigo-600">{folder.name}</button></React.Fragment>)}
                  {folderPath.length === 0 && <><ChevronLeft className="h-3.5 w-3.5" /><span className="font-bold text-slate-800">{folderId === 0 ? 'بدون پوشه / ریشه' : 'همه دارایی‌ها'}</span></>}
                </div>
                <span className="text-[11px] text-slate-400">{total.toLocaleString('fa-IR')} مورد</span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="relative min-w-[220px] flex-1 sm:max-w-sm"><Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder="جست‌وجوی نام، فایل، برچسب، کد یا عنوان محتوا" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pr-9 pl-3 text-xs outline-none focus:border-indigo-400 focus:bg-white" /></label>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-500">مرتب‌سازی:</span>
                  <select value={sort} onChange={event => setSort(event.target.value as typeof sort)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[11px]"><option value="updated_at">آخرین تغییر</option><option value="title">نام</option><option value="file_size">حجم فایل</option></select>
                  <button onClick={() => setDirection(current => current === 'asc' ? 'desc' : 'asc')} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50" aria-label="تغییر جهت مرتب‌سازی">{direction === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}</button>
                </div>
                <div className="mr-auto flex items-center gap-2">
                  <button onClick={() => setShowFilters(value => !value)} className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2.5 text-xs font-bold transition ${showFilters ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}><SlidersHorizontal className="h-4 w-4" />فیلترها{[categoryId, status, confidentiality, ownerFilter, createdFrom, createdTo, projectFilter, taskFilter, departmentFilter, contentFilter, orphanOnly ? 'orphan' : ''].filter(Boolean).length > 0 && <span className="rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] font-black text-white">{[categoryId, status, confidentiality, ownerFilter, createdFrom, createdTo, projectFilter, taskFilter, departmentFilter, contentFilter, orphanOnly ? 'orphan' : ''].filter(Boolean).length.toLocaleString('fa-IR')}</span>}</button>
                  <div className="flex items-center gap-0.5 rounded-xl border border-slate-200 bg-white p-1"><button onClick={() => setViewMode('grid')} title="نمای شبکه‌ای" aria-label="نمای شبکه‌ای" className={`rounded-lg p-2 transition ${viewMode === 'grid' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-100'}`}><LayoutGrid className="h-4 w-4" /></button><button onClick={() => setViewMode('table')} title="نمای جدولی" aria-label="نمای جدولی" className={`rounded-lg p-2 transition ${viewMode === 'table' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-100'}`}><TableIcon className="h-4 w-4" /></button><button onClick={() => setViewMode('list')} title="نمای فهرستی سریع" aria-label="نمای فهرستی سریع" className={`rounded-lg p-2 transition ${viewMode === 'list' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-100'}`}><List className="h-4 w-4" /></button><button onClick={() => setViewMode('explorer')} title="مرورگر فایل شبیه ویندوز و پنل میزبانی" aria-label="نمای مرورگر فایل" className={`rounded-lg p-2 transition ${viewMode === 'explorer' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-100'}`}><Folder className="h-4 w-4" /></button></div>
                  {viewMode === 'table' && <div className="relative"><button onClick={() => setColumnPickerOpen(value => !value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-600">ستون‌ها</button>{columnPickerOpen && <div className="absolute left-0 top-11 z-30 w-52 space-y-1 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">{TABLE_COLUMNS.map(column => <label key={column.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] hover:bg-slate-50"><input type="checkbox" checked={visibleColumns.includes(column.id)} disabled={column.id === 'name'} onChange={() => setVisibleColumns(current => current.includes(column.id) ? current.filter(id => id !== column.id) : [...current, column.id])} />{column.label}</label>)}</div>}</div>}
                </div>
              </div>
              {showFilters && <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                <div className="flex gap-1"><select value={categoryId} onChange={event => { setCategoryId(event.target.value); setPage(1); }} className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-700 outline-none focus:border-indigo-400"><option value="">همه دسته‌بندی‌ها</option>{categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{hasPermission('assets.manage_access') && <button onClick={createCategory} type="button" className="rounded-xl border border-slate-200 px-2.5 text-indigo-600 hover:bg-indigo-50" title="ساخت دسته‌بندی"><Plus className="h-4 w-4" /></button>}</div>
                <select value={status} onChange={event => { setStatus(event.target.value); setPage(1); }} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-700 outline-none focus:border-indigo-400"><option value="">همه وضعیت‌ها</option>{(statusOptions.length ? statusOptions.map(item => ({ value: item.id, label: item.label })) : Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
                <select value={confidentiality} onChange={event => { setConfidentiality(event.target.value); setPage(1); }} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-700 outline-none focus:border-indigo-400"><option value="">همه سطوح دسترسی</option>{ACCESS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
                <select value={ownerFilter} onChange={event => { setOwnerFilter(event.target.value); setPage(1); }} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-700"><option value="">همه مالکان</option>{workspaceUsers.filter(user => /^\d+$/.test(String(user.id))).map(user => <option key={user.id} value={user.id}>{user.name}</option>)}</select>
                <label className="rounded-xl border border-slate-200 bg-white px-3 py-1 text-[9px] text-slate-500">از تاریخ<input type="date" value={createdFrom} onChange={event => { setCreatedFrom(event.target.value); setPage(1); }} className="block w-full bg-transparent text-xs text-slate-700 outline-none" /></label>
                <label className="rounded-xl border border-slate-200 bg-white px-3 py-1 text-[9px] text-slate-500">تا تاریخ<input type="date" value={createdTo} min={createdFrom || undefined} onChange={event => { setCreatedTo(event.target.value); setPage(1); }} className="block w-full bg-transparent text-xs text-slate-700 outline-none" /></label>
                <label className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-700"><span>دارایی‌های بدون ارتباط</span><input type="checkbox" checked={orphanOnly} onChange={event => { setOrphanOnly(event.target.checked); setPage(1); }} /></label>
                <select value={projectFilter} onChange={event => { setProjectFilter(event.target.value); setPage(1); }} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-700"><option value="">همه پروژه‌ها</option>{projects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
                <select value={taskFilter} onChange={event => { setTaskFilter(event.target.value); setPage(1); }} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-700"><option value="">همه وظایف</option>{tasks.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select>
                <select value={departmentFilter} onChange={event => { setDepartmentFilter(event.target.value); setPage(1); }} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-700"><option value="">همه دپارتمان‌ها</option>{departments.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
                <select value={contentFilter} onChange={event => { setContentFilter(event.target.value); setPage(1); }} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-700"><option value="">همه محتواها</option>{contentOptions.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select>
              </div>}
              {selectedIds.length > 0 && <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-3">
                <div className="flex flex-wrap items-center gap-2 rounded-xl bg-indigo-50 px-2 py-1.5">
                  <span className="px-1 text-[11px] font-bold text-indigo-700">{selectedIds.length} انتخاب</span>
                  {hasPermission('assets.move') && <button onClick={() => setTransferTarget({ kind: 'assets', ids: [...selectedIds] })} className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-bold text-indigo-700 hover:bg-indigo-100"><Move className="h-3.5 w-3.5" />انتقال با مرورگر پوشه‌ها</button>}
                  {hasPermission('assets.edit_info') && <button onClick={() => void tagSelected()} className="rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-bold text-indigo-700 hover:bg-indigo-100">افزودن برچسب</button>}
                  {hasPermission('assets.manage_access') && <button onClick={() => void statusSelected()} className="rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-bold text-indigo-700 hover:bg-indigo-100">تغییر وضعیت</button>}
                  {hasPermission('assets.delete') && <button onClick={archiveSelected} className="rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-bold text-rose-600 hover:bg-rose-50">بایگانی</button>}
                </div>
              </div>}
            </div>

            {childFolders.length > 0 && viewMode !== 'explorer' && <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{childFolders.map(folder => <div key={folder.id} className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-amber-300 hover:shadow"><button onClick={() => { setFolderId(folder.id); setPage(1); }} className="flex min-w-0 flex-1 items-center gap-3 text-right"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-500"><Folder className="h-5 w-5" /></span><span className="min-w-0"><span className="block truncate text-xs font-bold text-slate-800">{folder.name}</span><span className="mt-0.5 block text-[10px] text-slate-400">پوشه</span></span></button><span className="flex items-center gap-0.5">{hasPermission('assets.rename') && folder.management_type !== 'system' && <button onClick={() => renameFolder(folder)} aria-label={`تغییر نام ${folder.name}`} className="rounded-lg p-1.5 text-slate-300 opacity-0 transition hover:bg-slate-100 hover:text-slate-600 group-hover:opacity-100"><MoreHorizontal className="h-4 w-4" /></button>}{hasPermission('assets.move') && folder.management_type !== 'system' && <button onClick={() => moveFolder(folder)} aria-label={`انتقال ${folder.name}`} title="انتقال به پوشه دیگر" className="rounded-lg p-1.5 text-slate-300 opacity-0 transition hover:bg-indigo-50 hover:text-indigo-600 group-hover:opacity-100"><Move className="h-4 w-4" /></button>}{hasPermission('assets.delete') && folder.management_type !== 'system' && <button onClick={() => void deleteFolder(folder)} aria-label={`حذف ${folder.name}`} className="rounded-lg p-1.5 text-slate-300 opacity-0 transition hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100"><Trash2 className="h-4 w-4" /></button>}</span></div>)}</div>}

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

              {error && <div role="alert" className="m-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-700"><Shield className="mt-0.5 h-4 w-4 shrink-0" />{error}<button onClick={() => setError('')} className="mr-auto"><X className="h-4 w-4" /></button></div>}
              {loading ? <div className="flex items-center justify-center gap-2 p-12 text-xs text-slate-400"><LoaderCircle className="h-4 w-4 animate-spin" />در حال دریافت اطلاعات...</div>
                : items.length === 0 && (viewMode !== 'explorer' || childFolders.length === 0) ? <EmptyState canCreate={hasPermission('assets.upload')} onCreate={() => setEntryOpen(true)} />
                : viewMode === 'explorer'
                ? <AssetExplorer folders={childFolders} assets={items} statusLabel={damStatusLabel} onOpenFolder={id => { setFolderId(id); setPage(1); }} onOpenAsset={asset => void openAsset(asset)} />
                : viewMode === 'grid'
                ? <div className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3">{items.map(asset => <AssetGridCard key={asset.id} asset={asset} statusLabel={damStatusLabel} folderLabel={folderPathName(asset.folder_id)} canSelect={hasPermission('assets.move') || hasPermission('assets.delete')} selected={selectedIds.includes(asset.id)} onToggle={() => setSelectedIds(ids => ids.includes(asset.id) ? ids.filter(id => id !== asset.id) : [...ids, asset.id])} onOpen={() => void openAsset(asset)} />)}</div>
                : viewMode === 'table'
                ? <AssetTable assets={items} columns={visibleColumns} statusLabel={damStatusLabel} canSelect={hasPermission('assets.move') || hasPermission('assets.delete')} selectedIds={selectedIds} onToggle={id => setSelectedIds(ids => ids.includes(id) ? ids.filter(item => item !== id) : [...ids, id])} onToggleAll={() => setSelectedIds(selectedIds.length === items.length ? [] : items.map(item => item.id))} onOpen={asset => void openAsset(asset)} />
                : <div className="divide-y divide-slate-100">{items.map(asset => <AssetListItem key={asset.id} asset={asset} statusLabel={damStatusLabel} canSelect={hasPermission('assets.move') || hasPermission('assets.delete')} selected={selectedIds.includes(asset.id)} onToggle={() => setSelectedIds(ids => ids.includes(asset.id) ? ids.filter(id => id !== asset.id) : [...ids, asset.id])} onOpen={() => void openAsset(asset)} />)}</div>}
              <footer className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-[11px] text-slate-500"><span>صفحه {page.toLocaleString('fa-IR')} از {lastPage.toLocaleString('fa-IR')}</span><div className="flex items-center gap-1"><button disabled={page <= 1 || loading} onClick={() => setPage(value => Math.max(1, value - 1))} className="rounded-lg border border-slate-200 p-1.5 hover:bg-slate-50 disabled:opacity-40" aria-label="صفحه قبلی"><ChevronRight className="h-4 w-4" /></button><button disabled={page >= lastPage || loading} onClick={() => setPage(value => Math.min(lastPage, value + 1))} className="rounded-lg border border-slate-200 p-1.5 hover:bg-slate-50 disabled:opacity-40" aria-label="صفحه بعدی"><ChevronLeft className="h-4 w-4" /></button></div></footer>
            </div>
          </>}
        </div>
      </div>}

      {folderDialog && <div className="fixed inset-0 z-[74] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm"><form onSubmit={saveFolder} className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"><div className="flex items-center justify-between"><h2 className="text-sm font-black text-slate-900">{folderDialog.mode === 'create' ? 'ساخت پوشه جدید' : 'تغییر نام پوشه'}</h2><button type="button" disabled={folderSaving} onClick={() => setFolderDialog(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button></div><label className="block text-[11px] font-bold text-slate-600">نام پوشه<input autoFocus required maxLength={255} value={folderName} onChange={event => setFolderName(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs outline-none focus:border-indigo-400" /></label><div className="flex justify-end gap-2"><button data-button-action="cancel" type="button" disabled={folderSaving} onClick={() => setFolderDialog(null)} className="ui-form-action rounded-xl px-3 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100">انصراف</button><button data-button-action={folderDialog.mode === 'create' ? 'create' : 'save'} disabled={folderSaving} className="ui-form-action inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50">{folderSaving && <LoaderCircle className="w-4 h-4 animate-spin"/>}{folderSaving ? 'در حال ذخیره…' : 'ذخیره'}</button></div></form></div>}
      {transferTarget && <FolderBrowserModal
        folders={folders}
        title={transferTarget.kind === 'folder' ? `انتقال پوشه «${transferTarget.folder.name}»` : transferTarget.kind === 'asset' ? `انتقال «${transferTarget.asset.title}»` : `انتقال ${transferTarget.ids.length.toLocaleString('fa-IR')} دارایی`}
        initialFolderId={transferTarget.kind === 'folder' ? transferTarget.folder.parent_id : transferTarget.kind === 'asset' ? (transferTarget.asset.folder_id || null) : folderId}
        blockedIds={transferTarget.kind === 'folder' ? [...folderSubtreeIds(transferTarget.folder.id)] : []}
        busy={transferBusy}
        onCreate={createFolderInBrowser}
        onSelect={completeTransfer}
        onClose={() => setTransferTarget(null)}
      />}
      {attachOpen && <AttachModal
        query={attachSearch}
        items={attachItems}
        loading={attachBusy}
        onSearch={value => void searchAttachExisting(value)}
        onAttach={asset => void attachExisting(asset)}
        onClose={() => setAttachOpen(false)}
      />}
      {entryOpen && <EntryModal
        context={context}
        folders={folders}
        categories={categories}
        projects={projects.filter(project => project.status !== 'archived')}
        tasks={tasks}
        departments={departments}
        contents={contentOptions}
        currentFolderId={folderId}
        canSetStatus={hasPermission('assets.manage_access')}
        statusOptions={statusOptions}
        onClose={() => setEntryOpen(false)}
        onSuccess={(message, close = true) => { if (close) setEntryOpen(false); setToast(message); setPage(1); reload(); }}
      />}
      {selected && <AssetDetails
        asset={selected}
        folders={folders}
        folderLabel={folderPathName}
        categories={categories}
        projects={projects}
        statusOptions={statusOptions}
        statusLabel={damStatusLabel}
        hasPermission={hasPermission}
        canReadLinkedContent={canReadLinkedContent}
        busy={detailBusy}
        onClose={() => setSelected(null)}
        onUpdate={updateAsset}
        onMove={asset => setTransferTarget({ kind: 'asset', asset })}
        onReplace={asset => { setSelected(asset); reload(); }}
        onRestore={restoreVersion}
        onDelete={deleteAsset}
      />}
      {toast && <div role="status" className="fixed bottom-5 left-5 z-[90] flex max-w-sm items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-xs font-bold text-white shadow-xl"><Check className="h-4 w-4 text-emerald-400" />{toast}<button onClick={() => setToast('')} className="mr-2 text-slate-300"><X className="h-4 w-4" /></button></div>}
    </section>
  );
};

const Metric: React.FC<{ icon: React.ReactNode; label: string; value?: number | string; color: string }> = ({ icon, label, value, color }) => {
  const colors: Record<string, string> = { indigo: 'bg-indigo-50 text-indigo-600', blue: 'bg-sky-50 text-sky-600', violet: 'bg-violet-50 text-violet-600', amber: 'bg-amber-50 text-amber-600' };
  return <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><span className={`flex h-9 w-9 items-center justify-center rounded-xl ${colors[color]}`}>{icon}</span><div className="min-w-0"><p className="text-[10px] text-slate-500">{label}</p><p className="mt-0.5 truncate text-base font-black text-slate-900">{value === undefined ? '—' : typeof value === 'number' ? value.toLocaleString('fa-IR') : value}</p></div></div>;
};

const FolderTree: React.FC<{ folder: FolderRecord; all: FolderRecord[]; currentId: number | null; onSelect: (id: number) => void; onRename: (folder: FolderRecord) => void; canRename: boolean; onMove: (folder: FolderRecord) => void; canMove: boolean; onDelete: (folder: FolderRecord) => void; canDelete: boolean; depth?: number }> = ({ folder, all, currentId, onSelect, onRename, canRename, onMove, canMove, onDelete, canDelete, depth = 0 }) => {
  const children = all.filter(item => item.parent_id === folder.id);
  const currentInBranch = (() => {
    let cursor = currentId ? all.find(item => item.id === currentId) : undefined;
    let guard = 0;
    while (cursor && guard++ < 50) {
      if (cursor.id === folder.id) return true;
      cursor = cursor.parent_id ? all.find(item => item.id === cursor!.parent_id) : undefined;
    }
    return false;
  })();
  const [expanded, setExpanded] = useState(depth === 0 || currentInBranch);
  useEffect(() => { if (currentInBranch) setExpanded(true); }, [currentInBranch]);
  return <div><div style={{ paddingRight: `${8 + Math.min(depth, 5) * 12}px` }} className={`group flex items-center gap-1 rounded-lg pl-1 ${currentId === folder.id ? 'bg-amber-50' : 'hover:bg-slate-50'}`}>
    {children.length > 0 ? <button type="button" onClick={() => setExpanded(value => !value)} aria-label={`${expanded ? 'بستن' : 'بازکردن'} زیرپوشه‌های ${folder.name}`} aria-expanded={expanded} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-white hover:text-amber-600">{expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}</button> : <span className="h-7 w-7 shrink-0" />}
    <button onClick={() => onSelect(folder.id)} className={`flex min-w-0 flex-1 items-center gap-2 py-2 pl-1 text-right text-xs ${currentId === folder.id ? 'font-bold text-amber-800' : 'text-slate-600'}`}><Folder className="h-4 w-4 shrink-0 text-amber-500" /><span className="truncate">{folder.name}</span></button>
    {canRename && folder.management_type !== 'system' && <button onClick={() => onRename(folder)} aria-label={`تغییر نام ${folder.name}`} className="rounded p-1 text-slate-300 opacity-0 hover:text-slate-600 group-hover:opacity-100"><MoreHorizontal className="h-3.5 w-3.5" /></button>}
    {canMove && folder.management_type !== 'system' && <button onClick={() => onMove(folder)} aria-label={`انتقال ${folder.name}`} title="انتقال به پوشه دیگر" className="rounded p-1 text-slate-300 opacity-0 hover:bg-indigo-50 hover:text-indigo-600 group-hover:opacity-100"><Move className="h-3.5 w-3.5" /></button>}
    {canDelete && folder.management_type !== 'system' && <button onClick={() => onDelete(folder)} aria-label={`حذف ${folder.name}`} className="rounded p-1 text-slate-300 opacity-0 hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>}
  </div>{expanded && children.map(child => <FolderTree key={child.id} folder={child} all={all} currentId={currentId} onSelect={onSelect} onRename={onRename} canRename={canRename} onMove={onMove} canMove={canMove} onDelete={onDelete} canDelete={canDelete} depth={depth + 1} />)}</div>;
};

const EmptyState: React.FC<{ canCreate: boolean; onCreate: () => void }> = ({ canCreate, onCreate }) => <div className="flex flex-col items-center px-5 py-14 text-center"><span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400"><Folder className="h-6 w-6" /></span><h3 className="text-sm font-bold text-slate-800">دارایی‌ای پیدا نشد</h3><p className="mt-1 max-w-xs text-xs leading-6 text-slate-500">فیلترها را تغییر دهید یا یک فایل و محتوای تازه به مخزن اضافه کنید.</p>{canCreate && <button data-button-action="create" onClick={onCreate} className="ui-form-action mt-4 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-indigo-700"><Plus className="ml-1 inline h-3.5 w-3.5" />ثبت دارایی</button>}</div>;

const AssetExplorer: React.FC<{ folders: FolderRecord[]; assets: Asset[]; statusLabel: (id: string) => string; onOpenFolder: (id: number) => void; onOpenAsset: (asset: Asset) => void }> = ({ folders, assets, statusLabel, onOpenFolder, onOpenAsset }) => (
  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 2xl:grid-cols-7" role="list" aria-label="محتویات پوشه جاری">
    {folders.map(folder => <article key={`folder-${folder.id}`} role="listitem" className="group relative min-w-0">
      <button type="button" onDoubleClick={() => onOpenFolder(folder.id)} onClick={() => onOpenFolder(folder.id)} className="flex w-full flex-col items-center gap-3 rounded-2xl p-4 text-center hover:bg-amber-50 focus:bg-amber-50">
        <span className="flex h-20 w-24 items-center justify-center text-amber-500"><Folder className="h-16 w-16 fill-amber-200 stroke-[1.25]" /></span>
        <span className="w-full truncate text-xs font-black text-slate-800" title={folder.name}>{folder.name}</span>
        <span className="text-[9px] font-bold text-slate-400">پوشه</span>
      </button>
    </article>)}
    {assets.map(asset => <article key={`asset-${asset.id}`} role="listitem" className="group relative flex min-w-0 flex-col items-center rounded-2xl p-3 text-center hover:bg-slate-50 focus-within:bg-slate-50">
      <button type="button" onDoubleClick={() => onOpenAsset(asset)} onClick={() => onOpenAsset(asset)} className="flex w-full min-w-0 flex-col items-center gap-3">
        <span className={`flex h-20 w-20 items-center justify-center rounded-2xl ${asset.type === 'content' ? 'bg-violet-50 text-violet-600' : 'bg-indigo-50 text-indigo-600'}`}>{asset.type === 'content' ? <FileText className="h-10 w-10 stroke-[1.5]" /> : <File className="h-10 w-10 stroke-[1.5]" />}</span>
        <span className="w-full truncate text-xs font-black text-slate-800" title={asset.title}>{asset.title}</span>
      </button>
      <div className="mt-1 flex items-center gap-1 text-[9px] text-slate-400"><span>{asset.latest_file?.extension?.toUpperCase() || (asset.type === 'content' ? 'متن' : 'فایل')}</span><span>•</span><span>{asset.latest_file ? formatSize(asset.latest_file.file_size) : statusLabel(asset.status)}</span></div>
      <div className="mt-2 opacity-70 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"><AssetRowActions asset={asset} onOpen={() => onOpenAsset(asset)} /></div>
    </article>)}
  </div>
);

const AssetRowActions: React.FC<{ asset: Asset; onOpen: () => void }> = ({ asset, onOpen }) => {
  const { hasPermission, notify } = useApp();
  const [progress, setProgress] = useState<{ percent: number; loaded: number } | null>(null);
  const download = async () => {
    if (progress) return;
    setProgress({ percent: 0, loaded: 0 });
    try {
      await downloadAssetOnce(asset, (percent, loaded) => setProgress({ percent, loaded }));
      notify({ type: 'success', title: 'دانلود کامل شد', message: 'فایل از همان دادهٔ دریافت‌شده ذخیره شد.' });
    } catch (error) {
      notify({ type: 'error', title: 'دانلود ناموفق بود', message: getError(error) });
    } finally { window.setTimeout(() => setProgress(null), 800); }
  };
  if (asset.type === 'content') {
    return <TextAssetActions title={asset.title} html={asset.content_item?.content_body || ''} onView={onOpen} canDownload={hasPermission('assets.download')} />;
  }
  return <div className="flex items-center justify-end gap-1">
    <button type="button" onClick={onOpen} title="مشاهده" aria-label={`مشاهده ${asset.title}`} className="rounded-lg p-2 text-indigo-600 hover:bg-indigo-50"><Eye className="h-4 w-4" /></button>
    {hasPermission('assets.download') && <button type="button" onClick={() => void download()} title="دانلود امن" aria-label={`دانلود ${asset.title}`} className="rounded-lg p-2 text-emerald-600 hover:bg-emerald-50 disabled:opacity-50" disabled={Boolean(progress)}><Download className="h-4 w-4" /></button>}
    {progress && <span className="min-w-20 text-[9px] font-bold text-indigo-700">{progress.percent.toLocaleString('fa-IR')}٪ · {(progress.loaded / 1048576).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} MB</span>}
  </div>;
};

const AssetTable: React.FC<{
  assets: Asset[]; columns: TableColumnKey[]; statusLabel: (id: string) => string;
  canSelect: boolean; selectedIds: number[]; onToggle: (id: number) => void; onToggleAll: () => void; onOpen: (asset: Asset) => void;
}> = ({ assets, columns, statusLabel, canSelect, selectedIds, onToggle, onToggleAll, onOpen }) => {
  const cell = (asset: Asset, column: TableColumnKey) => {
    switch (column) {
      case 'type': return asset.type === 'content' ? 'متن' : (asset.latest_file?.extension || asset.latest_file?.mime_type || 'فایل').toUpperCase();
      case 'related': return asset.used_in?.length ? <span title={asset.used_in.map(item => item.label).join('، ')}>{asset.used_in[0].label}{(asset.used_in_count || 0) > 1 ? ` +${(asset.used_in_count || 1) - 1}` : ''}</span> : 'بدون ارتباط';
      case 'status': return <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold">{statusLabel(asset.status)}</span>;
      case 'version': return `نسخه ${(asset.versions_max_version_number || asset.latest_version?.version_number || 1).toLocaleString('fa-IR')}`;
      case 'owner': return asset.owner?.name || '—';
      case 'department': return asset.department_id ? `#${asset.department_id.toLocaleString('fa-IR')}` : '—';
      case 'size': return asset.latest_file ? formatSize(asset.latest_file.file_size) : '—';
      case 'updated': return formatDate(asset.updated_at);
      case 'createdBy': return asset.creator?.name || '—';
      case 'createdAt': return formatDate(asset.created_at);
      default: return null;
    }
  };
  return <div className="overflow-x-auto"><table className="w-full min-w-[760px] border-collapse text-right"><thead><tr className="border-b border-slate-200 bg-slate-50/90">{columns.map(column => <th key={column} className="whitespace-nowrap px-3 py-3 text-[10px] font-black text-slate-500">{TABLE_COLUMNS.find(item => item.id === column)?.label}</th>)}<th className="whitespace-nowrap px-3 py-3 text-[10px] font-black text-slate-500">عملیات</th>{canSelect && <th className="w-10 px-3"><input type="checkbox" aria-label="انتخاب همه" checked={assets.length > 0 && selectedIds.length === assets.length} onChange={onToggleAll} /></th>}</tr></thead><tbody className="divide-y divide-slate-100">{assets.map(asset => <tr key={asset.id} className="hover:bg-slate-50/70">{columns.map(column => <td key={column} className="max-w-[260px] truncate px-3 py-3 text-[11px] text-slate-600">{column === 'name' ? <button onClick={() => onOpen(asset)} className="flex min-w-0 items-center gap-2 text-right font-black text-slate-800 hover:text-indigo-700"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">{asset.type === 'content' ? <FileText className="h-4 w-4" /> : <File className="h-4 w-4" />}</span><span className="truncate">{asset.title}</span></button> : cell(asset, column)}</td>)}<td className="px-3 py-2"><AssetRowActions asset={asset} onOpen={() => onOpen(asset)} /></td>{canSelect && <td className="px-3 text-center"><input type="checkbox" checked={selectedIds.includes(asset.id)} onChange={() => onToggle(asset.id)} aria-label={`انتخاب ${asset.title}`} /></td>}</tr>)}</tbody></table></div>;
};

const AssetListItem: React.FC<{ asset: Asset; statusLabel: (id: string) => string; canSelect: boolean; selected: boolean; onToggle: () => void; onOpen: () => void }> = ({ asset, statusLabel, canSelect, selected, onToggle, onOpen }) => {
  const isContent = asset.type === 'content';
  const extension = asset.latest_file?.extension?.toUpperCase() || asset.latest_file?.original_filename?.split('.').pop()?.toUpperCase() || 'FILE';
  return <div className="grid grid-cols-[minmax(0,1fr)_32px] items-center gap-3 px-3 py-3 transition hover:bg-slate-50/80 sm:px-4 lg:grid-cols-[minmax(220px,1.4fr)_minmax(120px,.7fr)_minmax(100px,.65fr)_minmax(110px,.65fr)_minmax(105px,.65fr)_minmax(150px,.8fr)]">
    <button onClick={onOpen} className="flex min-w-0 items-center gap-3 text-right">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${isContent ? 'bg-violet-50 text-violet-600' : 'bg-indigo-50 text-indigo-600'}`}>{isContent ? <FileText className="h-5 w-5" /> : <File className="h-5 w-5" />}</span>
      <span className="min-w-0"><span className="flex items-center gap-1.5"><span className="max-w-full truncate text-xs font-bold text-slate-800 hover:text-indigo-700">{asset.title}</span>{asset.confidentiality === 'confidential' && <LockKeyhole className="h-3 w-3 shrink-0 text-rose-500" />}</span><span className="mt-1 flex items-center gap-2 text-[10px] text-slate-400"><span>{isContent ? 'محتوای متنی' : extension}</span>{asset.latest_file && <><span>•</span><span>{formatSize(asset.latest_file.file_size)}</span></>}{asset.tags?.slice(0, 2).map(tag => <span key={tag.id} className="hidden rounded bg-slate-100 px-1.5 py-0.5 text-slate-500 sm:inline">{tag.name}</span>)}</span></span>
    </button>
    <span className="hidden min-w-0 lg:block"><span className="block truncate text-[11px] font-medium text-slate-600">{asset.category?.name || 'بدون دسته‌بندی'}</span><span className="mt-1 block truncate text-[10px] text-slate-400">{asset.folder?.name || 'ریشه'}</span></span>
    <span className="hidden lg:block"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${asset.status === 'approved' || asset.status === 'published' ? 'bg-emerald-50 text-emerald-700' : asset.status === 'rejected' ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>{statusLabel(asset.status)}</span></span>
    <span className="hidden lg:block"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${asset.confidentiality === 'confidential' ? 'bg-rose-50 text-rose-700' : asset.confidentiality === 'public' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}>{PRIVACY_LABELS[asset.confidentiality] || asset.confidentiality}</span></span>
    <span className="hidden text-[10px] leading-5 text-slate-500 lg:block">{formatDate(asset.updated_at)}</span>
    <span className="flex items-center justify-end gap-2"><AssetRowActions asset={asset} onOpen={onOpen} />{canSelect && <input type="checkbox" checked={selected} onChange={onToggle} aria-label={`انتخاب ${asset.title}`} className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />}</span>
  </div>;
};

const AssetGridCard: React.FC<{ asset: Asset; statusLabel: (id: string) => string; folderLabel: string; canSelect: boolean; selected: boolean; onToggle: () => void; onOpen: () => void }> = ({ asset, statusLabel, folderLabel, canSelect, selected, onToggle, onOpen }) => {
  const isContent = asset.type === 'content';
  const mime = (asset.latest_file?.mime_type || '').toLowerCase();
  const isImage = mime.startsWith('image/') && mime !== 'image/svg+xml';
  return <div className={`group relative flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition hover:border-indigo-300 hover:shadow ${selected ? 'border-indigo-400 ring-1 ring-indigo-300' : 'border-slate-200'}`}>
    <button onClick={onOpen} className="flex h-32 items-center justify-center overflow-hidden bg-slate-50 text-slate-300">
      {isImage
        ? <img src={`${apiConfig.baseUrl}/dam/library/${asset.id}/preview`} alt={asset.title} loading="lazy" className="h-full w-full object-cover" />
        : isContent ? <FileText className="h-10 w-10 text-violet-300" /> : <File className="h-10 w-10 text-indigo-200" />}
    </button>
    {canSelect && <input type="checkbox" checked={selected} onChange={onToggle} aria-label={`انتخاب ${asset.title}`} className="absolute left-2.5 top-2.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />}
    {asset.confidentiality === 'confidential' && <span title="دسترسی مجوزدار" className="absolute right-2.5 top-2.5 rounded-lg bg-white/90 p-1.5 text-rose-500 shadow-sm"><LockKeyhole className="h-3.5 w-3.5" /></span>}
    <button onClick={onOpen} className="flex min-w-0 flex-1 flex-col gap-1 p-3 text-right">
      <span className="truncate text-xs font-bold text-slate-800 group-hover:text-indigo-700">{asset.title}</span>
      <span className="truncate text-[10px] text-slate-400">{asset.category?.name || 'بدون دسته‌بندی'} • {asset.folder?.name || folderLabel}</span>
      <span className="mt-1 flex items-center justify-between gap-1">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${asset.status === 'approved' || asset.status === 'published' ? 'bg-emerald-50 text-emerald-700' : asset.status === 'rejected' ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>{statusLabel(asset.status)}</span>
        <span className="text-[10px] text-slate-400">{asset.latest_file ? formatSize(asset.latest_file.file_size) : isContent ? 'متن' : ''}</span>
      </span>
    </button>
  </div>;
};


const AttachModal: React.FC<{ query: string; items: Asset[]; loading: boolean; onSearch: (query: string) => void; onAttach: (asset: Asset) => void; onClose: () => void }> = ({ query, items, loading, onSearch, onAttach, onClose }) => <div className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm"><div className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"><div className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><div><h2 className="text-sm font-black text-slate-900">اتصال دارایی موجود</h2><p className="mt-1 text-[10px] text-slate-500">فایل کپی نمی‌شود؛ فقط ارتباط با این بخش ثبت خواهد شد.</p></div><button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button></div><div className="p-4"><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input autoFocus value={query} onChange={event => onSearch(event.target.value)} placeholder="جست‌وجو در دارایی‌های قابل‌دسترسی" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pr-3 pl-9 text-xs outline-none focus:border-indigo-400" /></div><div className="mt-3 max-h-[55vh] divide-y divide-slate-100 overflow-y-auto">{loading ? <p className="p-8 text-center text-xs text-slate-400">در حال جست‌وجو...</p> : items.length ? items.map(asset => <div key={asset.id} className="flex items-center gap-3 py-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">{asset.type === 'file' ? <File className="h-4 w-4" /> : <FileText className="h-4 w-4" />}</span><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-slate-800">{asset.title}</p><p className="mt-1 text-[10px] text-slate-400">{asset.type === 'file' ? formatSize(asset.latest_file?.file_size) : 'محتوای متنی'}</p></div><button onClick={() => onAttach(asset)} className="rounded-lg bg-indigo-600 px-3 py-2 text-[10px] font-bold text-white hover:bg-indigo-700">اتصال</button></div>) : <p className="p-8 text-center text-xs text-slate-400">دارایی‌ای پیدا نشد.</p>}</div></div></div></div>;

const AccessGrantsSelector: React.FC<{
  projects: ProjectOption[];
  value: AccessGrantsSelection;
  onChange: (value: AccessGrantsSelection) => void;
}> = ({ projects, value, onChange }) => {
  const { users, roles } = useApp();
  const serverUsers = users.filter(user => /^\d+$/.test(String(user.id)));
  const toggle = (group: keyof AccessGrantsSelection, id: string) => {
    const current = value[group];
    onChange({ ...value, [group]: current.includes(id) ? current.filter(item => item !== id) : [...current, id] });
  };
  const groups: { key: keyof AccessGrantsSelection; title: string; hint: string; options: { id: string; name: string }[] }[] = [
    {
      key: 'projects',
      title: 'پروژه‌ها',
      hint: 'اعضا و مدیران پروژه‌های انتخاب‌شده',
      options: projects.filter(project => /^\d+$/.test(String(project.id))).map(project => ({ id: String(project.id), name: project.name })),
    },
    {
      key: 'users',
      title: 'اشخاص',
      hint: 'کاربران دارای دسترسی مستقیم',
      options: serverUsers.map(user => ({ id: String(user.id), name: user.name })),
    },
    {
      key: 'roles',
      title: 'نقش‌ها',
      hint: 'همه کاربران دارای این نقش‌ها',
      options: roles.map(role => ({ id: role.key, name: role.name })),
    },
  ];
  return <div className="grid gap-2 sm:grid-cols-3">
    {groups.map(group => <div key={group.key} className="rounded-xl border border-rose-200 bg-rose-50/40 p-2.5">
      <p className="text-[11px] font-black text-slate-800">{group.title} <span className="font-normal text-slate-400">({value[group.key].length})</span></p>
      <p className="mt-0.5 text-[9px] text-slate-500">{group.hint}</p>
      <div className="mt-2 max-h-36 space-y-1 overflow-y-auto">
        {group.options.length === 0 && <p className="py-2 text-center text-[10px] text-slate-400">موردی ثبت نشده است.</p>}
        {group.options.map(option => <label key={option.id} className="flex cursor-pointer items-center gap-2 rounded-lg bg-white px-2 py-1.5 text-[10px] font-medium text-slate-700 hover:bg-rose-50">
          <input type="checkbox" checked={value[group.key].includes(option.id)} onChange={() => toggle(group.key, option.id)} className="h-3.5 w-3.5 rounded border-slate-300 text-rose-600 focus:ring-rose-500" />
          <span className="truncate">{option.name}</span>
        </label>)}
      </div>
    </div>)}
  </div>;
};

const EntryModal: React.FC<{
  context?: Context; folders: FolderRecord[]; categories: Category[]; projects: ProjectOption[]; tasks: TaskOption[]; departments: DepartmentOption[]; contents: ContentOption[]; currentFolderId: number | null;
  canSetStatus: boolean; statusOptions: { id: string; label: string }[]; onClose: () => void; onSuccess: (message: string, close?: boolean) => void;
}> = ({ context, folders, categories, projects, tasks, departments, contents, currentFolderId, canSetStatus, statusOptions, onClose, onSuccess }) => {
  const { hasPermission } = useApp();
  const [mode, setMode] = useState<AssetType>('file');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [body, setBody] = useState('');
  const [tags, setTags] = useState('');
  const [confidentiality, setConfidentiality] = useState('public');
  const [status, setStatus] = useState('approved');
  const [grants, setGrants] = useState<AccessGrantsSelection>({ projects: [], users: [], roles: [] });
  const [folderId, setFolderId] = useState(currentFolderId ? String(currentFolderId) : '');
  const [categoryId, setCategoryId] = useState('');
  const [projectId, setProjectId] = useState(context?.project_id ? String(context.project_id) : '');
  const [taskId, setTaskId] = useState(context?.task_id ? String(context.task_id) : '');
  const [departmentId, setDepartmentId] = useState(context?.department_id ? String(context.department_id) : '');
  const [contentId, setContentId] = useState(context?.content_id ? String(context.content_id) : '');

  const folderLabelOf = (id: number): string => {
    const names: string[] = [];
    let current = folders.find(folder => folder.id === id) || null;
    while (current) {
      names.unshift(current.name);
      current = current.parent_id ? folders.find(item => item.id === current?.parent_id) || null : null;
    }
    return names.join(' / ');
  };
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<string[]>([]);

  useEffect(() => {
    if (statusOptions.length && !statusOptions.some(option => option.id === status)) {
      setStatus(statusOptions[0].id);
    }
  }, [statusOptions, status]);

  const addFiles = (fileList: FileList | null) => {
    if (!fileList) return;
    const fresh = Array.from(fileList).map(file => ({ id: fileKey(), file, displayTitle: '', progress: 0 }));
    setQueue(previous => [...previous, ...fresh]);
  };

  const uploadOne = (form: FormData, item: QueueItem, updateProgress: (progress: number) => void) => new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${apiConfig.baseUrl}/dam/library`);
    xhr.withCredentials = true;
    xhr.setRequestHeader('Accept', 'application/json');
    const csrf = document.cookie.split('; ').find(cookie => cookie.startsWith('XSRF-TOKEN='));
    if (csrf) xhr.setRequestHeader('X-XSRF-TOKEN', decodeURIComponent(csrf.slice('XSRF-TOKEN='.length)));
    xhr.upload.onprogress = event => { if (event.lengthComputable) updateProgress(Math.round(event.loaded * 100 / event.total)); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) { resolve(); return; }
      let payload: any = null;
      try { payload = JSON.parse(xhr.responseText); } catch { /* non-JSON server response */ }
      const failure = new Error(payload?.message || 'بارگذاری ناموفق بود.') as Error & { duplicate?: { assetId: number; title: string } };
      if (xhr.status === 409 && payload?.code === 'dam_duplicate_detected' && payload?.data?.duplicate?.id) {
        failure.duplicate = { assetId: Number(payload.data.duplicate.id), title: String(payload.data.duplicate.title || 'دارایی موجود') };
      }
      reject(failure);
    };
    xhr.onerror = () => reject(new Error('ارتباط با سرور قطع شد.'));
    xhr.onabort = () => reject(new Error('بارگذاری لغو شد.'));
    xhr.send(form);
  });

  const ensureFolders = async (path: string[], cache: Map<string, number>) => {
    let parent = folderId ? Number(folderId) : null;
    const ancestry: string[] = [];
    for (const segment of path.filter(Boolean)) {
      ancestry.push(segment);
      const key = `${parent || 'root'}:${segment}`;
      if (cache.has(key)) { parent = cache.get(key)!; continue; }
      const result = await request<ApiResponse<FolderRecord>>('/dam/library/folders', {
        method: 'POST', body: { name: segment, parent_id: parent, department_id: context?.department_id || null },
      });
      cache.set(key, result.data.id);
      parent = result.data.id;
    }
    return parent;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(''); setResults([]); setBusy(true);
    try {
      const tagList = tags.split(/[,،]/).map(tag => tag.trim()).filter(Boolean);
      const grantPayload = confidentiality === 'confidential'
        ? { access_grants: {
          projects: grants.projects.filter(id => /^\d+$/.test(id)).map(Number),
          users: grants.users.filter(id => /^\d+$/.test(id)).map(Number),
          roles: grants.roles,
        } }
        : {};
      if (mode === 'content') {
        if (!title.trim() || !hasRichTextContent(body)) {
          setError('عنوان و متن یادداشت را کامل کنید.');
          setBusy(false);
          return;
        }
        await request('/dam/library', { method: 'POST', body: {
          title: title.trim(), body: sanitizeRichTextHtml(body), description, confidentiality,
          ...(canSetStatus ? { status } : {}), ...grantPayload,
          tags: tagList, folder_id: folderId || null, category_id: categoryId || null,
          project_id: context?.project_id || (projectId ? Number(projectId) : null),
          task_id: context?.task_id || (taskId ? Number(taskId) : null),
          department_id: context?.department_id || (departmentId ? Number(departmentId) : null),
          content_id: context?.content_id || (contentId ? Number(contentId) : null),
          idea_id: context?.idea_id || null,
          meeting_id: context?.meeting_id || null,
        } });
        onSuccess('محتوای متنی در مخزن مرکزی ذخیره شد.');
        return;
      }
      if (!queue.length) { setError('ابتدا یک یا چند فایل انتخاب کنید.'); setBusy(false); return; }
      const outcomes: string[] = [];
      const failed: QueueItem[] = [];
      const folderCache = new Map<string, number>();
      for (const item of queue) {
        try {
          const relativePath = (item.file as File & { webkitRelativePath?: string }).webkitRelativePath || '';
          const segments = relativePath ? relativePath.split('/').slice(0, -1) : [];
          const targetFolder = segments.length ? await ensureFolders(segments, folderCache) : (folderId ? Number(folderId) : null);
          const form = new FormData();
          form.append('file', item.file);
          const baseTitle = title.trim();
          form.append('title', item.displayTitle.trim() || (baseTitle ? (queue.length > 1 ? `${baseTitle} - ${item.file.name}` : baseTitle) : item.file.name));
          form.append('description', description);
          form.append('confidentiality', confidentiality);
          if (canSetStatus) form.append('status', status);
          if (item.duplicateAction) {
            form.append('duplicate_action', item.duplicateAction);
            if (item.duplicate) form.append('duplicate_asset_id', String(item.duplicate.assetId));
          }
          if (confidentiality === 'confidential') {
            grants.projects.filter(id => /^\d+$/.test(id)).forEach((id, index) => form.append(`access_grants[projects][${index}]`, id));
            grants.users.filter(id => /^\d+$/.test(id)).forEach((id, index) => form.append(`access_grants[users][${index}]`, id));
            grants.roles.forEach((key, index) => form.append(`access_grants[roles][${index}]`, key));
          }
          if (targetFolder) form.append('folder_id', String(targetFolder));
          if (categoryId) form.append('category_id', categoryId);
          tagList.forEach((tag, index) => form.append(`tags[${index}]`, tag));
          const relations = {
            project_id: context?.project_id || projectId,
            task_id: context?.task_id || taskId,
            department_id: context?.department_id || departmentId,
            content_id: context?.content_id || contentId,
            idea_id: context?.idea_id,
            meeting_id: context?.meeting_id,
          };
          Object.entries(relations).forEach(([key, value]) => { if (value) form.append(key, String(value)); });
          await uploadOne(form, item, progress => setQueue(previous => previous.map(file => file.id === item.id ? { ...file, progress } : file)));
          outcomes.push(`${item.file.name}: ثبت شد`);
        } catch (e) {
          const message = getError(e);
          const duplicate = (e as Error & { duplicate?: { assetId: number; title: string } }).duplicate;
          outcomes.push(`${item.file.name}: ${message}`);
          failed.push({ ...item, progress: 0, error: message, duplicate: duplicate || item.duplicate });
        }
        setResults([...outcomes]);
      }
      setQueue(failed);
      if (outcomes.length && failed.length === 0) onSuccess(`${outcomes.length.toLocaleString('fa-IR')} فایل با موفقیت در مخزن ثبت شد.`, false);
      else if (failed.length) setError(`${failed.length.toLocaleString('fa-IR')} فایل ناموفق ماند؛ موارد ناموفق برای تلاش مجدد در صف باقی مانده‌اند.`);
    } catch (e) { setError(getError(e)); }
    finally { setBusy(false); }
  };

  return <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-slate-950/45 p-3 backdrop-blur-sm sm:p-5">
    <form onSubmit={submit} className="my-auto flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-5 py-4"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white"><Upload className="h-5 w-5" /></span><div><h2 className="text-sm font-black text-slate-900">درگاه ثبت دارایی</h2><p className="mt-0.5 text-[11px] text-slate-500">ثبت فایل یا ایجاد محتوای پایدار در مخزن مرکزی</p></div></div><button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-700" aria-label="بستن"><X className="h-5 w-5" /></button></div>
      <div className="flex gap-2 border-b border-slate-100 px-5 pt-4"><button type="button" onClick={() => setMode('file')} className={`rounded-t-xl px-4 py-2.5 text-xs font-bold ${mode === 'file' ? 'border-b-2 border-indigo-600 text-indigo-700' : 'text-slate-500'}`}><Upload className="ml-1.5 inline h-4 w-4" />آپلود فایل</button><button type="button" onClick={() => setMode('content')} className={`rounded-t-xl px-4 py-2.5 text-xs font-bold ${mode === 'content' ? 'border-b-2 border-indigo-600 text-indigo-700' : 'text-slate-500'}`}><FileText className="ml-1.5 inline h-4 w-4" />ثبت محتوای متنی</button></div>
      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        {context && <div className="rounded-xl bg-indigo-50 px-3 py-2 text-[11px] text-indigo-800">این دارایی هنگام ثبت به زمینه فعلی متصل می‌شود؛ نیازی به ورود دوباره اطلاعات ارتباط نیست.</div>}
        {mode === 'file' ? <>
          <label onDragOver={event => { event.preventDefault(); }} onDrop={event => { event.preventDefault(); addFiles(event.dataTransfer.files); }} className="block cursor-pointer rounded-2xl border-2 border-dashed border-indigo-200 bg-indigo-50/40 p-6 text-center transition hover:border-indigo-400 hover:bg-indigo-50"><input type="file" multiple onChange={event => addFiles(event.target.files)} className="hidden" /><span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-white text-indigo-600 shadow-sm"><Upload className="h-5 w-5" /></span><span className="mt-3 block text-xs font-bold text-slate-800">فایل‌ها را انتخاب کنید یا اینجا بکشید</span><span className="mt-1 block text-[10px] text-slate-500">حداکثر اندازه هر فایل ۲۰ مگابایت • بارگذاری خصوصی</span></label>
          <label className="flex cursor-pointer items-center gap-2 text-[11px] font-bold text-indigo-700"><input type="file" multiple onChange={event => addFiles(event.target.files)} {...({ webkitdirectory: '', directory: '' } as Record<string, string>)} className="max-w-52 text-[10px]" />انتخاب پوشه (مرورگر پشتیبانی‌شده)</label>
          {!!queue.length && <div className="space-y-2"><div className="flex items-center justify-between text-[11px] font-bold text-slate-600"><span>صف بارگذاری</span><span>{queue.length.toLocaleString('fa-IR')} فایل</span></div>{queue.map(item => <div key={item.id} className="rounded-xl border border-slate-100 bg-slate-50 p-2.5"><div className="flex items-center gap-2"><File className="h-4 w-4 shrink-0 text-indigo-500" /><span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-slate-700">{(item.file as File & { webkitRelativePath?: string }).webkitRelativePath || item.file.name}</span><span className="text-[10px] text-slate-400">{formatSize(item.file.size)}</span><button type="button" onClick={() => setQueue(current => current.filter(file => file.id !== item.id))} className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="حذف از صف"><X className="h-3.5 w-3.5" /></button></div><label className="mt-2 block text-[10px] font-bold text-slate-500">نام نمایشی فایل <span className="font-normal text-slate-400">(مستقل از نام فایل اصلی)</span><input value={item.displayTitle} disabled={busy} onChange={event => setQueue(current => current.map(row => row.id === item.id ? { ...row, displayTitle: event.target.value } : row))} maxLength={255} placeholder={item.file.name} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[11px] outline-none focus:border-indigo-400 disabled:bg-slate-100" /></label><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200"><div className={`h-full rounded-full transition-all ${item.error ? 'bg-rose-500' : 'bg-indigo-600'}`} style={{ width: `${item.progress}%` }} /></div>{item.error && <p className="mt-1 text-[10px] text-rose-600">{item.error}</p>}{item.duplicate && <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[10px] text-amber-900"><p>فایل مشابه قابل مشاهده است: <strong>{item.duplicate.title}</strong></p><div className="mt-2 flex flex-wrap gap-1"><button type="button" onClick={() => setQueue(current => current.map(row => row.id === item.id ? { ...row, duplicateAction: 'reuse', error: undefined } : row))} className="rounded bg-white px-2 py-1 font-bold">استفاده از فایل موجود</button>{hasPermission('assets.create_version') && <button type="button" onClick={() => setQueue(current => current.map(row => row.id === item.id ? { ...row, duplicateAction: 'new_version', error: undefined } : row))} className="rounded bg-white px-2 py-1 font-bold">ثبت به عنوان نسخه جدید</button>}<button type="button" onClick={() => setQueue(current => current.filter(row => row.id !== item.id))} className="rounded bg-white px-2 py-1 font-bold">لغو</button><button type="button" onClick={() => setQueue(current => current.map(row => row.id === item.id ? { ...row, duplicateAction: 'create', error: undefined } : row))} className="rounded bg-white px-2 py-1 font-bold text-slate-500">ایجاد دارایی جدا</button></div></div>}</div>)}</div>}
        </> : <>
          <label className="block text-[11px] font-bold text-slate-600">عنوان محتوا<input required value={title} onChange={event => setTitle(event.target.value)} placeholder="برای نمونه: روایت تاریخچه سازمان" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs outline-none focus:border-indigo-400" /></label>
          <RichTextEditor
            value={body}
            onChange={setBody}
            disabled={busy}
            label="متن یادداشت"
            placeholder="متن محتوا را اینجا بنویسید…"
            minHeight={240}
          />
        </>}
        <div className="grid gap-3 sm:grid-cols-2">{mode === 'file' && <label className="block text-[11px] font-bold text-slate-600">عنوان نمایشی<span className="font-normal text-slate-400"> (اختیاری؛ نام فایل به‌صورت پیش‌فرض)</span><input value={title} onChange={event => setTitle(event.target.value)} placeholder="عنوان دارایی" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs outline-none focus:border-indigo-400" /></label>}<label className="block text-[11px] font-bold text-slate-600">دسته‌بندی<select value={categoryId} onChange={event => setCategoryId(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs"><option value="">بدون دسته‌بندی</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label></div>
        <label className="block text-[11px] font-bold text-slate-600">توضیحات<textarea value={description} onChange={event => setDescription(event.target.value)} rows={2} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs outline-none focus:border-indigo-400" /></label>
        <div className="grid gap-3 sm:grid-cols-3"><label className="block text-[11px] font-bold text-slate-600">پوشه<select value={folderId} onChange={event => setFolderId(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs"><option value="">ریشه / بدون پوشه</option>{folders.map(folder => <option key={folder.id} value={folder.id}>{folderLabelOf(folder.id)}</option>)}</select></label><label className="block text-[11px] font-bold text-slate-600">سطح دسترسی<select value={confidentiality} onChange={event => setConfidentiality(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs">{ACCESS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label className="block text-[11px] font-bold text-slate-600">وضعیت<select disabled={!canSetStatus} value={status} onChange={event => setStatus(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs disabled:bg-slate-50">{(statusOptions.length ? statusOptions : Object.entries(STATUS_LABELS).map(([id, label]) => ({ id, label }))).filter((option, index) => canSetStatus || index === 0).map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label></div>
        {confidentiality === 'confidential' && <div className="space-y-2 rounded-2xl border border-rose-200 bg-white p-3"><p className="flex items-center gap-1.5 text-[11px] font-black text-slate-800"><LockKeyhole className="h-4 w-4 text-rose-500" />دسترسی مجوزدار: انتخاب پروژه‌ها، اشخاص و نقش‌های مجاز</p><p className="text-[10px] leading-5 text-slate-500">علاوه بر مالک و مدیر سامانه، فقط موارد انتخاب‌شده می‌توانند این دارایی را ببینند. اگر چیزی انتخاب نکنید، فقط مالک و مدیر دسترسی دارند.</p><AccessGrantsSelector projects={projects} value={grants} onChange={setGrants} /></div>}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><label className="block text-[11px] font-bold text-slate-600">پروژه<select disabled={Boolean(context?.project_id)} value={projectId} onChange={event => { setProjectId(event.target.value); setTaskId(''); }} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs disabled:bg-slate-50"><option value="">بدون ارتباط</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><label className="block text-[11px] font-bold text-slate-600">وظیفه<select disabled={Boolean(context?.task_id)} value={taskId} onChange={event => { const value = event.target.value; setTaskId(value); const task = tasks.find(item => String(item.id) === value); if (task?.projectId) setProjectId(String(task.projectId)); }} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs disabled:bg-slate-50"><option value="">بدون ارتباط</option>{tasks.filter(task => !projectId || String(task.projectId) === projectId).map(task => <option key={task.id} value={task.id}>{task.title}</option>)}</select></label><label className="block text-[11px] font-bold text-slate-600">دپارتمان<select disabled={Boolean(context?.department_id)} value={departmentId} onChange={event => setDepartmentId(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs disabled:bg-slate-50"><option value="">دپارتمان پیش‌فرض من</option>{departments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label><label className="block text-[11px] font-bold text-slate-600">محتوا<select disabled={Boolean(context?.content_id)} value={contentId} onChange={event => setContentId(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs disabled:bg-slate-50"><option value="">بدون ارتباط</option>{contents.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label></div>
        <label className="block text-[11px] font-bold text-slate-600">برچسب‌ها<input value={tags} onChange={event => setTags(event.target.value)} placeholder="با ویرگول جدا کنید" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs outline-none focus:border-indigo-400" /><Tag className="ml-1 mt-1 inline h-3 w-3 text-slate-400" /><span className="text-[10px] font-normal text-slate-400">جست‌وجو بر اساس برچسب در دسترس است.</span></label>
        {!!results.length && <div className="space-y-1 rounded-xl bg-slate-50 p-3 text-[10px] text-slate-600">{results.map((result, index) => <p key={index}>{result}</p>)}</div>}
        {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}
      </div>
      <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/70 px-5 py-3"><button data-button-action="cancel" type="button" onClick={onClose} className="ui-form-action rounded-xl px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-200">انصراف</button><button data-button-action="create" disabled={busy || (mode === 'file' && queue.length === 0) || (mode === 'content' && (!title.trim() || !hasRichTextContent(body)))} className="ui-form-action inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{busy ? 'در حال ثبت...' : mode === 'file' && queue.some(item => item.error) ? 'تلاش مجدد برای ناموفق‌ها' : 'ثبت دارایی'}</button></div>
    </form>
  </div>;
};

const AssetDetails: React.FC<{
  asset: Asset; folders: FolderRecord[]; folderLabel: (id: number | null | undefined) => string; categories: Category[];
  projects: ProjectOption[]; statusOptions: { id: string; label: string }[];
  statusLabel: (id: string) => string; hasPermission: (key: string) => boolean; canReadLinkedContent: boolean; busy: boolean;
  onClose: () => void; onUpdate: (asset: Asset, changes: Record<string, unknown>) => void; onMove: (asset: Asset) => void;
  onReplace: (asset: Asset) => void; onRestore: (asset: Asset, version: DamVersion) => void; onDelete: (asset: Asset) => void;
}> = ({ asset, categories, projects, statusOptions, statusLabel, hasPermission, canReadLinkedContent, busy, onClose, onUpdate, onMove, onReplace, onRestore, onDelete }) => {
  const [revisionFile, setRevisionFile] = useState<File | null>(null);
  const [revisionBody, setRevisionBody] = useState(asset.content_item?.content_body || '');
  const [revisionNote, setRevisionNote] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState('');
  const [textViewerOpen, setTextViewerOpen] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<{ percent: number; loaded: number } | null>(null);
  const [temporaryLinks, setTemporaryLinks] = useState<Record<'preview' | 'download', string | undefined>>({ preview: undefined, download: undefined });
  const [temporaryLinkBusy, setTemporaryLinkBusy] = useState<'preview' | 'download' | null>(null);
  const { notify, setSelectedTaskId, setSelectedContentId, setSelectedProjectId, setSelectedIdeaId, setSelectedMeetingId, setActiveView } = useApp();
  const [grants, setGrants] = useState<AccessGrantsSelection>({
    projects: (asset.access_grants?.projects || []).map(String),
    users: (asset.access_grants?.users || []).map(String),
    roles: asset.access_grants?.roles || [],
  });
  const canRevise = hasPermission(asset.type === 'file' ? 'assets.create_version' : 'assets.edit_info');

  const createVersion = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setLocalError('');
    try {
      const form = new FormData();
      if (asset.type === 'file') { if (!revisionFile) throw new Error('فایل نسخه جدید را انتخاب کنید.'); form.append('file', revisionFile); }
      else {
        if (!hasRichTextContent(revisionBody)) throw new Error('متن نسخه جدید نمی‌تواند خالی باشد.');
        form.append('body', sanitizeRichTextHtml(revisionBody));
      }
      form.append('change_description', revisionNote);
      await request(`/dam/library/${asset.id}/versions`, { method: 'POST', body: form });
      const result = await request<ApiResponse<Asset>>(`/dam/library/${asset.id}`);
      onReplace(result.data);
      setRevisionFile(null); setRevisionNote(''); setEditing(false);
    } catch (e) { setLocalError(getError(e)); }
    finally { setSaving(false); }
  };

  const secureDownload = async () => {
    if (downloadProgress) return;
    setDownloadProgress({ percent: 0, loaded: 0 });
    try {
      await downloadAssetOnce(asset, (percent, loaded) => setDownloadProgress({ percent, loaded }));
      notify({ type: 'success', title: 'دانلود کامل شد', message: 'فایل بدون درخواست دانلود دوم از دادهٔ موقت مرورگر ذخیره شد.' });
    } catch (error) { notify({ type: 'error', title: 'دانلود ناموفق بود', message: getError(error) }); }
    finally { window.setTimeout(() => setDownloadProgress(null), 1000); }
  };
  const createTemporaryLink = async (mode: 'preview' | 'download') => {
    if (temporaryLinkBusy) return;
    setTemporaryLinkBusy(mode);
    try {
      const result = await request<{ data: { url: string; expires_at: string } }>(`/dam/library/${asset.id}/temporary-link`, { method: 'POST', body: { mode } });
      setTemporaryLinks(current => ({ ...current, [mode]: result.data.url }));
      await navigator.clipboard.writeText(result.data.url);
      notify({ type: 'success', title: 'پیوند موقت کپی شد', message: 'این پیوند دو ساعت اعتبار دارد.' });
    } catch (error) { notify({ type: 'error', title: 'ساخت پیوند موقت ناموفق بود', message: getError(error) }); }
    finally { setTemporaryLinkBusy(null); }
  };
  const createCategory = async () => {
    const name = window.prompt('نام دسته‌بندی جدید را وارد کنید:')?.trim();
    if (!name) return;
    try {
      const result = await request<ApiResponse<Category>>('/dam/library/categories', { method: 'POST', body: { name } });
      onUpdate(asset, { category_id: result.data.id });
      notify({ type: 'success', title: 'دسته‌بندی ساخته و روی دارایی اعمال شد' });
    } catch (error) { notify({ type: 'error', title: 'ساخت دسته‌بندی ناموفق بود', message: getError(error) }); }
  };
  const openRelation = (relation: NonNullable<Asset['used_in']>[number]) => {
    const id = String(relation.id);
    if (relation.type === 'task') setSelectedTaskId(id);
    else if (relation.type === 'content') { setSelectedContentId(id); setActiveView('content-detail'); }
    else if (relation.type === 'project') { setSelectedProjectId(id); setActiveView('project-detail'); }
    else if (relation.type === 'idea') { setSelectedIdeaId(id); setActiveView('thought-room'); }
    else if (relation.type === 'meeting') { setSelectedMeetingId(id); setActiveView('thought-room'); }
    else return;
    onClose();
  };
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 p-3 backdrop-blur-sm sm:p-6" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-label={`پیش‌نمایش ${asset.title}`} className="flex max-h-[94dvh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4"><div className="flex min-w-0 items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">{asset.type === 'content' ? <FileText className="h-5 w-5" /> : <File className="h-5 w-5" />}</span><div className="min-w-0"><p className="text-[10px] font-bold text-indigo-600">پیش‌نمایش و شناسنامه دارایی #{asset.id.toLocaleString('fa-IR')}</p><h2 className="truncate text-sm font-black text-slate-900">{asset.title}</h2></div></div><button onClick={onClose} aria-label="بستن پیش‌نمایش" title="بستن" className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button></div>
      <div className="mx-auto w-full max-w-5xl flex-1 space-y-5 overflow-y-auto p-5">
        {busy && <p className="text-xs text-slate-400">در حال به‌روزرسانی...</p>}
        {asset.type === 'content' ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-violet-100 bg-violet-50/40 p-4"><div className="min-w-0"><p className="text-xs font-black text-slate-800">دارایی متنی</p><p className="mt-1 text-[10px] text-slate-500">متن را تمام‌صفحه ببینید یا در قالب مورد نیاز دریافت کنید.</p></div><TextAssetActions title={asset.title} html={asset.content_item?.content_body || ''} onView={() => setTextViewerOpen(true)} canDownload={hasPermission('assets.download') || canReadLinkedContent} /></div> : <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3"><FileText className="h-4 w-4 text-indigo-500" /><span className="min-w-0 flex-1 truncate text-xs font-bold text-slate-700">{asset.latest_file?.original_filename || 'فایل'}</span><span className="text-[10px] text-slate-500">{formatSize(asset.latest_file?.file_size)}</span>{(hasPermission('assets.download') || canReadLinkedContent) && <button type="button" onClick={() => void secureDownload()} disabled={Boolean(downloadProgress)} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-[10px] font-bold text-white hover:bg-indigo-700 disabled:opacity-60"><Download className="h-3.5 w-3.5" />{downloadProgress ? `${downloadProgress.percent.toLocaleString('fa-IR')}٪ · ${(downloadProgress.loaded / 1048576).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} MB` : 'دانلود امن'}</button>}</div>}
        {asset.type === 'file' && (hasPermission('assets.preview') || canReadLinkedContent) && asset.latest_file?.mime_type && <AssetPreview file={asset.latest_file} assetId={asset.id} />}
        {asset.type === 'file' && <section className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-3"><div className="flex items-center gap-2"><Link2 className="h-4 w-4 text-indigo-600" /><div className="flex-1"><h3 className="text-[11px] font-black text-slate-800">پیوند موقت قابل اشتراک</h3><p className="mt-0.5 text-[9px] text-slate-500">پیوند پس از دو ساعت منقضی می‌شود و مسیر فایل روی هاست را افشا نمی‌کند.</p></div></div><div className="mt-2 flex flex-wrap gap-2">{(hasPermission('assets.preview') || canReadLinkedContent) && <button type="button" disabled={temporaryLinkBusy !== null} aria-busy={temporaryLinkBusy === 'preview'} onClick={() => void createTemporaryLink('preview')} className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-[10px] font-bold text-indigo-700 disabled:opacity-60">{temporaryLinkBusy === 'preview' ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}{temporaryLinkBusy === 'preview' ? 'در حال ساخت پیوند…' : 'ساخت و کپی پیوند پیش‌نمایش'}</button>}{(hasPermission('assets.download') || canReadLinkedContent) && <button type="button" disabled={temporaryLinkBusy !== null} aria-busy={temporaryLinkBusy === 'download'} onClick={() => void createTemporaryLink('download')} className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 text-[10px] font-bold text-emerald-700 disabled:opacity-60">{temporaryLinkBusy === 'download' ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}{temporaryLinkBusy === 'download' ? 'در حال ساخت پیوند…' : 'ساخت و کپی پیوند دانلود'}</button>}</div>{(temporaryLinks.preview || temporaryLinks.download) && <div dir="ltr" className="mt-2 space-y-1 text-left text-[9px] text-slate-500">{temporaryLinks.preview && <p className="truncate">Preview: {temporaryLinks.preview}</p>}{temporaryLinks.download && <p className="truncate">Download: {temporaryLinks.download}</p>}</div>}</section>}
        {asset.description && <p className="text-xs leading-6 text-slate-600">{asset.description}</p>}
        <section className="grid grid-cols-2 gap-2 sm:grid-cols-3"><Info label="وضعیت" value={statusLabel(asset.status)} /><Info label="سطح دسترسی" value={PRIVACY_LABELS[asset.confidentiality] || asset.confidentiality} /><Info label="مالک" value={asset.owner?.name || '—'} /><Info label="دسته‌بندی" value={asset.category?.name || '—'} /><Info label="تاریخ ایجاد" value={formatDate(asset.created_at)} /><Info label="آخرین تغییر" value={formatDate(asset.updated_at)} /></section>
        {asset.confidentiality === 'internal' && <p className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-[10px] leading-5 text-blue-800">«داخلی» یعنی دارایی فقط برای کاربران فعال سازمان که مجوز مشاهده مخزن را دارند قابل مشاهده است؛ صرفاً عضو بودن در محتوای مرتبط دسترسی ایجاد نمی‌کند.</p>}
        {asset.type === 'file' && asset.latest_file && <section className="rounded-2xl border border-slate-200 p-3"><h3 className="mb-2 text-[11px] font-black text-slate-700">اطلاعات فنی فایل</h3><div className="grid grid-cols-2 gap-2 text-[10px] text-slate-500"><span>نوع: {asset.latest_file.mime_type || 'نامشخص'}</span><span>پسوند: {asset.latest_file.extension || '—'}</span><span>اندازه: {formatSize(asset.latest_file.file_size)}</span><span>SHA-256: {asset.latest_file.checksum || 'محرمانه'}</span></div></section>}
        {(asset.latest_file?.storage_path || asset.storage_root) && <section className="rounded-2xl border border-amber-200 bg-amber-50/50 p-3"><h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-black text-slate-700"><HardDrive className="h-4 w-4 text-amber-500" />آدرس فایل روی هاست <span className="font-normal text-slate-400">(فقط مدیر کل سامانه)</span></h3><div className="space-y-1.5 text-[10px] text-slate-600"><p dir="ltr" className="break-all rounded-lg bg-white px-2.5 py-2 font-mono text-left">{[asset.storage_root, asset.latest_file?.storage_path].filter(Boolean).join('/') || '—'}</p><div className="flex flex-wrap gap-x-4 gap-y-1"><span>نام ذخیره‌شده: <bdi className="font-mono">{asset.latest_file?.stored_filename || '—'}</bdi></span><span>دیسک: <bdi className="font-mono">{asset.latest_file?.storage_disk || '—'}</bdi></span></div></div></section>}
        {!!asset.tags?.length && <div className="flex flex-wrap gap-1.5">{asset.tags.map(tag => <span key={tag.id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] text-slate-600"><Tag className="h-3 w-3" />{tag.name}</span>)}</div>}
        {asset.used_in?.length ? <section className="rounded-2xl border border-slate-200 p-3"><h3 className="mb-2 text-[11px] font-black text-slate-700">استفاده شده در ({(asset.used_in_count || asset.used_in.length).toLocaleString('fa-IR')} ارتباط)</h3><div className="space-y-2">{asset.used_in.map((relation, i) => <div key={`${relation.type}-${relation.id}-${relation.relationRole}-${i}`} className="flex items-center gap-3 rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-[10px] text-indigo-800"><div className="min-w-0 flex-1"><strong className="block truncate">{relation.label}</strong><div className="mt-1 flex flex-wrap gap-1.5 text-[9px] text-indigo-600"><span>{relation.relationRole}</span>{relation.stageLabel && <span>• مرحله {relation.stageLabel}</span>}{relation.outputId && <span>• خروجی {relation.outputId}</span>}{relation.assetVersionId && <span>• نسخه ثبت‌شده #{relation.assetVersionId.toLocaleString('fa-IR')}</span>}</div></div>{['idea', 'meeting', 'task', 'content', 'project'].includes(relation.type) && <button type="button" onClick={() => openRelation(relation)} className="shrink-0 rounded-lg bg-white px-2.5 py-1.5 font-bold text-indigo-700 shadow-sm hover:bg-indigo-100">مشاهده</button>}</div>)}</div></section> : <section className="rounded-2xl border border-dashed border-slate-200 p-3 text-[10px] text-slate-400">این دارایی هنوز ارتباط فعالی با محتوا، وظیفه، پروژه یا دپارتمان ندارد.</section>}
        <div className="grid gap-2 sm:grid-cols-2">
        {hasPermission('assets.move') && <div className="block text-[11px] font-bold text-slate-600">انتقال به پوشه<button type="button" onClick={() => onMove(asset)} className="mt-1.5 flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-indigo-700 hover:bg-indigo-50"><span className="truncate">{asset.folder?.name || 'ریشه مخزن'}</span><Move className="h-4 w-4" /></button></div>}
        {hasPermission('assets.edit_info') && <label className="block text-[11px] font-bold text-slate-600">دسته‌بندی<div className="mt-1.5 flex gap-1.5"><select value={asset.category_id || ''} onChange={event => onUpdate(asset, { category_id: event.target.value ? Number(event.target.value) : null })} className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs"><option value="">بدون دسته‌بندی</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select>{hasPermission('assets.manage_access') && <button type="button" onClick={() => void createCategory()} title="ساخت دسته‌بندی" className="rounded-xl border border-slate-200 bg-white px-3 text-indigo-600 hover:bg-indigo-50"><Plus className="h-4 w-4" /></button>}</div></label>}
        </div>
        {hasPermission('assets.manage_access') && <div className="grid gap-2 sm:grid-cols-2"><label className="text-[11px] font-bold text-slate-600">تغییر وضعیت<select value={asset.status} onChange={event => onUpdate(asset, { status: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs">{(statusOptions.length ? statusOptions : Object.entries(STATUS_LABELS).map(([id, label]) => ({ id, label }))).map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label><label className="text-[11px] font-bold text-slate-600">سطح دسترسی<select value={asset.confidentiality} onChange={event => onUpdate(asset, { confidentiality: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs">{ACCESS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label></div>}
        {asset.confidentiality === 'confidential' && hasPermission('assets.manage_access') && <section className="space-y-2 rounded-2xl border border-rose-200 bg-rose-50/30 p-3"><div className="flex items-center justify-between"><h3 className="flex items-center gap-1.5 text-[11px] font-black text-slate-800"><Users className="h-4 w-4 text-rose-500" />دسترسی‌های مجاز این دارایی</h3><button onClick={() => onUpdate(asset, { access_grants: { projects: grants.projects.filter(id => /^\d+$/.test(id)).map(Number), users: grants.users.filter(id => /^\d+$/.test(id)).map(Number), roles: grants.roles } })} className="rounded-lg bg-rose-600 px-3 py-1.5 text-[10px] font-bold text-white hover:bg-rose-700">ذخیره دسترسی‌ها</button></div><AccessGrantsSelector projects={projects} value={grants} onChange={setGrants} /></section>}
        <section className="space-y-2"><div className="flex items-center justify-between"><h3 className="text-xs font-black text-slate-800">تاریخچه نسخه‌ها</h3>{canRevise && <button onClick={() => setEditing(value => !value)} className="rounded-lg border border-indigo-100 px-2.5 py-1.5 text-[10px] font-bold text-indigo-700 hover:bg-indigo-50">{editing ? 'بستن فرم' : 'ثبت نسخه جدید'}</button>}</div>{editing && <form onSubmit={createVersion} className="space-y-2 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3">{asset.type === 'file' ? <input type="file" required onChange={event => setRevisionFile(event.target.files?.[0] || null)} className="block w-full text-[11px]" /> : <RichTextEditor value={revisionBody} onChange={setRevisionBody} disabled={saving} label="متن نسخه جدید" placeholder="متن نسخه جدید را وارد کنید…" minHeight={180} />}<input value={revisionNote} onChange={event => setRevisionNote(event.target.value)} placeholder="شرح تغییر (اختیاری)" className="w-full rounded-lg border border-slate-200 p-2 text-xs" />{localError && <p className="text-[11px] text-rose-600">{localError}</p>}<button disabled={saving} className="rounded-lg bg-indigo-600 px-3 py-2 text-[10px] font-bold text-white disabled:opacity-50">{saving ? 'در حال ذخیره...' : 'ذخیره نسخه جدید'}</button></form>}
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-100">{(asset.versions || []).slice().sort((a, b) => b.version_number - a.version_number).map((version, index) => <div key={version.id} className="flex items-center gap-3 px-3 py-2.5"><span className={`flex h-8 w-8 items-center justify-center rounded-lg text-[10px] font-black ${index === 0 ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{version.version_number}</span><div className="min-w-0 flex-1"><p className="truncate text-[11px] font-bold text-slate-700">نسخه {version.version_number} {index === 0 ? '— نسخه جاری' : '— تاریخی'}</p><p className="mt-0.5 truncate text-[9px] text-slate-500">{version.file?.original_filename || (asset.type === 'content' ? 'نسخه متن' : 'فایل')} {version.file?.file_size ? `• ${formatSize(version.file.file_size)}` : ''}</p><p className="mt-0.5 text-[9px] text-slate-400">{version.creator?.name || 'کاربر نامشخص'} • {formatDate(version.created_at)}{version.change_description ? ` • ${version.change_description}` : ''}</p></div>{hasPermission('assets.restore') && index !== 0 && <button onClick={() => onRestore(asset, version)} className="rounded-lg px-2 py-1 text-[10px] font-bold text-indigo-600 hover:bg-indigo-50">بازیابی به‌عنوان نسخه جدید</button>}</div>)}</div>
        </section>
        <section className="space-y-2"><h3 className="text-xs font-black text-slate-800">فعالیت‌های دارایی</h3><div className="divide-y divide-slate-100 rounded-xl border border-slate-100">{(asset.activities || []).slice().reverse().slice(0, 12).map(activity => <div key={activity.id} className="flex items-center gap-2 px-3 py-2 text-[10px] text-slate-600"><Clock3 className="h-3.5 w-3.5 text-slate-400" /><span className="flex-1">{ACTIVITY_LABELS[activity.action] || activity.action}<span className="mr-1 text-slate-400">— {activity.actor?.name || 'سیستم'}</span></span><span className="text-slate-400">{formatDate(activity.created_at)}</span></div>)}{!asset.activities?.length && <p className="p-3 text-[10px] text-slate-400">فعالیتی ثبت نشده است.</p>}</div></section>
        {hasPermission('assets.delete') && <button onClick={() => onDelete(asset)} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-3 py-2 text-[11px] font-bold text-rose-600 hover:bg-rose-50"><Archive className="h-4 w-4" />بایگانی دارایی</button>}
      </div>
    </section>
    {asset.type === 'content' && <TextAssetViewer open={textViewerOpen} onClose={() => setTextViewerOpen(false)} title={asset.title} html={asset.content_item?.content_body || ''} canDownload={hasPermission('assets.download') || canReadLinkedContent} />}
  </div>;
};

const AssetPreview: React.FC<{ file: DamFile; assetId: number }> = ({ file, assetId }) => {
  const mime = (file.mime_type || '').toLowerCase();
  const src = `${apiConfig.baseUrl}/dam/library/${assetId}/preview`;
  if (mime.startsWith('image/') && mime !== 'image/svg+xml') return <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50"><img src={src} alt={file.original_filename} className="max-h-80 w-full object-contain" /></div>;
  if (mime.startsWith('audio/')) return <audio controls preload="none" src={src} className="w-full" />;
  if (mime.startsWith('video/')) return <video controls preload="metadata" src={src} className="max-h-80 w-full rounded-2xl bg-black" />;
  if (mime === 'application/pdf') return <iframe src={src} title={`پیش‌نمایش ${file.original_filename}`} className="h-80 w-full rounded-2xl border border-slate-200" />;
  if (mime === 'text/plain') return <a href={src} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-indigo-100 px-3 py-2 text-[10px] font-bold text-indigo-700 hover:bg-indigo-50"><FileText className="h-4 w-4" />نمایش متن</a>;
  return null;
};

const Info: React.FC<{ label: string; value: string }> = ({ label, value }) => <div className="rounded-xl bg-slate-50 p-2.5"><p className="text-[9px] text-slate-400">{label}</p><p className="mt-1 truncate text-[10px] font-bold text-slate-700">{value}</p></div>;
