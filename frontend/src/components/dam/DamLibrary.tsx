import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, Archive, ArrowDown, ArrowUp, Check, ChevronLeft, ChevronRight,
  Clock3, Download, File, FileText, Folder, FolderPlus, HardDrive, Image,
  LoaderCircle, LockKeyhole, MoreHorizontal, Plus, RefreshCw, Search, Shield,
  Tag, Trash2, Upload, Video, X,
} from 'lucide-react';
import { ApiResponse, apiConfig, request } from '../../api/client';
import { useApp } from '../../context/AppContext';

type AssetType = 'file' | 'content';
type Context = { project_id?: number; task_id?: number; department_id?: number };
type DamFile = {
  id: number; original_filename: string; extension?: string; mime_type?: string;
  file_size: number; checksum?: string; is_latest: boolean;
};
type DamVersion = {
  id: number; version_number: number; created_at: string;
  change_description?: string; created_by?: number; file_id?: number;
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
  folder_id?: number | null; category_id?: number | null;
  folder?: FolderRecord | null; category?: { id: number; name: string } | null;
  owner?: { id: number; name: string }; relations?: { related_type: string; related_id: number }[];
};
type FolderRecord = { id: number; name: string; parent_id: number | null; department_id?: number | null };
type Category = { id: number; name: string; parent_id?: number | null };
type Page<T> = { data: T[]; current_page: number; last_page: number; total: number };
type Summary = { total: number; files: number; contents: number; storage_bytes: number; folders: number };
type QueueItem = { id: string; file: File; progress: number; error?: string };
type ProjectOption = { id: string | number; name: string };
type TaskOption = { id: string | number; title: string; projectId?: string | number };
type DepartmentOption = { id: string | number; name: string };

