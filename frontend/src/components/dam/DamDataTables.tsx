import React, { useCallback, useEffect, useState } from 'react';
import {
  Check,
  FileSpreadsheet,
  LoaderCircle,
  Plus,
  Search,
  Table as TableIcon,
  Trash2,
  X,
} from 'lucide-react';
import { request } from '../../api/client';
import { useApp } from '../../context/AppContext';

type TableColumn = { id: string; name: string; type?: string };
type DamDataRow = { id: number; cells?: Record<string, string>; position?: number };
type DamDataTable = {
  id: number;
  name: string;
  description?: string | null;
  columns?: TableColumn[];
  rows?: DamDataRow[];
  rows_count?: number;
  updated_at?: string;
  creator?: { id: number; name: string } | null;
};

const getError = (error: unknown) => error instanceof Error ? error.message : 'عملیات انجام نشد. دوباره تلاش کنید.';
const newColumnId = () => `col-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/**
 * «جدول اطلاعات» — هر جدول مانند یک شیت اکسل است؛
 * ستون‌ها روی خود جدول و ردیف‌ها به‌صورت رکورد دیتابیسی ذخیره می‌شوند.
 */
export const DamDataTables: React.FC = () => {
  const { hasPermission, notify } = useApp();
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

  const canEdit = hasPermission('assets.edit_info') || hasPermission('assets.upload');
  const canCreate = hasPermission('assets.upload');
  const canDelete = hasPermission('assets.delete') || hasPermission('assets.manage_access');

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
  const rows: DamDataRow[] = [...(detail?.rows || [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  const persistColumns = async (nextColumns: TableColumn[]) => {
    if (!detail) return;
    try {
      const result = await request<{ data: DamDataTable }>(`/dam/data-tables/${detail.id}`, {
        method: 'PATCH',
        body: { columns: nextColumns },
      });
      setDetail(prev => prev ? { ...prev, columns: result.data.columns || [] } : prev);
    } catch (e) {
      notify({ type: 'error', title: 'ذخیره ستون‌ها ناموفق بود', message: getError(e) });
    }
  };

  const handleAddColumn = () => {
    const name = window.prompt('نام ستون جدید:')?.trim();
    if (!name) return;
    void persistColumns([...columns, { id: newColumnId(), name, type: 'text' }]);
  };

  const handleRenameColumn = (column: TableColumn) => {
    const name = window.prompt('نام جدید ستون:', column.name)?.trim();
    if (!name || name === column.name) return;
    void persistColumns(columns.map(c => c.id === column.id ? { ...c, name } : c));
  };

  const handleDeleteColumn = (column: TableColumn) => {
    if (!window.confirm(`ستون «${column.name}» حذف شود؟ مقادیر این ستون در همه ردیف‌ها پاک می‌شود.`)) return;
    const next = columns.filter(c => c.id !== column.id);
    void persistColumns(next);
    // پاک‌سازی مقادیر ستون از ردیف‌ها
    rows.forEach(row => {
      if (row.cells && column.id in row.cells) {
        const cells = { ...row.cells };
        delete cells[column.id];
        void request(`/dam/data-tables/${detail!.id}/rows/${row.id}`, { method: 'PATCH', body: { cells } })
          .then(() => setDetail(prev => prev ? {
            ...prev,
            rows: (prev.rows || []).map(r => r.id === row.id ? { ...r, cells } : r),
          } : prev))
          .catch(() => undefined);
      }
    });
  };

  const saveCell = async (row: DamDataRow, columnId: string, value: string) => {
    if (!detail) return;
    const cells = { ...(row.cells || {}), [columnId]: value };
    // خوش‌بینانه در UI اعمال می‌شود
    setDetail(prev => prev ? {
      ...prev,
      rows: (prev.rows || []).map(r => r.id === row.id ? { ...r, cells } : r),
    } : prev);
    setEditingCell(null);
    try {
      await request(`/dam/data-tables/${detail.id}/rows/${row.id}`, { method: 'PATCH', body: { cells } });
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
      <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
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
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-400">{rows.length.toLocaleString('fa-IR')} ردیف</span>
                {canEdit && (
                  <button
                    onClick={handleAddColumn}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    ستون جدید
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/80">
                    <th className="w-10 border-b border-l border-slate-200 px-2 py-2.5 text-[10px] font-bold text-slate-400">#</th>
                    {columns.map(col => (
                      <th key={col.id} className="group min-w-[140px] border-b border-l border-slate-200 px-2 py-2 text-right">
                        <span className="flex items-center justify-between gap-1">
                          <span className="truncate text-[11px] font-black text-slate-700">{col.name}</span>
                          {canEdit && (
                            <span className="flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                              <button
                                onClick={() => handleRenameColumn(col)}
                                title="تغییر نام ستون"
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
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={row.id} className="transition hover:bg-slate-50/60">
                      <td className="border-b border-l border-slate-100 px-2 py-1.5 text-center font-mono text-[10px] text-slate-400">
                        {(index + 1).toLocaleString('fa-IR')}
                      </td>
                      {columns.map(col => {
                        const isEditing = editingCell?.rowId === row.id && editingCell.columnId === col.id;
                        const value = row.cells?.[col.id] || '';
                        return (
                          <td key={col.id} className="border-b border-l border-slate-100 px-1.5 py-1">
                            {isEditing ? (
                              <CellEditor
                                initial={value}
                                onCommit={next => void saveCell(row, col.id, next)}
                                onCancel={() => setEditingCell(null)}
                              />
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
                          <input
                            value={draftRow[col.id] || ''}
                            onChange={e => setDraftRow(prev => ({ ...prev, [col.id]: e.target.value }))}
                            onKeyDown={e => { if (e.key === 'Enter') void addRow(); }}
                            placeholder={col.name}
                            className="w-full rounded-lg border border-emerald-200 bg-white px-2 py-1.5 text-xs outline-none placeholder:text-slate-300 focus:border-emerald-400"
                          />
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
                  ردیفی ثبت نشده است؛ مقادیر را در ردیف سبز وارد و تأیید کنید.
                </p>
              )}
            </div>
          </>
        )}
      </div>

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
    </div>
  );
};

const CellEditor: React.FC<{ initial: string; onCommit: (value: string) => void; onCancel: () => void }> = ({
  initial, onCommit, onCancel,
}) => {
  const [value, setValue] = useState(initial);
  return (
    <input
      autoFocus
      value={value}
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
