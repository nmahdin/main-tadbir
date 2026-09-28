import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Download,
  Expand,
  FileSpreadsheet,
  Filter,
  LoaderCircle,
  Plus,
  Search,
  ShieldCheck,
  Shrink,
  Table as TableIcon,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { request } from '../../api/client';
import { useApp } from '../../context/AppContext';

type TableColumn = { id: string; name: string; type?: string; options?: string[] };
type RowActivity = {
  id: number;
  action: string;
  metadata?: { columns?: string[]; task_id?: number; from?: number | null; to?: number | null } | null;
  created_at?: string;
  actor?: { id: number; name: string } | null;
};
type DamDataRow = {
  id: number;
  cells?: Record<string, string>;
  position?: number;
  task_id?: number | null;
  creator?: { id: number; name: string } | null;
  updater?: { id: number; name: string } | null;
  task?: { id: number; title: string } | null;
  activities?: RowActivity[];
  created_at?: string;
  updated_at?: string;
};
type DamDataTable = {
  id: number;
  name: string;
  description?: string | null;
  columns?: TableColumn[];
  rows?: DamDataRow[];
  rows_count?: number;
  updated_at?: string;
  grants?: { user_id: number; access: 'view' | 'edit' }[];
  can_edit?: boolean;
  creator?: { id: number; name: string } | null;
};