const STATUS_LABELS: Record<string, string> = {
  draft: 'پیش‌نویس', review: 'در حال بررسی', approved: 'تأییدشده',
  published: 'منتشرشده', archived: 'بایگانی‌شده', rejected: 'ردشده',
};
const PRIVACY_LABELS: Record<string, string> = { public: 'عمومی', internal: 'داخلی', confidential: 'محرمانه' };
const ACTIVITY_LABELS: Record<string, string> = {
  created: 'ایجاد دارایی', updated: 'ویرایش مشخصات', moved: 'انتقال به پوشه', downloaded: 'دانلود فایل', previewed: 'پیش‌نمایش فایل',
  attached: 'اتصال به یک بخش', deleted: 'بایگانی', restored: 'بازیابی', version_created: 'ایجاد نسخه',
  version_restored: 'بازیابی نسخه', status_changed: 'تغییر وضعیت',
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

/** Universal DAM entry point. Supplying context binds new assets to that entity. */
export const DamLibrary: React.FC<{
  context?: Context;
  initialType?: 'all' | AssetType;
}> = ({ context, initialType = 'all' }) => {
  const { hasPermission } = useApp();
  const [items, setItems] = useState<Asset[]>([]);
  const [folders, setFolders] = useState<FolderRecord[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [tasks, setTasks] = useState<TaskOption[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [projectFilter, setProjectFilter] = useState('');
  const [taskFilter, setTaskFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [activities, setActivities] = useState<DamActivity[]>([]);
  const [query, setQuery] = useState(() => {
    const initialQuery = sessionStorage.getItem('dam-search-query') || '';
    sessionStorage.removeItem('dam-search-query');
    return initialQuery;
  });
  const [type, setType] = useState<'all' | AssetType>(initialType);
  const [status, setStatus] = useState('');
  const [confidentiality, setConfidentiality] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [folderId, setFolderId] = useState<number | null>(null);
  const [sort, setSort] = useState<'updated_at' | 'title'>('updated_at');
  const [direction, setDirection] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [activeView, setActiveView] = useState<'library' | 'activities'>('library');
  const [entryOpen, setEntryOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [folderDialog, setFolderDialog] = useState<{ mode: 'create' | 'rename'; folder?: FolderRecord } | null>(null);
  const [folderName, setFolderName] = useState('');
  const [attachItems, setAttachItems] = useState<Asset[]>([]);
  const [attachSearch, setAttachSearch] = useState('');
  const [attachBusy, setAttachBusy] = useState(false);
  const [selected, setSelected] = useState<Asset | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkFolderId, setBulkFolderId] = useState('');
  const [detailBusy, setDetailBusy] = useState(false);
  const [refreshIndex, setRefreshIndex] = useState(0);

  const refreshTaxonomy = useCallback(async () => {
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
  }, []);

  const refreshSummary = useCallback(async () => {
    try {
      const result = await request<ApiResponse<Summary>>('/dam/library/summary');
      setSummary(result.data);
    } catch {
      // The list itself remains usable if the optional summary is unavailable.
    }
  }, []);

  useEffect(() => { void refreshTaxonomy(); void refreshSummary(); }, [refreshTaxonomy, refreshSummary]);

  useEffect(() => {
    void Promise.allSettled([
      request<Page<ProjectOption>>('/projects?per_page=100'),
      request<Page<TaskOption>>('/tasks?per_page=100'),
      request<{ data: DepartmentOption[] }>('/departments'),
    ]).then(([projectResult, taskResult, departmentResult]) => {
      if (projectResult.status === 'fulfilled') setProjects(projectResult.value.data || []);
      if (taskResult.status === 'fulfilled') setTasks(taskResult.value.data || []);
      if (departmentResult.status === 'fulfilled') setDepartments(departmentResult.value.data || []);
    });
  }, []);

  useEffect(() => {
    if (activeView === 'activities') {
      setLoading(true);
      request<Page<DamActivity>>('/dam/library/activities')
        .then(result => setActivities(result.data))
        .catch(e => setError(getError(e)))
        .finally(() => setLoading(false));
      return;
    }

    const timer = window.setTimeout(() => {
      setLoading(true);
      setError('');
      const params = new URLSearchParams({ page: String(page), per_page: '20', sort, direction });
      if (query.trim()) params.set('search', query.trim());
      if (type !== 'all') params.set('type', type);
      if (status) params.set('status', status);
      if (confidentiality) params.set('confidentiality', confidentiality);
      if (categoryId) params.set('category_id', categoryId);
      if (projectFilter) params.set('project_id', projectFilter);
      if (taskFilter) params.set('task_id', taskFilter);
      if (departmentFilter) params.set('department_id', departmentFilter);
      if (folderId !== null) params.set('folder_id', String(folderId || 0));
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
    }, query ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [activeView, query, type, status, confidentiality, categoryId, projectFilter, taskFilter, departmentFilter, folderId, page, sort, direction,
    context?.project_id, context?.task_id, context?.department_id, refreshIndex]);

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

  const reload = () => { void refreshSummary(); setRefreshIndex(value => value + 1); };
  const openAsset = async (asset: Asset) => {
    setDetailBusy(true);
    setError('');
    try {
      const result = await request<ApiResponse<Asset>>(`/dam/library/${asset.id}`);
      setSelected(result.data);
    } catch (e) { setError(getError(e)); }
    finally { setDetailBusy(false); }
  };

  const createFolder = () => { setFolderName(''); setFolderDialog({ mode: 'create' }); };

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

  const saveFolder = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = folderName.trim();
    if (!name || !folderDialog) return;
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
    } catch (e) { setError(getError(e)); }
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

  const moveSelected = async () => {
    if (!selectedIds.length) return;
    try {
      await request('/dam/library/bulk/move', {
        method: 'POST', body: { ids: selectedIds, folder_id: bulkFolderId ? Number(bulkFolderId) : null },
      });
      setToast(`${selectedIds.length} دارایی به پوشه انتخاب‌شده منتقل شد.`);
      setSelectedIds([]);
      setBulkFolderId('');
      setPage(1);
      reload();
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
          {context && hasPermission('assets.edit_info') && <button onClick={() => void openAttachExisting()} className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-white px-3.5 py-2.5 text-xs font-bold text-indigo-700 transition hover:bg-indigo-50"><Plus className="h-4 w-4" /> اتصال دارایی موجود</button>}
          {hasPermission('assets.upload') && <button onClick={() => setEntryOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-indigo-700"><Plus className="h-4 w-4" /> ثبت دارایی جدید</button>}
          {hasPermission('assets.upload') && <button onClick={createFolder} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50"><FolderPlus className="h-4 w-4 text-amber-500" /> پوشه جدید</button>}
        </div>
      </header>

      {!context && <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric icon={<File className="h-4 w-4" />} label="کل دارایی‌ها" value={summary?.total} color="indigo" />
        <Metric icon={<Image className="h-4 w-4" />} label="فایل‌ها" value={summary?.files} color="blue" />
        <Metric icon={<FileText className="h-4 w-4" />} label="محتوای متنی" value={summary?.contents} color="violet" />
        <Metric icon={<HardDrive className="h-4 w-4" />} label="فضای مصرف‌شده" value={summary ? formatSize(summary.storage_bytes) : '—'} color="amber" />
      </div>}

      {context && <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-indigo-100 bg-indigo-50/70 px-4 py-3 text-xs text-indigo-900">
        <Shield className="h-4 w-4 text-indigo-600" /><span className="font-bold">ثبت در بستر فعلی</span>
        {context.project_id && <span className="rounded-full bg-white px-2.5 py-1">پروژه #{context.project_id}</span>}
        {context.task_id && <span className="rounded-full bg-white px-2.5 py-1">وظیفه #{context.task_id}</span>}
        {context.department_id && <span className="rounded-full bg-white px-2.5 py-1">دپارتمان #{context.department_id}</span>}
        <span className="text-indigo-700">ارتباط هنگام ثبت به‌صورت خودکار اعمال می‌شود.</span>
      </div>}

      <div className="grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="space-y-4 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between px-2 py-1">
            <h2 className="text-xs font-black text-slate-800">مخزن دارایی‌ها</h2>
            <button onClick={() => { setFolderId(null); setPage(1); }} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="به‌روزرسانی فهرست"><RefreshCw className="h-3.5 w-3.5" /></button>
          </div>
          <button onClick={() => { setActiveView('library'); setType('all'); setFolderId(null); setPage(1); }} className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-right text-xs font-bold ${activeView === 'library' && type === 'all' && folderId === null ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}>
            <HardDrive className="h-4 w-4" /> همه دارایی‌ها <span className="mr-auto text-[10px] text-slate-400">{summary?.total ?? ''}</span>
          </button>
          <button onClick={() => { setActiveView('library'); setType('file'); setFolderId(null); setPage(1); }} className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-right text-xs font-bold ${type === 'file' && activeView === 'library' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}><File className="h-4 w-4" /> فایل‌ها</button>
          <button onClick={() => { setActiveView('library'); setType('content'); setFolderId(null); setPage(1); }} className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-right text-xs font-bold ${type === 'content' && activeView === 'library' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}><FileText className="h-4 w-4" /> محتوای متنی</button>
          <button onClick={() => setActiveView('activities')} className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-right text-xs font-bold ${activeView === 'activities' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}><Activity className="h-4 w-4" /> تاریخچه فعالیت‌ها</button>

          <div className="border-t border-slate-100 pt-3">
            <div className="mb-2 flex items-center justify-between px-2"><h3 className="text-[11px] font-black text-slate-500">پوشه‌ها</h3><span className="text-[10px] text-slate-400">{folders.length}</span></div>
            <div className="max-h-[420px] space-y-0.5 overflow-y-auto">
              <button onClick={() => { setActiveView('library'); setType('all'); setFolderId(0); setPage(1); }} className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-right text-xs ${folderId === 0 ? 'bg-amber-50 font-bold text-amber-800' : 'text-slate-600 hover:bg-slate-50'}`}><Folder className="h-4 w-4 text-amber-500" /> بدون پوشه / ریشه</button>
              {folders.filter(folder => folder.parent_id === null).map(folder => <FolderTree key={folder.id} folder={folder} all={folders} currentId={folderId} onSelect={id => { setActiveView('library'); setType('all'); setFolderId(id); setPage(1); }} onRename={renameFolder} canRename={hasPermission('assets.rename')} />)}
              {!folders.length && <p className="px-3 py-2 text-[11px] text-slate-400">هنوز پوشه‌ای ایجاد نشده است.</p>}
            </div>
          </div>
        </aside>

        <div className="min-w-0 space-y-3">
          {activeView === 'library' ? <>
            <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1 text-xs text-slate-500">
                  <button onClick={() => { setFolderId(null); setPage(1); }} className="shrink-0 hover:text-indigo-600">مخزن</button>
                  {folderPath.map(folder => <React.Fragment key={folder.id}><ChevronLeft className="h-3.5 w-3.5 shrink-0" /><button onClick={() => { setFolderId(folder.id); setPage(1); }} className="max-w-32 truncate font-bold text-slate-800 hover:text-indigo-600">{folder.name}</button></React.Fragment>)}
                  {folderPath.length === 0 && <><ChevronLeft className="h-3.5 w-3.5" /><span className="font-bold text-slate-800">{folderId === 0 ? 'بدون پوشه / ریشه' : 'همه دارایی‌ها'}</span></>}
                </div>
                <span className="text-[11px] text-slate-400">{total.toLocaleString('fa-IR')} مورد</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                <label className="relative block sm:col-span-2"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} placeholder="جست‌وجوی عنوان، توضیح، برچسب یا متن..." className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pr-9 pl-3 text-xs outline-none transition focus:border-indigo-400 focus:bg-white" /></label>
                <div className="flex gap-1"><select value={categoryId} onChange={event => { setCategoryId(event.target.value); setPage(1); }} className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-700 outline-none focus:border-indigo-400"><option value="">همه دسته‌بندی‌ها</option>{categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{hasPermission('assets.manage_access') && <button onClick={createCategory} type="button" className="rounded-xl border border-slate-200 px-2.5 text-indigo-600 hover:bg-indigo-50" title="ساخت دسته‌بندی"><Plus className="h-4 w-4" /></button>}</div>
                <select value={status} onChange={event => { setStatus(event.target.value); setPage(1); }} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-700 outline-none focus:border-indigo-400"><option value="">همه وضعیت‌ها</option>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
                <select value={confidentiality} onChange={event => { setConfidentiality(event.target.value); setPage(1); }} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-700 outline-none focus:border-indigo-400"><option value="">همه سطوح محرمانگی</option>{Object.entries(PRIVACY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
                <select value={projectFilter} onChange={event => { setProjectFilter(event.target.value); setPage(1); }} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-700"><option value="">همه پروژه‌ها</option>{projects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
                <select value={taskFilter} onChange={event => { setTaskFilter(event.target.value); setPage(1); }} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-700"><option value="">همه وظایف</option>{tasks.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select>
                <select value={departmentFilter} onChange={event => { setDepartmentFilter(event.target.value); setPage(1); }} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-700"><option value="">همه دپارتمان‌ها</option>{departments.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-500">مرتب‌سازی:</span>
                  <select value={sort} onChange={event => setSort(event.target.value as typeof sort)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px]"><option value="updated_at">آخرین تغییر</option><option value="title">نام</option><option value="file_size">حجم فایل</option></select>
                  <button onClick={() => setDirection(current => current === 'asc' ? 'desc' : 'asc')} className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50" aria-label="تغییر جهت مرتب‌سازی">{direction === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}</button>
                </div>
                {selectedIds.length > 0 && <div className="flex flex-wrap items-center gap-2 rounded-xl bg-indigo-50 px-2 py-1.5">
                  <span className="px-1 text-[11px] font-bold text-indigo-700">{selectedIds.length} انتخاب</span>
                  {hasPermission('assets.move') && <><select value={bulkFolderId} onChange={event => setBulkFolderId(event.target.value)} className="rounded-lg border border-indigo-100 bg-white px-2 py-1.5 text-[11px]"><option value="">ریشه / بدون پوشه</option>{folders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select><button onClick={moveSelected} className="rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-bold text-indigo-700 hover:bg-indigo-100">انتقال</button></>}
                  {hasPermission('assets.delete') && <button onClick={archiveSelected} className="rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-bold text-rose-600 hover:bg-rose-50">بایگانی</button>}
                </div>}
              </div>
            </div>

            {childFolders.length > 0 && <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{childFolders.map(folder => <div key={folder.id} className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-amber-300 hover:shadow"><button onClick={() => { setFolderId(folder.id); setPage(1); }} className="flex min-w-0 flex-1 items-center gap-3 text-right"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-500"><Folder className="h-5 w-5" /></span><span className="min-w-0"><span className="block truncate text-xs font-bold text-slate-800">{folder.name}</span><span className="mt-0.5 block text-[10px] text-slate-400">پوشه</span></span></button>{hasPermission('assets.rename') && <button onClick={() => renameFolder(folder)} aria-label={`تغییر نام ${folder.name}`} className="rounded-lg p-1.5 text-slate-300 opacity-0 transition hover:bg-slate-100 hover:text-slate-600 group-hover:opacity-100"><MoreHorizontal className="h-4 w-4" /></button>}</div>)}</div>}

            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="hidden grid-cols-[minmax(220px,1.4fr)_minmax(120px,.7fr)_minmax(100px,.65fr)_minmax(110px,.65fr)_minmax(105px,.65fr)_40px] items-center gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-3 text-[10px] font-bold text-slate-500 lg:grid">
                <span>نام دارایی</span><span>دسته‌بندی / پوشه</span><span>وضعیت</span><span>محرمانگی</span><span>آخرین تغییر</span><span>{(hasPermission('assets.move') || hasPermission('assets.delete')) && <input type="checkbox" aria-label="انتخاب همه" checked={items.length > 0 && selectedIds.length === items.length} onChange={() => setSelectedIds(selectedIds.length === items.length ? [] : items.map(item => item.id))} />}</span>
              </div>
              {error && <div role="alert" className="m-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs text-rose-700"><Shield className="mt-0.5 h-4 w-4 shrink-0" />{error}<button onClick={() => setError('')} className="mr-auto"><X className="h-4 w-4" /></button></div>}
              {loading ? <div className="flex items-center justify-center gap-2 p-12 text-xs text-slate-400"><LoaderCircle className="h-4 w-4 animate-spin" />در حال دریافت اطلاعات...</div>
                : items.length === 0 ? <EmptyState canCreate={hasPermission('assets.upload')} onCreate={() => setEntryOpen(true)} />
                : <div className="divide-y divide-slate-100">{items.map(asset => <AssetRow key={asset.id} asset={asset} canSelect={hasPermission('assets.move') || hasPermission('assets.delete')} selected={selectedIds.includes(asset.id)} onToggle={() => setSelectedIds(ids => ids.includes(asset.id) ? ids.filter(id => id !== asset.id) : [...ids, asset.id])} onOpen={() => void openAsset(asset)} />)}</div>}
              <footer className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-[11px] text-slate-500"><span>صفحه {page.toLocaleString('fa-IR')} از {lastPage.toLocaleString('fa-IR')}</span><div className="flex items-center gap-1"><button disabled={page <= 1 || loading} onClick={() => setPage(value => Math.max(1, value - 1))} className="rounded-lg border border-slate-200 p-1.5 hover:bg-slate-50 disabled:opacity-40" aria-label="صفحه قبلی"><ChevronRight className="h-4 w-4" /></button><button disabled={page >= lastPage || loading} onClick={() => setPage(value => Math.min(lastPage, value + 1))} className="rounded-lg border border-slate-200 p-1.5 hover:bg-slate-50 disabled:opacity-40" aria-label="صفحه بعدی"><ChevronLeft className="h-4 w-4" /></button></div></footer>
            </div>
          </> : <ActivityList loading={loading} activities={activities} />}
        </div>
      </div>

      {folderDialog && <div className="fixed inset-0 z-[74] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm"><form onSubmit={saveFolder} className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"><div className="flex items-center justify-between"><h2 className="text-sm font-black text-slate-900">{folderDialog.mode === 'create' ? 'ساخت پوشه جدید' : 'تغییر نام پوشه'}</h2><button type="button" onClick={() => setFolderDialog(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button></div><label className="block text-[11px] font-bold text-slate-600">نام پوشه<input autoFocus required maxLength={255} value={folderName} onChange={event => setFolderName(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs outline-none focus:border-indigo-400" /></label><div className="flex justify-end gap-2"><button type="button" onClick={() => setFolderDialog(null)} className="rounded-xl px-3 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100">انصراف</button><button className="rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-indigo-700">ذخیره</button></div></form></div>}
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
        projects={projects}
        tasks={tasks}
        departments={departments}
        currentFolderId={folderId}
        canSetStatus={hasPermission('assets.manage_access')}
        onClose={() => setEntryOpen(false)}
        onSuccess={(message, close = true) => { if (close) setEntryOpen(false); setToast(message); setPage(1); reload(); }}
      />}
      {selected && <AssetDetails
        asset={selected}
        folders={folders}
        hasPermission={hasPermission}
        busy={detailBusy}
        onClose={() => setSelected(null)}
        onUpdate={updateAsset}
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

const FolderTree: React.FC<{ folder: FolderRecord; all: FolderRecord[]; currentId: number | null; onSelect: (id: number) => void; onRename: (folder: FolderRecord) => void; canRename: boolean; depth?: number }> = ({ folder, all, currentId, onSelect, onRename, canRename, depth = 0 }) => {
  const children = all.filter(item => item.parent_id === folder.id);
  return <div><div style={{ paddingRight: `${8 + Math.min(depth, 4) * 12}px` }} className={`group flex items-center gap-1 rounded-lg pl-1 ${currentId === folder.id ? 'bg-amber-50' : 'hover:bg-slate-50'}`}>
    <button onClick={() => onSelect(folder.id)} className={`flex min-w-0 flex-1 items-center gap-2 py-2 pl-1 text-right text-xs ${currentId === folder.id ? 'font-bold text-amber-800' : 'text-slate-600'}`}><Folder className="h-4 w-4 shrink-0 text-amber-500" /><span className="truncate">{folder.name}</span></button>
    {canRename && <button onClick={() => onRename(folder)} aria-label={`تغییر نام ${folder.name}`} className="rounded p-1 text-slate-300 opacity-0 hover:text-slate-600 group-hover:opacity-100"><MoreHorizontal className="h-3.5 w-3.5" /></button>}
  </div>{children.map(child => <FolderTree key={child.id} folder={child} all={all} currentId={currentId} onSelect={onSelect} onRename={onRename} canRename={canRename} depth={depth + 1} />)}</div>;
};

const EmptyState: React.FC<{ canCreate: boolean; onCreate: () => void }> = ({ canCreate, onCreate }) => <div className="flex flex-col items-center px-5 py-14 text-center"><span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400"><Folder className="h-6 w-6" /></span><h3 className="text-sm font-bold text-slate-800">دارایی‌ای پیدا نشد</h3><p className="mt-1 max-w-xs text-xs leading-6 text-slate-500">فیلترها را تغییر دهید یا یک فایل و محتوای تازه به مخزن اضافه کنید.</p>{canCreate && <button onClick={onCreate} className="mt-4 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-indigo-700"><Plus className="ml-1 inline h-3.5 w-3.5" />ثبت دارایی</button>}</div>;

const AssetRow: React.FC<{ asset: Asset; canSelect: boolean; selected: boolean; onToggle: () => void; onOpen: () => void }> = ({ asset, canSelect, selected, onToggle, onOpen }) => {
  const isContent = asset.type === 'content';
  const extension = asset.latest_file?.extension?.toUpperCase() || asset.latest_file?.original_filename?.split('.').pop()?.toUpperCase() || 'FILE';
  return <div className="grid grid-cols-[minmax(0,1fr)_32px] items-center gap-3 px-3 py-3 transition hover:bg-slate-50/80 sm:px-4 lg:grid-cols-[minmax(220px,1.4fr)_minmax(120px,.7fr)_minmax(100px,.65fr)_minmax(110px,.65fr)_minmax(105px,.65fr)_40px]">
    <button onClick={onOpen} className="flex min-w-0 items-center gap-3 text-right">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${isContent ? 'bg-violet-50 text-violet-600' : 'bg-indigo-50 text-indigo-600'}`}>{isContent ? <FileText className="h-5 w-5" /> : <File className="h-5 w-5" />}</span>
      <span className="min-w-0"><span className="flex items-center gap-1.5"><span className="max-w-full truncate text-xs font-bold text-slate-800 hover:text-indigo-700">{asset.title}</span>{asset.confidentiality === 'confidential' && <LockKeyhole className="h-3 w-3 shrink-0 text-rose-500" />}</span><span className="mt-1 flex items-center gap-2 text-[10px] text-slate-400"><span>{isContent ? 'محتوای متنی' : extension}</span>{asset.latest_file && <><span>•</span><span>{formatSize(asset.latest_file.file_size)}</span></>}{asset.tags?.slice(0, 2).map(tag => <span key={tag.id} className="hidden rounded bg-slate-100 px-1.5 py-0.5 text-slate-500 sm:inline">{tag.name}</span>)}</span></span>
    </button>
    <span className="hidden min-w-0 lg:block"><span className="block truncate text-[11px] font-medium text-slate-600">{asset.category?.name || 'بدون دسته‌بندی'}</span><span className="mt-1 block truncate text-[10px] text-slate-400">{asset.folder?.name || 'ریشه'}</span></span>
    <span className="hidden lg:block"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${asset.status === 'approved' || asset.status === 'published' ? 'bg-emerald-50 text-emerald-700' : asset.status === 'rejected' ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600'}`}>{STATUS_LABELS[asset.status] || asset.status}</span></span>
    <span className="hidden lg:block"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${asset.confidentiality === 'confidential' ? 'bg-rose-50 text-rose-700' : asset.confidentiality === 'public' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}>{PRIVACY_LABELS[asset.confidentiality] || asset.confidentiality}</span></span>
    <span className="hidden text-[10px] leading-5 text-slate-500 lg:block">{formatDate(asset.updated_at)}</span>
    <span className="flex items-center justify-center">{canSelect && <input type="checkbox" checked={selected} onChange={onToggle} aria-label={`انتخاب ${asset.title}`} className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />}</span>
  </div>;
};

const ActivityList: React.FC<{ loading: boolean; activities: DamActivity[] }> = ({ loading, activities }) => <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 px-4 py-4"><h2 className="text-sm font-black text-slate-900">تاریخچه فعالیت‌های مخزن</h2><p className="mt-1 text-[11px] text-slate-500">رویدادهای مهم دارایی‌ها با هویت انجام‌دهنده ثبت می‌شوند.</p></div>{loading ? <div className="p-10 text-center text-xs text-slate-400">در حال دریافت فعالیت‌ها...</div> : activities.length === 0 ? <p className="p-10 text-center text-xs text-slate-400">هنوز فعالیتی ثبت نشده است.</p> : <div className="divide-y divide-slate-100">{activities.map(activity => <div key={activity.id} className="flex items-start gap-3 px-4 py-3"><span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><Activity className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-slate-800">{ACTIVITY_LABELS[activity.action] || activity.action}{activity.asset?.title ? `: ${activity.asset.title}` : ''}</p><p className="mt-1 text-[10px] text-slate-500">{activity.actor?.name || 'کاربر سامانه'} <span className="mx-1">•</span>{formatDate(activity.created_at)}</p></div></div>)}</div>}</div>;

const AttachModal: React.FC<{ query: string; items: Asset[]; loading: boolean; onSearch: (query: string) => void; onAttach: (asset: Asset) => void; onClose: () => void }> = ({ query, items, loading, onSearch, onAttach, onClose }) => <div className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm"><div className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"><div className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><div><h2 className="text-sm font-black text-slate-900">اتصال دارایی موجود</h2><p className="mt-1 text-[10px] text-slate-500">فایل کپی نمی‌شود؛ فقط ارتباط با این بخش ثبت خواهد شد.</p></div><button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button></div><div className="p-4"><div className="relative"><Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input autoFocus value={query} onChange={event => onSearch(event.target.value)} placeholder="جست‌وجو در دارایی‌های قابل‌دسترسی" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pr-9 pl-3 text-xs outline-none focus:border-indigo-400" /></div><div className="mt-3 max-h-[55vh] divide-y divide-slate-100 overflow-y-auto">{loading ? <p className="p-8 text-center text-xs text-slate-400">در حال جست‌وجو...</p> : items.length ? items.map(asset => <div key={asset.id} className="flex items-center gap-3 py-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">{asset.type === 'file' ? <File className="h-4 w-4" /> : <FileText className="h-4 w-4" />}</span><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-slate-800">{asset.title}</p><p className="mt-1 text-[10px] text-slate-400">{asset.type === 'file' ? formatSize(asset.latest_file?.file_size) : 'محتوای متنی'}</p></div><button onClick={() => onAttach(asset)} className="rounded-lg bg-indigo-600 px-3 py-2 text-[10px] font-bold text-white hover:bg-indigo-700">اتصال</button></div>) : <p className="p-8 text-center text-xs text-slate-400">دارایی‌ای پیدا نشد.</p>}</div></div></div></div>;

const EntryModal: React.FC<{
  context?: Context; folders: FolderRecord[]; categories: Category[]; projects: ProjectOption[]; tasks: TaskOption[]; departments: DepartmentOption[]; currentFolderId: number | null;
  canSetStatus: boolean; onClose: () => void; onSuccess: (message: string, close?: boolean) => void;
}> = ({ context, folders, categories, projects, tasks, departments, currentFolderId, canSetStatus, onClose, onSuccess }) => {
  const [mode, setMode] = useState<AssetType>('file');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [body, setBody] = useState('');
  const [tags, setTags] = useState('');
  const [confidentiality, setConfidentiality] = useState('internal');
  const [status, setStatus] = useState('draft');
  const [folderId, setFolderId] = useState(currentFolderId ? String(currentFolderId) : '');
  const [categoryId, setCategoryId] = useState('');
  const [projectId, setProjectId] = useState(context?.project_id ? String(context.project_id) : '');
  const [taskId, setTaskId] = useState(context?.task_id ? String(context.task_id) : '');
  const [departmentId, setDepartmentId] = useState(context?.department_id ? String(context.department_id) : '');
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<string[]>([]);

  const addFiles = (fileList: FileList | null) => {
    if (!fileList) return;
    const fresh = Array.from(fileList).map(file => ({ id: fileKey(), file, progress: 0 }));
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
    xhr.onload = () => xhr.status >= 200 && xhr.status < 300
      ? resolve()
      : reject(new Error((() => { try { return JSON.parse(xhr.responseText).message || 'بارگذاری ناموفق بود.'; } catch { return 'بارگذاری ناموفق بود.'; } })()));
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
      if (mode === 'content') {
        await request('/dam/library', { method: 'POST', body: {
          title: title.trim(), body, description, confidentiality, status,
          tags: tagList, folder_id: folderId || null, category_id: categoryId || null,
          project_id: context?.project_id || (projectId ? Number(projectId) : null),
          task_id: context?.task_id || (taskId ? Number(taskId) : null),
          department_id: context?.department_id || (departmentId ? Number(departmentId) : null),
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
          form.append('title', baseTitle ? (queue.length > 1 ? `${baseTitle} - ${item.file.name}` : baseTitle) : item.file.name);
          form.append('description', description);
          form.append('confidentiality', confidentiality);
          form.append('status', status);
          if (targetFolder) form.append('folder_id', String(targetFolder));
          if (categoryId) form.append('category_id', categoryId);
          tagList.forEach((tag, index) => form.append(`tags[${index}]`, tag));
          const relations = {
            project_id: context?.project_id || projectId,
            task_id: context?.task_id || taskId,
            department_id: context?.department_id || departmentId,
          };
          Object.entries(relations).forEach(([key, value]) => { if (value) form.append(key, String(value)); });
          await uploadOne(form, item, progress => setQueue(previous => previous.map(file => file.id === item.id ? { ...file, progress } : file)));
          outcomes.push(`${item.file.name}: ثبت شد`);
        } catch (e) {
          const message = getError(e);
          outcomes.push(`${item.file.name}: ${message}`);
          failed.push({ ...item, progress: 0, error: message });
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
          {!!queue.length && <div className="space-y-2"><div className="flex items-center justify-between text-[11px] font-bold text-slate-600"><span>صف بارگذاری</span><span>{queue.length.toLocaleString('fa-IR')} فایل</span></div>{queue.map(item => <div key={item.id} className="rounded-xl border border-slate-100 bg-slate-50 p-2.5"><div className="flex items-center gap-2"><File className="h-4 w-4 shrink-0 text-indigo-500" /><span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-slate-700">{(item.file as File & { webkitRelativePath?: string }).webkitRelativePath || item.file.name}</span><span className="text-[10px] text-slate-400">{formatSize(item.file.size)}</span><button type="button" onClick={() => setQueue(current => current.filter(file => file.id !== item.id))} className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="حذف از صف"><X className="h-3.5 w-3.5" /></button></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200"><div className={`h-full rounded-full transition-all ${item.error ? 'bg-rose-500' : 'bg-indigo-600'}`} style={{ width: `${item.progress}%` }} /></div>{item.error && <p className="mt-1 text-[10px] text-rose-600">{item.error}</p>}</div>)}</div>}
        </> : <>
          <label className="block text-[11px] font-bold text-slate-600">عنوان محتوا<input required value={title} onChange={event => setTitle(event.target.value)} placeholder="برای نمونه: روایت تاریخچه سازمان" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs outline-none focus:border-indigo-400" /></label>
          <label className="block text-[11px] font-bold text-slate-600">متن<textarea required value={body} onChange={event => setBody(event.target.value)} rows={7} placeholder="متن محتوا را اینجا بنویسید..." className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 px-3 py-2.5 text-xs leading-6 outline-none focus:border-indigo-400" /></label>
        </>}
        <div className="grid gap-3 sm:grid-cols-2">{mode === 'file' && <label className="block text-[11px] font-bold text-slate-600">عنوان نمایشی<span className="font-normal text-slate-400"> (اختیاری؛ نام فایل به‌صورت پیش‌فرض)</span><input value={title} onChange={event => setTitle(event.target.value)} placeholder="عنوان دارایی" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs outline-none focus:border-indigo-400" /></label>}<label className="block text-[11px] font-bold text-slate-600">دسته‌بندی<select value={categoryId} onChange={event => setCategoryId(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs"><option value="">بدون دسته‌بندی</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label></div>
        <label className="block text-[11px] font-bold text-slate-600">توضیحات<textarea value={description} onChange={event => setDescription(event.target.value)} rows={2} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs outline-none focus:border-indigo-400" /></label>
        <div className="grid gap-3 sm:grid-cols-3"><label className="block text-[11px] font-bold text-slate-600">پوشه<select value={folderId} onChange={event => setFolderId(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs"><option value="">ریشه / بدون پوشه</option>{folders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label><label className="block text-[11px] font-bold text-slate-600">محرمانگی<select value={confidentiality} onChange={event => setConfidentiality(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs"><option value="public">عمومی</option><option value="internal">داخلی</option><option value="confidential">محرمانه</option></select></label><label className="block text-[11px] font-bold text-slate-600">وضعیت<select disabled={!canSetStatus} value={status} onChange={event => setStatus(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs disabled:bg-slate-50"><option value="draft">پیش‌نویس</option>{canSetStatus && Object.entries(STATUS_LABELS).filter(([value]) => value !== 'draft').map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
        <div className="grid gap-3 sm:grid-cols-3"><label className="block text-[11px] font-bold text-slate-600">پروژه<select disabled={Boolean(context?.project_id)} value={projectId} onChange={event => { setProjectId(event.target.value); setTaskId(''); }} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs disabled:bg-slate-50"><option value="">بدون ارتباط</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><label className="block text-[11px] font-bold text-slate-600">وظیفه<select disabled={Boolean(context?.task_id)} value={taskId} onChange={event => { const value = event.target.value; setTaskId(value); const task = tasks.find(item => String(item.id) === value); if (task?.projectId) setProjectId(String(task.projectId)); }} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs disabled:bg-slate-50"><option value="">بدون ارتباط</option>{tasks.filter(task => !projectId || String(task.projectId) === projectId).map(task => <option key={task.id} value={task.id}>{task.title}</option>)}</select></label><label className="block text-[11px] font-bold text-slate-600">دپارتمان<select disabled={Boolean(context?.department_id)} value={departmentId} onChange={event => setDepartmentId(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs disabled:bg-slate-50"><option value="">دپارتمان پیش‌فرض من</option>{departments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label></div>
        <label className="block text-[11px] font-bold text-slate-600">برچسب‌ها<input value={tags} onChange={event => setTags(event.target.value)} placeholder="با ویرگول جدا کنید" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs outline-none focus:border-indigo-400" /><Tag className="ml-1 mt-1 inline h-3 w-3 text-slate-400" /><span className="text-[10px] font-normal text-slate-400">جست‌وجو بر اساس برچسب در دسترس است.</span></label>
        {!!results.length && <div className="space-y-1 rounded-xl bg-slate-50 p-3 text-[10px] text-slate-600">{results.map((result, index) => <p key={index}>{result}</p>)}</div>}
        {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}
      </div>
      <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/70 px-5 py-3"><button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-200">انصراف</button><button disabled={busy || (mode === 'file' && queue.length === 0)} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{busy ? 'در حال ثبت...' : mode === 'file' && queue.some(item => item.error) ? 'تلاش مجدد برای ناموفق‌ها' : 'ثبت دارایی'}</button></div>
    </form>
  </div>;
};

const AssetDetails: React.FC<{
  asset: Asset; folders: FolderRecord[]; hasPermission: (key: string) => boolean; busy: boolean;
  onClose: () => void; onUpdate: (asset: Asset, changes: Record<string, unknown>) => void;
  onReplace: (asset: Asset) => void; onRestore: (asset: Asset, version: DamVersion) => void; onDelete: (asset: Asset) => void;
}> = ({ asset, folders, hasPermission, busy, onClose, onUpdate, onReplace, onRestore, onDelete }) => {
  const [revisionFile, setRevisionFile] = useState<File | null>(null);
  const [revisionBody, setRevisionBody] = useState(asset.content_item?.content_body || '');
  const [revisionNote, setRevisionNote] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState('');
  const canRevise = hasPermission(asset.type === 'file' ? 'assets.create_version' : 'assets.edit_info');

  const createVersion = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setLocalError('');
    try {
      const form = new FormData();
      if (asset.type === 'file') { if (!revisionFile) throw new Error('فایل نسخه جدید را انتخاب کنید.'); form.append('file', revisionFile); }
      else form.append('body', revisionBody);
      form.append('change_description', revisionNote);
      await request(`/dam/library/${asset.id}/versions`, { method: 'POST', body: form });
      const result = await request<ApiResponse<Asset>>(`/dam/library/${asset.id}`);
      onReplace(result.data);
      setRevisionFile(null); setRevisionNote(''); setEditing(false);
    } catch (e) { setLocalError(getError(e)); }
    finally { setSaving(false); }
  };

  const downloadUrl = `${apiConfig.baseUrl}/dam/library/${asset.id}/download`;
  return <div className="fixed inset-0 z-[80] flex justify-start bg-slate-950/35 backdrop-blur-[1px]" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <aside className="flex h-full w-full max-w-2xl flex-col overflow-hidden border-r border-slate-200 bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div className="flex min-w-0 items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">{asset.type === 'content' ? <FileText className="h-5 w-5" /> : <File className="h-5 w-5" />}</span><div className="min-w-0"><p className="text-[10px] font-bold text-indigo-600">شناسنامه دارایی #{asset.id.toLocaleString('fa-IR')}</p><h2 className="truncate text-sm font-black text-slate-900">{asset.title}</h2></div></div><button onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button></div>
      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        {busy && <p className="text-xs text-slate-400">در حال به‌روزرسانی...</p>}
        {asset.type === 'content' ? <div className="rounded-2xl border border-violet-100 bg-violet-50/40 p-4"><p className="whitespace-pre-wrap text-xs leading-7 text-slate-700">{asset.content_item?.content_body || 'متنی برای نمایش ثبت نشده است.'}</p></div> : <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3"><FileText className="h-4 w-4 text-indigo-500" /><span className="min-w-0 flex-1 truncate text-xs font-bold text-slate-700">{asset.latest_file?.original_filename || 'فایل'}</span><span className="text-[10px] text-slate-500">{formatSize(asset.latest_file?.file_size)}</span>{hasPermission('assets.download') && <a href={downloadUrl} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-[10px] font-bold text-white hover:bg-indigo-700"><Download className="h-3.5 w-3.5" />دانلود امن</a>}</div>}
        {asset.type === 'file' && hasPermission('assets.preview') && asset.latest_file?.mime_type && <AssetPreview file={asset.latest_file} assetId={asset.id} />}
        {asset.description && <p className="text-xs leading-6 text-slate-600">{asset.description}</p>}
        <section className="grid grid-cols-2 gap-2 sm:grid-cols-3"><Info label="وضعیت" value={STATUS_LABELS[asset.status] || asset.status} /><Info label="محرمانگی" value={PRIVACY_LABELS[asset.confidentiality] || asset.confidentiality} /><Info label="مالک" value={asset.owner?.name || '—'} /><Info label="دسته‌بندی" value={asset.category?.name || '—'} /><Info label="تاریخ ایجاد" value={formatDate(asset.created_at)} /><Info label="آخرین تغییر" value={formatDate(asset.updated_at)} /></section>
        {asset.type === 'file' && asset.latest_file && <section className="rounded-2xl border border-slate-200 p-3"><h3 className="mb-2 text-[11px] font-black text-slate-700">اطلاعات فنی فایل</h3><div className="grid grid-cols-2 gap-2 text-[10px] text-slate-500"><span>نوع: {asset.latest_file.mime_type || 'نامشخص'}</span><span>پسوند: {asset.latest_file.extension || '—'}</span><span>اندازه: {formatSize(asset.latest_file.file_size)}</span><span>SHA-256: {asset.latest_file.checksum || 'محرمانه'}</span></div></section>}
        {!!asset.tags?.length && <div className="flex flex-wrap gap-1.5">{asset.tags.map(tag => <span key={tag.id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] text-slate-600"><Tag className="h-3 w-3" />{tag.name}</span>)}</div>}
        {asset.relations?.length ? <section className="rounded-2xl border border-slate-200 p-3"><h3 className="mb-2 text-[11px] font-black text-slate-700">ارتباط‌ها</h3><div className="flex flex-wrap gap-2">{asset.relations.map((relation, i) => <span key={`${relation.related_type}-${relation.related_id}-${i}`} className="rounded-lg bg-indigo-50 px-2.5 py-1.5 text-[10px] font-bold text-indigo-700">{relation.related_type === 'project' ? 'پروژه' : relation.related_type === 'task' ? 'وظیفه' : relation.related_type} #{relation.related_id.toLocaleString('fa-IR')}</span>)}</div></section> : null}
        {hasPermission('assets.move') && <label className="block text-[11px] font-bold text-slate-600">انتقال به پوشه<select value={asset.folder_id || ''} onChange={event => onUpdate(asset, { folder_id: event.target.value ? Number(event.target.value) : null })} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs"><option value="">ریشه / بدون پوشه</option>{folders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label>}
        {hasPermission('assets.manage_access') && <div className="grid gap-2 sm:grid-cols-2"><label className="text-[11px] font-bold text-slate-600">تغییر وضعیت<select value={asset.status} onChange={event => onUpdate(asset, { status: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs">{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="text-[11px] font-bold text-slate-600">محرمانگی<select value={asset.confidentiality} onChange={event => onUpdate(asset, { confidentiality: event.target.value })} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs">{Object.entries(PRIVACY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>}
        <section className="space-y-2"><div className="flex items-center justify-between"><h3 className="text-xs font-black text-slate-800">تاریخچه نسخه‌ها</h3>{canRevise && <button onClick={() => setEditing(value => !value)} className="rounded-lg border border-indigo-100 px-2.5 py-1.5 text-[10px] font-bold text-indigo-700 hover:bg-indigo-50">{editing ? 'بستن فرم' : 'ثبت نسخه جدید'}</button>}</div>{editing && <form onSubmit={createVersion} className="space-y-2 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3">{asset.type === 'file' ? <input type="file" required onChange={event => setRevisionFile(event.target.files?.[0] || null)} className="block w-full text-[11px]" /> : <textarea required value={revisionBody} onChange={event => setRevisionBody(event.target.value)} rows={4} className="w-full rounded-lg border border-slate-200 p-2 text-xs" />}<input value={revisionNote} onChange={event => setRevisionNote(event.target.value)} placeholder="شرح تغییر (اختیاری)" className="w-full rounded-lg border border-slate-200 p-2 text-xs" />{localError && <p className="text-[11px] text-rose-600">{localError}</p>}<button disabled={saving} className="rounded-lg bg-indigo-600 px-3 py-2 text-[10px] font-bold text-white disabled:opacity-50">{saving ? 'در حال ذخیره...' : 'ذخیره نسخه جدید'}</button></form>}
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-100">{(asset.versions || []).slice().reverse().map(version => <div key={version.id} className="flex items-center gap-3 px-3 py-2.5"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-[10px] font-black text-slate-600">{version.version_number}</span><div className="min-w-0 flex-1"><p className="truncate text-[11px] font-bold text-slate-700">نسخه {version.version_number} {version.change_description ? `— ${version.change_description}` : ''}</p><p className="mt-0.5 text-[9px] text-slate-400">{formatDate(version.created_at)}</p></div>{hasPermission('assets.restore') && <button onClick={() => onRestore(asset, version)} className="rounded-lg px-2 py-1 text-[10px] font-bold text-indigo-600 hover:bg-indigo-50">بازیابی</button>}</div>)}</div>
        </section>
        <section className="space-y-2"><h3 className="text-xs font-black text-slate-800">فعالیت‌های دارایی</h3><div className="divide-y divide-slate-100 rounded-xl border border-slate-100">{(asset.activities || []).slice().reverse().slice(0, 12).map(activity => <div key={activity.id} className="flex items-center gap-2 px-3 py-2 text-[10px] text-slate-600"><Clock3 className="h-3.5 w-3.5 text-slate-400" /><span className="flex-1">{ACTIVITY_LABELS[activity.action] || activity.action}</span><span className="text-slate-400">{formatDate(activity.created_at)}</span></div>)}{!asset.activities?.length && <p className="p-3 text-[10px] text-slate-400">فعالیتی ثبت نشده است.</p>}</div></section>
        {hasPermission('assets.delete') && <button onClick={() => onDelete(asset)} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-3 py-2 text-[11px] font-bold text-rose-600 hover:bg-rose-50"><Archive className="h-4 w-4" />بایگانی دارایی</button>}
      </div>
    </aside>
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