const getError = (error: unknown) => error instanceof Error ? error.message : 'عملیات انجام نشد. دوباره تلاش کنید.';
const newColumnId = () => `col-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const COLUMN_TYPE_LABELS: Record<string, string> = {
  text: 'متن',
  number: 'عدد',
  date: 'تاریخ',
  select: 'گزینه‌ای (تک‌انتخابی)',
};

const ACTIVITY_LABELS: Record<string, string> = {
  created: 'ردیف ایجاد شد',
  updated: 'ردیف ویرایش شد',
  deleted: 'ردیف حذف شد',
  task_linked: 'به تسک متصل شد',
  task_unlinked: 'اتصال تسک قطع شد',
};

/** CSV سازگار با اکسل (همراه BOM برای نمایش درست فارسی). */
const toCsv = (headers: string[], rows: string[][]) => {
  const esc = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return '﻿' + [headers, ...rows].map(r => r.map(esc).join(',')).join('\r\n');
};

/** تجزیه CSV با پشتیبانی از کوتیشن و خطوط چندخطی. */
const parseCsv = (text: string): string[][] => {
  const clean = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"') {
        if (clean[i + 1] === '"') { cell += '"'; i++; }
        else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell.trim()); cell = ''; }
    else if (ch === '\n') { row.push(cell.trim()); cell = ''; if (row.some(c => c !== '')) rows.push(row); row = []; }
    else if (ch !== '\r') cell += ch;
  }
  row.push(cell.trim());
  if (row.some(c => c !== '')) rows.push(row);
  return rows;
};

/**
 * «جدول اطلاعات» — هر جدول مانند یک شیت اکسل است؛
 * ستون‌ها روی خود جدول و ردیف‌ها به‌صورت رکورد دیتابیسی ذخیره می‌شوند.
 */
export const DamDataTables: React.FC = () => {
  const { hasPermission, notify, users, tasks, currentUser, setSelectedTaskId } = useApp();
  const [tables, setTables] = useState<DamDataTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<DamDataTable | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingCell, setEditingCell] = useState<{ rowId: number | 'new'; columnId: string } | null>(null);
  const [draftRow, setDraftRow] = useState<Record<string, string>>({});
  const [savingRow, setSavingRow] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  // فیلترها
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Record<string, string>>({});
  // ستون‌ها
  const [columnModal, setColumnModal] = useState<{ mode: 'create' } | { mode: 'edit'; column: TableColumn } | null>(null);
  // ردیف فعال (مودال جزئیات)
  const [activeRowId, setActiveRowId] = useState<number | null>(null);
  // دسترسی‌ها
  const [grantsOpen, setGrantsOpen] = useState(false);
  // ایمپورت
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const canCreate = hasPermission('assets.upload');
  const canDelete = hasPermission('assets.delete') || hasPermission('assets.manage_access');
  const canEdit = detail?.can_edit ?? (hasPermission('assets.edit_info') || hasPermission('assets.upload'));
  const canManageGrants = detail != null && (
    hasPermission('assets.manage_access') || detail.creator?.id === Number(currentUser.id)
  );

  const refreshTables = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await request<{ data: DamDataTable[] }>('/dam/data-tables');
      setTables(result.data || []);
    } catch (e) {
      setError(getError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refreshTables(); }, [refreshTables]);

  const openTable = useCallback(async (id: number) => {
    setSelectedId(id);
    setDetailLoading(true);
    setEditingCell(null);
    setDraftRow({});
    setFilters({});
    setActiveRowId(null);
    try {
      const result = await request<{ data: DamDataTable }>('/dam/data-tables/' + id);
      setDetail(result.data);
    } catch (e) {
      setError(getError(e));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const filtered = tables.filter(t =>
    !search.trim() || t.name.includes(search.trim()) || (t.description || '').includes(search.trim())
  );

  const columns: TableColumn[] = detail?.columns || [];
  const allRows: DamDataRow[] = [...(detail?.rows || [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const rows = useMemo(() => {
    const active = (Object.entries(filters) as [string, string][]).filter(([, v]) => v.trim() !== '');
    if (active.length === 0) return allRows;
    return allRows.filter(row =>
      active.every(([colId, query]) => (row.cells?.[colId] || '').includes(query.trim()))
    );
  }, [allRows, filters]);
  const activeRow = activeRowId != null ? allRows.find(r => r.id === activeRowId) || null : null;
  const hasActiveFilters = Object.values(filters).some((v: string) => v.trim() !== '');

  const patchRowInDetail = (rowId: number, patch: Partial<DamDataRow>) => {
    setDetail(prev => prev ? {
      ...prev,
      rows: (prev.rows || []).map(r => r.id === rowId ? { ...r, ...patch } : r),
    } : prev);
  };

  const persistColumns = async (nextColumns: TableColumn[]) => {
    if (!detail) return;
    try {
      const result = await request<{ data: DamDataTable }>(`/dam/data-tables/${detail.id}`, {
        method: 'PATCH',
        body: { columns: nextColumns },
      });
      setDetail(prev => prev ? { ...prev, columns: result.data.columns || [] } : prev);
      setColumnModal(null);
    } catch (e) {
      notify({ type: 'error', title: 'ذخیره ستون‌ها ناموفق بود', message: getError(e) });
    }
  };

  const handleDeleteColumn = (column: TableColumn) => {
    if (!detail) return;
    if (!window.confirm(`ستون «${column.name}» حذف شود؟ مقادیر این ستون در همه ردیف‌ها پاک می‌شود.`)) return;
    const next = columns.filter(c => c.id !== column.id);
    void persistColumns(next);
    allRows.forEach(row => {
      if (row.cells && column.id in row.cells) {
        const cells = { ...row.cells };
        delete cells[column.id];
        void request(`/dam/data-tables/${detail.id}/rows/${row.id}`, { method: 'PATCH', body: { cells } })
          .then(() => patchRowInDetail(row.id, { cells }))
          .catch(() => undefined);
      }
    });
  };

  const saveCell = async (row: DamDataRow, columnId: string, value: string) => {
    if (!detail) return;
    const cells = { ...(row.cells || {}), [columnId]: value };
    patchRowInDetail(row.id, { cells });
    setEditingCell(null);
    try {
      const result = await request<{ data: DamDataRow }>(`/dam/data-tables/${detail.id}/rows/${row.id}`, {
        method: 'PATCH',
        body: { cells },
      });
      patchRowInDetail(row.id, result.data);
    } catch (e) {
      notify({ type: 'error', title: 'ذخیره سلول ناموفق بود', message: getError(e) });
      void openTable(detail.id);
    }
  };

  const addRow = async () => {
    if (!detail) return;
    setSavingRow(true);
    try {
      const result = await request<{ data: DamDataRow }>(`/dam/data-tables/${detail.id}/rows`, {
        method: 'POST',
        body: { cells: draftRow },
      });
      setDetail(prev => prev ? { ...prev, rows: [...(prev.rows || []), result.data] } : prev);
      setDraftRow({});
      setTables(prev => prev.map(t => t.id === detail.id ? { ...t, rows_count: (t.rows_count || 0) + 1 } : t));
    } catch (e) {
      notify({ type: 'error', title: 'افزودن ردیف ناموفق بود', message: getError(e) });
    } finally {
      setSavingRow(false);
    }
  };

  const deleteRow = async (row: DamDataRow) => {
    if (!detail || !window.confirm('این ردیف حذف شود؟')) return;
    try {
      await request(`/dam/data-tables/${detail.id}/rows/${row.id}`, { method: 'DELETE' });
      setDetail(prev => prev ? { ...prev, rows: (prev.rows || []).filter(r => r.id !== row.id) } : prev);
      setTables(prev => prev.map(t => t.id === detail.id ? { ...t, rows_count: Math.max(0, (t.rows_count || 1) - 1) } : t));
      if (activeRowId === row.id) setActiveRowId(null);
    } catch (e) {
      notify({ type: 'error', title: 'حذف ردیف ناموفق بود', message: getError(e) });
    }
  };

  const deleteTable = async (table: DamDataTable) => {
    if (!window.confirm(`جدول «${table.name}» و همه ردیف‌های آن حذف شود؟`)) return;
    try {
      await request(`/dam/data-tables/${table.id}`, { method: 'DELETE' });
      setTables(prev => prev.filter(t => t.id !== table.id));
      if (selectedId === table.id) {
        setSelectedId(null);
        setDetail(null);
      }
      notify({ type: 'success', title: 'جدول حذف شد', message: `«${table.name}» از جدول اطلاعات حذف شد.` });
    } catch (e) {
      notify({ type: 'error', title: 'حذف جدول ناموفق بود', message: getError(e) });
    }
  };

  /** خروجی اکسل (CSV) از ردیف‌های قابل مشاهده. */
  const exportCsv = () => {
    if (!detail) return;
    const csv = toCsv(
      columns.map(c => c.name),
      rows.map(row => columns.map(c => row.cells?.[c.id] || ''))
    );
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${detail.name}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    notify({ type: 'success', title: 'خروجی اکسل آماده شد', message: `${rows.length.toLocaleString('fa-IR')} ردیف صادر شد.` });
  };

  /** ورود ردیف‌ها از فایل اکسل/CSV؛ سطر اول باید نام ستون‌ها باشد. */
  const importCsv = async (file: File) => {
    if (!detail || columns.length === 0) return;
    setImporting(true);
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      if (parsed.length < 2) throw new Error('فایل معتبر نیست؛ سطر اول باید نام ستون‌ها و سطرهای بعد مقادیر باشند.');
      const header = parsed[0];
      const colByName = new Map(columns.map(c => [c.name.trim(), c.id]));
      const mapping = header.map(h => colByName.get(h.trim()) || null);
      if (!mapping.some(Boolean)) throw new Error('هیچ‌یک از نام ستون‌های فایل با ستون‌های جدول مطابقت ندارد.');
      let created = 0;
      for (const line of parsed.slice(1)) {
        const cells: Record<string, string> = {};
        line.forEach((value, idx) => {
          const colId = mapping[idx];
          if (colId && value !== '') cells[colId] = value;
        });
        if (Object.keys(cells).length === 0) continue;
        const result = await request<{ data: DamDataRow }>(`/dam/data-tables/${detail.id}/rows`, {
          method: 'POST',
          body: { cells },
        });
        setDetail(prev => prev ? { ...prev, rows: [...(prev.rows || []), result.data] } : prev);
        created++;
      }
      setTables(prev => prev.map(t => t.id === detail.id ? { ...t, rows_count: (t.rows_count || 0) + created } : t));
      notify({ type: 'success', title: 'ورود اطلاعات انجام شد', message: `${created.toLocaleString('fa-IR')} ردیف از فایل اضافه شد.` });
    } catch (e) {
      notify({ type: 'error', title: 'ورود فایل ناموفق بود', message: getError(e) });
    } finally {
      setImporting(false);
      if (importInputRef.current) importInputRef.current.value = '';
    }
  };

  const grid = (
    <div className={`min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm flex flex-col ${fullscreen ? 'h-full' : ''}`}>
      {!detail ? (
        <div className="flex flex-col items-center px-5 py-16 text-center">
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
            <FileSpreadsheet className="h-6 w-6" />
          </span>
          <h3 className="text-sm font-bold text-slate-800">یک جدول انتخاب کنید</h3>
          <p className="mt-1 max-w-xs text-xs leading-6 text-slate-500">
            هر جدول مانند یک شیت اکسل است؛ روی هر سلول کلیک کنید تا مستقیم ویرایش شود.
          </p>
        </div>
      ) : detailLoading ? (
        <p className="flex items-center justify-center gap-2 p-12 text-xs text-slate-400">
          <LoaderCircle className="h-4 w-4 animate-spin" />
          در حال دریافت ردیف‌ها...
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-black text-slate-900">{detail.name}</h3>
              {detail.description && <p className="mt-0.5 truncate text-[11px] text-slate-500">{detail.description}</p>}
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] text-slate-400 ml-1">
                {rows.length.toLocaleString('fa-IR')} از {allRows.length.toLocaleString('fa-IR')} ردیف
              </span>
              <button
                onClick={() => setShowFilters(v => !v)}
                title="فیلتر ردیف‌ها"
                className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold ${showFilters || hasActiveFilters ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}
              >
                <Filter className="h-3.5 w-3.5" />
                فیلتر
              </button>
              <button
                onClick={exportCsv}
                title="خروجی اکسل (CSV)"
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
              >
                <Download className="h-3.5 w-3.5" />
                خروجی اکسل
              </button>
              {canEdit && (
                <>
                  <button
                    onClick={() => importInputRef.current?.click()}
                    disabled={importing}
                    title="ورود ردیف‌ها از اکسل/CSV"
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {importing ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                    ورود از اکسل
                  </button>
                  <input
                    ref={importInputRef}
                    type="file"
                    accept=".csv,.txt"
                    className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) void importCsv(file);
                    }}
                  />
                  <button
                    onClick={() => setColumnModal({ mode: 'create' })}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    ستون جدید
                  </button>
                </>
              )}
              {canManageGrants && (
                <button
                  onClick={() => setGrantsOpen(true)}
                  title="دسترسی افراد به این جدول"
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  دسترسی‌ها{(detail.grants?.length || 0) > 0 ? ` (${detail.grants!.length.toLocaleString('fa-IR')})` : ''}
                </button>
              )}
              <button
                onClick={() => setFullscreen(v => !v)}
                title={fullscreen ? 'خروج از تمام‌صفحه' : 'نمایش تمام‌صفحه'}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
              >
                {fullscreen ? <Shrink className="h-3.5 w-3.5" /> : <Expand className="h-3.5 w-3.5" />}
                {fullscreen ? 'بستن' : 'تمام‌صفحه'}
              </button>
            </div>
          </div>

          <div className="overflow-auto">
            <table className="w-full min-w-[560px] border-collapse text-xs">
              <thead className="sticky top-0 z-10">
                <tr className="bg-slate-50/95 backdrop-blur">
                  <th className="w-10 border-b border-l border-slate-200 px-2 py-2.5 text-[10px] font-bold text-slate-400">#</th>
                  {columns.map(col => (
                    <th key={col.id} className="group min-w-[140px] border-b border-l border-slate-200 px-2 py-2 text-right">
                      <span className="flex items-center justify-between gap-1">
                        <span className="min-w-0">
                          <span className="block truncate text-[11px] font-black text-slate-700">{col.name}</span>
                          <span className="block text-[9px] font-medium text-slate-400">
                            {COLUMN_TYPE_LABELS[col.type || 'text'] || 'متن'}
                            {col.type === 'select' && col.options?.length ? ` • ${col.options.length.toLocaleString('fa-IR')} گزینه` : ''}
                          </span>
                        </span>
                        {canEdit && (
                          <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                            <button
                              onClick={() => setColumnModal({ mode: 'edit', column: col })}
                              title="ویرایش ستون"
                              className="rounded p-1 text-slate-400 hover:bg-white hover:text-indigo-600"
                            >
                              <Check className="h-3 w-3" />
                            </button>
                            <button
                              onClick={() => handleDeleteColumn(col)}
                              title="حذف ستون"
                              className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        )}
                      </span>
                    </th>
                  ))}
                  <th className="w-12 border-b border-slate-200 px-2 py-2.5" />
                </tr>
                {showFilters && columns.length > 0 && (
                  <tr className="bg-amber-50/60">
                    <th className="border-b border-l border-slate-200 px-2 py-1.5">
                      {hasActiveFilters && (
                        <button
                          onClick={() => setFilters({})}
                          title="پاک‌سازی فیلترها"
                          className="mx-auto flex items-center gap-0.5 rounded-lg bg-white px-1.5 py-1 text-[10px] font-bold text-rose-600 shadow-sm"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </th>
                    {columns.map(col => (
                      <th key={col.id} className="border-b border-l border-slate-200 px-1.5 py-1">
                        {col.type === 'select' && col.options?.length ? (
                          <select
                            value={filters[col.id] || ''}
                            onChange={e => setFilters(prev => ({ ...prev, [col.id]: e.target.value }))}
                            className="w-full rounded-lg border border-amber-200 bg-white px-2 py-1.5 text-[11px] outline-none focus:border-amber-400"
                          >
                            <option value="">همه گزینه‌ها</option>
                            {col.options.map(opt => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            value={filters[col.id] || ''}
                            onChange={e => setFilters(prev => ({ ...prev, [col.id]: e.target.value }))}
                            placeholder={`فیلتر ${col.name}`}
                            className="w-full rounded-lg border border-amber-200 bg-white px-2 py-1.5 text-[11px] outline-none placeholder:text-slate-300 focus:border-amber-400"
                          />
                        )}
                      </th>
                    ))}
                    <th className="border-b border-slate-200 px-2 py-1.5" />
                  </tr>
                )}
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.id} className="transition hover:bg-slate-50/60">
                    <td className="border-b border-l border-slate-100 px-1 py-1.5 text-center">
                      <button
                        onClick={() => setActiveRowId(row.id)}
                        title="مشاهده جزئیات ردیف"
                        className="mx-auto block rounded-lg px-1.5 py-1 font-mono text-[10px] text-slate-400 hover:bg-indigo-50 hover:text-indigo-700"
                      >
                        {(index + 1).toLocaleString('fa-IR')}
                      </button>
                    </td>
                    {columns.map(col => {
                      const isEditing = editingCell?.rowId === row.id && editingCell.columnId === col.id;
                      const value = row.cells?.[col.id] || '';
                      return (
                        <td key={col.id} className="border-b border-l border-slate-100 px-1.5 py-1">
                          {isEditing ? (
                            <CellEditor
                              initial={value}
                              column={col}
                              onCommit={next => void saveCell(row, col.id, next)}
                              onCancel={() => setEditingCell(null)}
                            />
                          ) : col.type === 'select' && col.options?.length ? (
                            <span className="block truncate rounded-lg bg-slate-100 px-2 py-1.5 text-right text-xs text-slate-700">
                              {value || <span className="text-slate-300">—</span>}
                            </span>
                          ) : (
                            <button
                              onClick={() => canEdit && setEditingCell({ rowId: row.id, columnId: col.id })}
                              className={`block w-full truncate rounded-lg px-2 py-1.5 text-right text-xs text-slate-700 ${
                                canEdit ? 'hover:bg-emerald-50' : 'cursor-default'
                              }`}
                              title={value || '—'}
                            >
                              {value || <span className="text-slate-300">—</span>}
                            </button>
                          )}
                          {col.type === 'select' && col.options?.length && canEdit && !isEditing ? (
                            <button
                              onClick={() => setEditingCell({ rowId: row.id, columnId: col.id })}
                              className="mt-0.5 w-full rounded-md border border-dashed border-slate-200 py-0.5 text-[10px] text-slate-400 hover:border-emerald-300 hover:text-emerald-700"
                            >
                              تغییر گزینه
                            </button>
                          ) : null}
                        </td>
                      );
                    })}
                    <td className="border-b border-slate-100 px-1 text-center">
                      {canEdit && (
                        <button
                          onClick={() => void deleteRow(row)}
                          title="حذف ردیف"
                          className="rounded-lg p-1.5 text-slate-300 hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {canEdit && columns.length > 0 && (
                  <tr className="bg-emerald-50/40">
                    <td className="border-l border-slate-100 px-2 py-1.5 text-center text-[10px] font-bold text-emerald-700">
                      <Plus className="mx-auto h-3.5 w-3.5" />
                    </td>
                    {columns.map(col => (
                      <td key={col.id} className="border-l border-slate-100 px-1.5 py-1">
                        {col.type === 'select' && col.options?.length ? (
                          <select
                            value={draftRow[col.id] || ''}
                            onChange={e => setDraftRow(prev => ({ ...prev, [col.id]: e.target.value }))}
                            className="w-full rounded-lg border border-emerald-200 bg-white px-2 py-1.5 text-xs outline-none focus:border-emerald-400"
                          >
                            <option value="">— انتخاب —</option>
                            {col.options.map(opt => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            value={draftRow[col.id] || ''}
                            onChange={e => setDraftRow(prev => ({ ...prev, [col.id]: e.target.value }))}
                            onKeyDown={e => { if (e.key === 'Enter') void addRow(); }}
                            placeholder={col.name}
                            type={col.type === 'number' ? 'number' : col.type === 'date' ? 'date' : 'text'}
                            className="w-full rounded-lg border border-emerald-200 bg-white px-2 py-1.5 text-xs outline-none placeholder:text-slate-300 focus:border-emerald-400"
                          />
                        )}
                      </td>
                    ))}
                    <td className="px-1 text-center">
                      <button
                        onClick={() => void addRow()}
                        disabled={savingRow}
                        title="افزودن ردیف"
                        className="rounded-lg bg-emerald-600 p-1.5 text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {savingRow ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {columns.length === 0 && (
              <p className="p-8 text-center text-xs text-slate-400">
                این جدول ستونی ندارد؛ {canEdit ? 'از دکمه «ستون جدید» استفاده کنید.' : ''}
              </p>
            )}
            {columns.length > 0 && rows.length === 0 && (
              <p className="border-t border-slate-100 p-4 text-center text-[11px] text-slate-400">
                {hasActiveFilters ? 'ردیفی با این فیلترها پیدا نشد.' : 'ردیفی ثبت نشده است؛ مقادیر را در ردیف سبز وارد و تأیید کنید.'}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
      {/* Sheets list */}
      <aside className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex items-center justify-between px-1">
          <h2 className="flex items-center gap-1.5 text-xs font-black text-slate-800">
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
            جدول اطلاعات
          </h2>
          {canCreate && (
            <button
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700"
            >
              <Plus className="h-3.5 w-3.5" />
              جدول جدید
            </button>
          )}
        </div>
        <label className="relative block">
          <Search className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="جست‌وجوی جدول..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pr-9 pl-3 text-xs outline-none focus:border-emerald-400 focus:bg-white"
          />
        </label>
        <div className="max-h-[520px] space-y-1 overflow-y-auto">
          {loading && (
            <p className="flex items-center justify-center gap-2 p-6 text-xs text-slate-400">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              در حال دریافت جدول‌ها...
            </p>
          )}
          {error && <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}
          {!loading && filtered.map(table => (
            <div
              key={table.id}
              className={`group flex items-center gap-2 rounded-xl border px-2.5 py-2.5 transition ${
                selectedId === table.id
                  ? 'border-emerald-300 bg-emerald-50'
                  : 'border-transparent hover:border-slate-200 hover:bg-slate-50'
              }`}
            >
              <button onClick={() => void openTable(table.id)} className="flex min-w-0 flex-1 items-center gap-2 text-right">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                  <TableIcon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-bold text-slate-800">{table.name}</span>
                  <span className="mt-0.5 block text-[10px] text-slate-400">
                    {(table.rows_count || 0).toLocaleString('fa-IR')} ردیف
                    {table.creator?.name ? ` • ${table.creator.name}` : ''}
                  </span>
                </span>
              </button>
              {canDelete && (
                <button
                  onClick={() => void deleteTable(table)}
                  title="حذف جدول"
                  className="rounded-lg p-1.5 text-slate-300 opacity-0 transition hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
          {!loading && !filtered.length && !error && (
            <p className="p-6 text-center text-[11px] text-slate-400">
              {search ? 'جدولی با این نام پیدا نشد.' : 'هنوز جدولی ساخته نشده است.'}
            </p>
          )}
        </div>
      </aside>

      {/* Sheet grid */}
      {fullscreen ? (
        <div className="fixed inset-0 z-[70] flex flex-col bg-slate-100/95 p-3 backdrop-blur-sm sm:p-5">
          <div className="mx-auto flex h-full w-full max-w-[1400px] flex-col overflow-hidden">
            {grid}
          </div>
        </div>
      ) : grid}

      {createOpen && (
        <CreateTableModal
          onClose={() => setCreateOpen(false)}
          onCreated={table => {
            setCreateOpen(false);
            setTables(prev => [table, ...prev]);
            void openTable(table.id);
          }}
        />
      )}

      {columnModal && detail && (
        <ColumnModal
          key={columnModal.mode === 'edit' ? columnModal.column.id : 'new'}
          initial={columnModal.mode === 'edit' ? columnModal.column : null}
          onClose={() => setColumnModal(null)}
          onSave={col => {
            if (columnModal.mode === 'edit') {
              void persistColumns(columns.map(c => c.id === col.id ? col : c));
            } else {
              void persistColumns([...columns, col]);
            }
          }}
        />
      )}

      {activeRow && detail && (
        <RowDetailsModal
          tableId={detail.id}
          tableName={detail.name}
          row={activeRow}
          columns={columns}
          canEdit={canEdit}
          users={users}
          tasks={tasks}
          onClose={() => setActiveRowId(null)}
          onSaved={updated => {
            patchRowInDetail(updated.id, updated);
            setActiveRowId(updated.id);
          }}
          onDeleted={() => {
            setDetail(prev => prev ? { ...prev, rows: (prev.rows || []).filter(r => r.id !== activeRow.id) } : prev);
            setTables(prev => prev.map(t => t.id === detail.id ? { ...t, rows_count: Math.max(0, (t.rows_count || 1) - 1) } : t));
            setActiveRowId(null);
          }}
          onOpenTask={(taskId) => {
            setActiveRowId(null);
            setSelectedTaskId(taskId);
          }}
        />
      )}

      {grantsOpen && detail && (
        <TableGrantsModal
          table={detail}
          users={users}
          onClose={() => setGrantsOpen(false)}
          onSaved={grants => {
            setDetail(prev => prev ? { ...prev, grants } : prev);
            setGrantsOpen(false);
          }}
        />
      )}
    </div>
  );
};

const CellEditor: React.FC<{
  initial: string;
  column: TableColumn;
  onCommit: (value: string) => void;
  onCancel: () => void;
}> = ({ initial, column, onCommit, onCancel }) => {
  const [value, setValue] = useState(initial);
  if (column.type === 'select' && column.options?.length) {
    return (
      <select
        autoFocus
        value={value}
        onChange={e => onCommit(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape') onCancel(); }}
        onBlur={() => onCancel()}
        className="w-full rounded-lg border border-emerald-400 bg-white px-2 py-1.5 text-xs outline-none"
      >
        <option value="">— انتخاب —</option>
        {column.options.map(opt => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    );
  }
  return (
    <input
      autoFocus
      value={value}
      type={column.type === 'number' ? 'number' : column.type === 'date' ? 'date' : 'text'}
      onChange={e => setValue(e.target.value)}
      onBlur={() => onCommit(value)}
      onKeyDown={e => {
        if (e.key === 'Enter') onCommit(value);
        if (e.key === 'Escape') onCancel();
      }}
      className="w-full rounded-lg border border-emerald-400 bg-white px-2 py-1.5 text-xs outline-none"
    />
  );
};

const ColumnModal: React.FC<{
  initial: TableColumn | null;
  onClose: () => void;
  onSave: (column: TableColumn) => void;
}> = ({ initial, onClose, onSave }) => {
  const [name, setName] = useState(initial?.name || '');
  const [type, setType] = useState(initial?.type || 'text');
  const [optionsText, setOptionsText] = useState((initial?.options || []).join('\n'));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const options = type === 'select'
      ? optionsText.split(/[\n،,]/).map(o => o.trim()).filter(Boolean)
      : undefined;
    onSave({
      id: initial?.id || newColumnId(),
      name: name.trim(),
      type,
      ...(options?.length ? { options } : {}),
    });
  };

  return (
    <div className="fixed inset-0 z-[76] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
      <form onSubmit={submit} className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-black text-slate-900">{initial ? 'ویرایش ستون' : 'ستون جدید'}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <label className="block text-[11px] font-bold text-slate-600">
          نام ستون <span className="text-rose-500">*</span>
          <input
            autoFocus
            required
            value={name}
            onChange={e => setName(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs outline-none focus:border-emerald-400"
          />
        </label>
        <label className="block text-[11px] font-bold text-slate-600">
          نوع ستون
          <select
            value={type}
            onChange={e => setType(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs outline-none focus:border-emerald-400"
          >
            {Object.entries(COLUMN_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        {type === 'select' && (
          <label className="block text-[11px] font-bold text-slate-600">
            گزینه‌ها (هر گزینه در یک سطر)
            <textarea
              value={optionsText}
              onChange={e => setOptionsText(e.target.value)}
              rows={4}
              placeholder={'در انتظار بررسی\nتأیید شده\nرد شده'}
              className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs outline-none focus:border-emerald-400"
            />
          </label>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl px-3 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100">
            انصراف
          </button>
          <button className="rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700">
            {initial ? 'ذخیره تغییرات' : 'افزودن ستون'}
          </button>
        </div>
      </form>
    </div>
  );
};

const RowDetailsModal: React.FC<{
  tableId: number;
  tableName: string;
  row: DamDataRow;
  columns: TableColumn[];
  canEdit: boolean;
  users: { id: string; name: string; family?: string }[];
  tasks: { id: string; title: string; status?: string }[];
  onClose: () => void;
  onSaved: (row: DamDataRow) => void;
  onDeleted: () => void;
  onOpenTask: (taskId: string) => void;
}> = ({ tableId, tableName, row, columns, canEdit, users, tasks, onClose, onSaved, onDeleted, onOpenTask }) => {
  const { notify } = useApp();
  const [cells, setCells] = useState<Record<string, string>>(row.cells || {});
  const [taskId, setTaskId] = useState<string>(row.task_id != null ? String(row.task_id) : '');
  const [taskSearch, setTaskSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [activities, setActivities] = useState<RowActivity[]>(row.activities || []);
  const [activitiesLoading, setActivitiesLoading] = useState(false);

  useEffect(() => {
    setActivitiesLoading(true);
    request<{ data: RowActivity[] }>(`/dam/data-tables/${tableId}/rows/${row.id}/activities`)
      .then(result => setActivities(result.data || []))
      .catch(() => setActivities(row.activities || []))
      .finally(() => setActivitiesLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId, row.id]);

  const taskOptions = tasks.filter(t =>
    !taskSearch.trim() || t.title.includes(taskSearch.trim()) || t.id.includes(taskSearch.trim())
  ).slice(0, 50);

  const save = async () => {
    if (!canEdit) return;
    setSaving(true);
    try {
      const result = await request<{ data: DamDataRow }>(`/dam/data-tables/${tableId}/rows/${row.id}`, {
        method: 'PATCH',
        body: { cells, task_id: taskId ? Number(taskId) : null },
      });
      notify({ type: 'success', title: 'ردیف ذخیره شد', message: 'تغییرات ردیف با موفقیت ثبت شد.' });
      onSaved(result.data);
    } catch (e) {
      notify({ type: 'error', title: 'ذخیره ردیف ناموفق بود', message: getError(e) });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!canEdit || !window.confirm('این ردیف حذف شود؟')) return;
    setDeleting(true);
    try {
      await request(`/dam/data-tables/${tableId}/rows/${row.id}`, { method: 'DELETE' });
      notify({ type: 'success', title: 'ردیف حذف شد', message: 'ردیف از جدول حذف شد.' });
      onDeleted();
    } catch (e) {
      notify({ type: 'error', title: 'حذف ردیف ناموفق بود', message: getError(e) });
      setDeleting(false);
    }
  };

  const userName = (id?: number | null) => {
    if (id == null) return '—';
    const found = users.find(u => String(u.id) === String(id));
    return found ? `${found.name} ${found.family || ''}`.trim() : `کاربر ${id}`;
  };

  return (
    <div className="fixed inset-0 z-[76] flex items-center justify-center overflow-y-auto bg-slate-950/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-5 py-3.5">
          <div>
            <h2 className="text-sm font-black text-slate-900">جزئیات ردیف «{tableName}»</h2>
            <p className="mt-0.5 text-[11px] text-slate-500">
              ثبت‌کننده: {row.creator?.name || userName((row as { created_by?: number }).created_by)}
              {' • '}
              آخرین ویرایش: {row.updater?.name || userName((row as { updated_by?: number }).updated_by)}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-5 overflow-y-auto p-5">
          {/* Cells */}
          <div className="space-y-3">
            {columns.length === 0 && <p className="text-xs text-slate-400">این جدول ستونی ندارد.</p>}
            {columns.map(col => (
              <label key={col.id} className="block text-[11px] font-bold text-slate-600">
                {col.name}
                {col.type === 'select' && col.options?.length ? (
                  <select
                    value={cells[col.id] || ''}
                    disabled={!canEdit}
                    onChange={e => setCells(prev => ({ ...prev, [col.id]: e.target.value }))}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs outline-none focus:border-emerald-400 disabled:bg-slate-50"
                  >
                    <option value="">— انتخاب —</option>
                    {col.options.map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={cells[col.id] || ''}
                    disabled={!canEdit}
                    type={col.type === 'number' ? 'number' : col.type === 'date' ? 'date' : 'text'}
                    onChange={e => setCells(prev => ({ ...prev, [col.id]: e.target.value }))}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs outline-none focus:border-emerald-400 disabled:bg-slate-50"
                  />
                )}
              </label>
            ))}
          </div>

          {/* Task link */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
            <h3 className="mb-2 text-xs font-black text-slate-800">اتصال به تسک</h3>
            {row.task && (
              <button
                onClick={() => onOpenTask(String(row.task!.id))}
                className="mb-2 flex w-full items-center justify-between gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-right text-[11px] font-bold text-indigo-800 hover:bg-indigo-100"
              >
                <span className="truncate">{row.task.title}</span>
                <span className="shrink-0 text-indigo-500">مشاهده تسک ←</span>
              </button>
            )}
            {canEdit ? (
              <div className="space-y-2">
                <input
                  value={taskSearch}
                  onChange={e => setTaskSearch(e.target.value)}
                  placeholder="جست‌وجوی تسک..."
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] outline-none focus:border-emerald-400"
                />
                <select
                  value={taskId}
                  onChange={e => setTaskId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs outline-none focus:border-emerald-400"
                >
                  <option value="">بدون اتصال به تسک</option>
                  {taskOptions.filter(t => /^\d+$/.test(t.id)).map(t => (
                    <option key={t.id} value={t.id}>{t.title}</option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400">فقط تسک‌های ثبت‌شده در سرور قابل اتصال‌اند.</p>
              </div>
            ) : (
              !row.task && <p className="text-[11px] text-slate-400">این ردیف به تسکی متصل نیست.</p>
            )}
          </div>

          {/* Activities */}
          <div>
            <h3 className="mb-2 text-xs font-black text-slate-800">فعالیت‌های ردیف</h3>
            {activitiesLoading ? (
              <p className="flex items-center gap-2 text-[11px] text-slate-400">
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                در حال دریافت فعالیت‌ها...
              </p>
            ) : activities.length === 0 ? (
              <p className="text-[11px] text-slate-400">فعالیتی برای این ردیف ثبت نشده است.</p>
            ) : (
              <ol className="space-y-2">
                {activities.map(act => (
                  <li key={act.id} className="flex items-start gap-2.5 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2">
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold text-slate-700">
                        {ACTIVITY_LABELS[act.action] || act.action}
                        {act.metadata?.columns?.length ? ` (${act.metadata.columns.length.toLocaleString('fa-IR')} ستون)` : ''}
                      </p>
                      <p className="mt-0.5 text-[10px] text-slate-400">
                        {act.actor?.name || '—'}
                        {act.created_at ? ` • ${new Date(act.created_at).toLocaleString('fa-IR', { dateStyle: 'medium', timeStyle: 'short' })}` : ''}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3.5">
          {canEdit ? (
            <button
              onClick={() => void remove()}
              disabled={deleting}
              className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {deleting ? 'در حال حذف...' : 'حذف ردیف'}
            </button>
          ) : <span />}
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="rounded-xl px-3.5 py-2 text-xs font-bold text-slate-500 hover:bg-slate-200">
              بستن
            </button>
            {canEdit && (
              <button
                onClick={() => void save()}
                disabled={saving}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {saving ? 'در حال ذخیره...' : 'ذخیره تغییرات'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const TableGrantsModal: React.FC<{
  table: DamDataTable;
  users: { id: string; name: string; family?: string; position?: string }[];
  onClose: () => void;
  onSaved: (grants: { user_id: number; access: 'view' | 'edit' }[]) => void;
}> = ({ table, users, onClose, onSaved }) => {
  const { notify } = useApp();
  const [grants, setGrants] = useState<{ user_id: number; access: 'view' | 'edit' }[]>(table.grants || []);
  const [userSearch, setUserSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const candidates = users.filter(u =>
    /^\d+$/.test(String(u.id)) &&
    !grants.some(g => String(g.user_id) === String(u.id)) &&
    (!userSearch.trim() || `${u.name} ${u.family || ''}`.includes(userSearch.trim()))
  ).slice(0, 20);

  const save = async () => {
    setSaving(true);
    try {
      const result = await request<{ data: DamDataTable }>(`/dam/data-tables/${table.id}`, {
        method: 'PATCH',
        body: { grants },
      });
      notify({ type: 'success', title: 'دسترسی‌ها ذخیره شد', message: 'سطح دسترسی افراد به این جدول به‌روز شد.' });
      onSaved(result.data.grants || []);
    } catch (e) {
      notify({ type: 'error', title: 'ذخیره دسترسی‌ها ناموفق بود', message: getError(e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[76] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <h2 className="flex items-center gap-1.5 text-sm font-black text-slate-900">
            <ShieldCheck className="h-4 w-4 text-indigo-600" />
            دسترسی افراد به «{table.name}»
          </h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[60vh] space-y-3 overflow-y-auto p-5">
          <p className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-[11px] leading-5 text-slate-500">
            اگر فهرست خالی باشد، همه دارندگان مجوز کلی دارایی‌ها به جدول دسترسی دارند. با افزودن افراد،
            فقط همین فهرست (و سازنده جدول) به جدول دسترسی خواهند داشت.
          </p>
          <div>
            <input
              value={userSearch}
              onChange={e => setUserSearch(e.target.value)}
              placeholder="جست‌وجوی کاربر برای افزودن..."
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-indigo-400"
            />
            {userSearch.trim() && (
              <div className="mt-1.5 max-h-36 space-y-1 overflow-y-auto">
                {candidates.map(u => (
                  <button
                    key={u.id}
                    onClick={() => {
                      setGrants(prev => [...prev, { user_id: Number(u.id), access: 'view' }]);
                      setUserSearch('');
                    }}
                    className="flex w-full items-center justify-between rounded-lg border border-slate-100 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-indigo-50"
                  >
                    <span>{u.name} {u.family || ''}</span>
                    <Plus className="h-3.5 w-3.5 text-indigo-600" />
                  </button>
                ))}
                {candidates.length === 0 && (
                  <p className="p-2 text-center text-[11px] text-slate-400">کاربری پیدا نشد.</p>
                )}
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            {grants.length === 0 && (
              <p className="rounded-xl border border-dashed border-slate-200 p-3 text-center text-[11px] text-slate-400">
                فردی اضافه نشده است؛ دسترسی عمومی (بر اساس مجوزهای کلی) فعال است.
              </p>
            )}
            {grants.map(g => {
              const user = users.find(u => String(u.id) === String(g.user_id));
              return (
                <div key={g.user_id} className="flex items-center gap-2 rounded-xl border border-slate-200 px-2.5 py-2">
                  <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-slate-700">
                    {user ? `${user.name} ${user.family || ''}`.trim() : `کاربر ${g.user_id}`}
                  </span>
                  <select
                    value={g.access}
                    onChange={e => setGrants(prev => prev.map(item =>
                      item.user_id === g.user_id ? { ...item, access: e.target.value as 'view' | 'edit' } : item
                    ))}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] outline-none"
                  >
                    <option value="view">فقط مشاهده</option>
                    <option value="edit">مشاهده و ویرایش</option>
                  </select>
                  <button
                    onClick={() => setGrants(prev => prev.filter(item => item.user_id !== g.user_id))}
                    title="حذف دسترسی"
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3.5">
          <button onClick={onClose} className="rounded-xl px-3.5 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100">
            انصراف
          </button>
          <button
            onClick={() => void save()}
            disabled={saving}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? 'در حال ذخیره...' : 'ذخیره دسترسی‌ها'}
          </button>
        </div>
      </div>
    </div>
  );
};

const CreateTableModal: React.FC<{ onClose: () => void; onCreated: (table: DamDataTable) => void }> = ({
  onClose, onCreated,
}) => {
  const { notify } = useApp();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [columnsText, setColumnsText] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const columns = columnsText
        .split(/[,،\n]/)
        .map(part => part.trim())
        .filter(Boolean)
        .map(colName => ({ id: newColumnId(), name: colName, type: 'text' }));
      const result = await request<{ data: DamDataTable }>('/dam/data-tables', {
        method: 'POST',
        body: { name: name.trim(), description: description.trim() || null, columns },
      });
      notify({ type: 'success', title: 'جدول ساخته شد', message: `«${name.trim()}» به جدول اطلاعات اضافه شد.` });
      onCreated(result.data);
    } catch (err) {
      notify({ type: 'error', title: 'ساخت جدول ناموفق بود', message: getError(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[76] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
      <form onSubmit={submit} className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-black text-slate-900">ساخت جدول جدید</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <label className="block text-[11px] font-bold text-slate-600">
          نام جدول <span className="text-rose-500">*</span>
          <input
            autoFocus
            required
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="برای نمونه: فهرست تجهیزات استودیو"
            className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs outline-none focus:border-emerald-400"
          />
        </label>
        <label className="block text-[11px] font-bold text-slate-600">
          توضیحات (اختیاری)
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={2}
            className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs outline-none focus:border-emerald-400"
          />
        </label>
        <label className="block text-[11px] font-bold text-slate-600">
          ستون‌های اولیه (اختیاری)
          <textarea
            value={columnsText}
            onChange={e => setColumnsText(e.target.value)}
            rows={2}
            placeholder="نام ستون‌ها با ویرگول جدا شود؛ مثلاً: عنوان، تعداد، وضعیت"
            className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs outline-none focus:border-emerald-400"
          />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl px-3 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100">
            انصراف
          </button>
          <button disabled={busy || !name.trim()} className="rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
            {busy ? 'در حال ساخت...' : 'ساخت جدول'}
          </button>
        </div>
      </form>
    </div>
  );
};
