import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Columns3, Search } from 'lucide-react';
import { Button, Checkbox, EmptyState, ErrorState, Select } from './Primitives';
import {
  cycleSort,
  filterRows,
  initialDataTableState,
  pageSelectionState,
  paginateRows,
  sortRows,
  togglePageSelection,
  toggleSelection,
  toServerState,
  withFirstPage,
  type DataTableState,
} from './dataTableLogic';

export type { DataTableState };
export type { DataTableServerState } from './dataTableLogic';
export { toServerState };

/**
 * DS-2.1 reusable DataTable.
 *
 * Two explicit modes:
 * - `client` (default): the rows already in memory are searched,
 *   filtered, sorted and paginated locally. Right for small,
 *   already-loaded lists.
 * - `server`: the component renders exactly the page it is given and
 *   reports every interaction through `onStateChange` as a
 *   DataTableServerState ({ page, pageSize, offset, sort, query,
 *   filters }). The caller fetches that page from the API — tenant
 *   datasets are never pulled into the browser wholesale, and this
 *   package adds no backend endpoint.
 *
 * State is controlled when `state` is passed, uncontrolled otherwise.
 * The simple DS-1 `Table` primitives remain for static layouts.
 */

export interface DataTableColumn<Row> {
  key: string;
  header: React.ReactNode;
  /** Value used for sorting/searching/filtering. Defaults to row[key]. */
  accessor?: (row: Row) => unknown;
  render?: (row: Row) => React.ReactNode;
  sortable?: boolean;
  /** When set, a filter dropdown for this column appears in the toolbar. */
  filterOptions?: { value: string; label: string }[];
  hideable?: boolean;
  align?: 'start' | 'center' | 'end';
}

export interface DataTableProps<Row> {
  columns: DataTableColumn<Row>[];
  rows: Row[];
  /** Typed row identity: a key of the row or an extractor function. */
  rowKey: keyof Row | ((row: Row) => string);
  mode?: 'client' | 'server';
  /** Required in server mode: total row count across all pages. */
  total?: number;
  state?: DataTableState;
  defaultState?: DataTableState;
  onStateChange?: (state: DataTableState) => void;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  selectable?: boolean;
  selectedKeys?: ReadonlySet<string>;
  onSelectionChange?: (selected: Set<string>) => void;
  /** Bulk actions for the current selection (rendered in the toolbar). */
  bulkActions?: (selected: ReadonlySet<string>) => React.ReactNode;
  rowActions?: (row: Row) => React.ReactNode;
  caption?: string;
  searchPlaceholder?: string;
  emptyTitle?: string;
  pageSizeOptions?: number[];
}

const faNumber = (value: number) => value.toLocaleString('fa-IR');

export function DataTable<Row>(props: DataTableProps<Row>) {
  const {
    columns,
    rows,
    rowKey,
    mode = 'client',
    total,
    loading = false,
    error,
    onRetry,
    selectable = false,
    rowActions,
    caption,
    searchPlaceholder = 'جست‌وجو…',
    emptyTitle = 'موردی برای نمایش نیست.',
    pageSizeOptions = [10, 20, 50],
  } = props;

  const [internalState, setInternalState] = useState<DataTableState>(() => props.defaultState ?? initialDataTableState());
  const state = props.state ?? internalState;
  const setState = (next: DataTableState) => {
    if (props.state === undefined) setInternalState(next);
    props.onStateChange?.(next);
  };

  const [internalSelected, setInternalSelected] = useState<ReadonlySet<string>>(new Set());
  const selected = props.selectedKeys ?? internalSelected;
  const setSelected = (next: Set<string>) => {
    if (props.selectedKeys === undefined) setInternalSelected(next);
    props.onSelectionChange?.(next);
  };

  const [hiddenColumns, setHiddenColumns] = useState<ReadonlySet<string>>(new Set());
  const [columnMenuOpen, setColumnMenuOpen] = useState(false);
  const columnMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!columnMenuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (columnMenuRef.current && !columnMenuRef.current.contains(event.target as Node)) setColumnMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setColumnMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [columnMenuOpen]);

  const keyOf = (row: Row): string => (typeof rowKey === 'function' ? rowKey(row) : String(row[rowKey]));
  const valueOf = (row: Row, key: string): unknown => {
    const column = columns.find(item => item.key === key);
    if (column?.accessor) return column.accessor(row);
    return (row as Record<string, unknown>)[key];
  };

  const visibleColumns = columns.filter(column => !hiddenColumns.has(column.key));
  const filterableColumns = columns.filter(column => column.filterOptions);

  const processed = useMemo(() => {
    if (mode === 'server') {
      const totalRows = total ?? rows.length;
      const totalPages = Math.max(1, Math.ceil(totalRows / state.pageSize));
      return { pageRows: rows, totalRows, totalPages, page: Math.min(state.page, totalPages) };
    }
    const filtered = filterRows(
      rows,
      state,
      row => columns.map(column => String(valueOf(row, column.key) ?? '')).join(' '),
      (row, key) => String(valueOf(row, key) ?? ''),
    );
    const sorted = sortRows(filtered, state.sort, valueOf);
    const paged = paginateRows(sorted, state.page, state.pageSize);
    return { pageRows: paged.pageRows, totalRows: filtered.length, totalPages: paged.totalPages, page: paged.page };
    // valueOf/columns are stable enough for this memo's purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, rows, total, state, columns]);

  const pageKeys = processed.pageRows.map(keyOf);
  const selectionState = pageSelectionState(selected, pageKeys);
  const headerCheckboxRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (headerCheckboxRef.current) headerCheckboxRef.current.indeterminate = selectionState === 'some';
  }, [selectionState]);

  const toggleColumn = (key: string) => {
    setHiddenColumns(current => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div dir="rtl">
      <div className="ui-data-table-toolbar">
        <div className="relative min-w-52 flex-1 sm:max-w-72">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            type="search"
            value={state.query}
            onChange={event => setState(withFirstPage(state, { query: event.target.value }))}
            placeholder={searchPlaceholder}
            aria-label="جست‌وجو در جدول"
            className="ui-input pr-9"
          />
        </div>

        {filterableColumns.map(column => (
          <label key={column.key} className="flex items-center gap-2 text-xs font-bold text-slate-600">
            {typeof column.header === 'string' ? column.header : column.key}
            <Select
              aria-label={`فیلتر ${typeof column.header === 'string' ? column.header : column.key}`}
              value={state.filters[column.key] ?? ''}
              onChange={event => setState(withFirstPage(state, { filters: { ...state.filters, [column.key]: event.target.value } }))}
              className="min-w-32"
            >
              <option value="">همه</option>
              {column.filterOptions?.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </Select>
          </label>
        ))}

        <div ref={columnMenuRef} className="relative">
          <Button
            variant="secondary"
            size="sm"
            aria-haspopup="true"
            aria-expanded={columnMenuOpen}
            onClick={() => setColumnMenuOpen(open => !open)}
          >
            <Columns3 className="h-4 w-4" aria-hidden />
            ستون‌ها
          </Button>
          {columnMenuOpen && (
            <div className="ui-data-table-menu" role="group" aria-label="نمایش ستون‌ها">
              {columns.map(column => (
                <div key={column.key} className="py-1">
                  <Checkbox
                    label={typeof column.header === 'string' ? column.header : column.key}
                    checked={!hiddenColumns.has(column.key)}
                    disabled={column.hideable === false}
                    onChange={() => toggleColumn(column.key)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {selectable && selected.size > 0 && (
          <span className="text-xs font-bold text-slate-600" role="status">
            {faNumber(selected.size)} مورد انتخاب شده
            {props.bulkActions && <span className="mr-2 inline-flex gap-2">{props.bulkActions(selected)}</span>}
          </span>
        )}
      </div>

      <div className="ui-table-wrap" aria-busy={loading || undefined}>
        <table className="ui-table ui-data-table min-w-[560px]">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr>
              {selectable && (
                <th scope="col" className="w-10">
                  <input
                    ref={headerCheckboxRef}
                    type="checkbox"
                    checked={selectionState === 'all'}
                    onChange={() => setSelected(togglePageSelection(selected, pageKeys))}
                    aria-label="انتخاب همهٔ ردیف‌های این صفحه"
                  />
                </th>
              )}
              {visibleColumns.map(column => {
                const isSorted = state.sort?.key === column.key;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    data-sortable={column.sortable || undefined}
                    aria-sort={isSorted ? (state.sort?.direction === 'asc' ? 'ascending' : 'descending') : undefined}
                    style={{ textAlign: column.align ?? 'start' }}
                  >
                    {column.sortable ? (
                      <button
                        type="button"
                        className="ui-data-table-sort"
                        onClick={() => setState(withFirstPage(state, { sort: cycleSort(state.sort, column.key) }))}
                        aria-label={`مرتب‌سازی بر اساس ${typeof column.header === 'string' ? column.header : column.key}`}
                      >
                        {column.header}
                        {isSorted
                          ? (state.sort?.direction === 'asc'
                            ? <ArrowUp className="h-3.5 w-3.5" aria-hidden />
                            : <ArrowDown className="h-3.5 w-3.5" aria-hidden />)
                          : <ArrowUpDown className="h-3.5 w-3.5 opacity-50" aria-hidden />}
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
              {rowActions && <th scope="col">عملیات</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 4 }, (_, index) => (
                <tr key={`loading-${index}`} aria-hidden>
                  {selectable && <td><div className="h-4 animate-pulse rounded bg-slate-100" /></td>}
                  {visibleColumns.map(column => (
                    <td key={column.key}><div className="h-4 animate-pulse rounded bg-slate-100" /></td>
                  ))}
                  {rowActions && <td><div className="h-4 animate-pulse rounded bg-slate-100" /></td>}
                </tr>
              ))
            ) : error ? (
              <tr>
                <td colSpan={visibleColumns.length + (selectable ? 1 : 0) + (rowActions ? 1 : 0)}>
                  <ErrorState error={error} onRetry={onRetry} title="بارگذاری جدول ناموفق بود." />
                </td>
              </tr>
            ) : processed.pageRows.length === 0 ? (
              <tr>
                <td colSpan={visibleColumns.length + (selectable ? 1 : 0) + (rowActions ? 1 : 0)}>
                  <EmptyState title={emptyTitle} />
                </td>
              </tr>
            ) : (
              processed.pageRows.map(row => {
                const key = keyOf(row);
                const isSelected = selected.has(key);
                return (
                  <tr key={key} data-selected={isSelected || undefined}>
                    {selectable && (
                      <td>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => setSelected(toggleSelection(selected, key))}
                          aria-label={`انتخاب ردیف ${key}`}
                        />
                      </td>
                    )}
                    {visibleColumns.map(column => (
                      <td key={column.key} style={{ textAlign: column.align ?? 'start' }}>
                        {column.render ? column.render(row) : String(valueOf(row, column.key) ?? '—')}
                      </td>
                    ))}
                    {rowActions && <td><div className="flex flex-wrap gap-1">{rowActions(row)}</div></td>}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="ui-data-table-footer">
        <span>
          نمایش {processed.pageRows.length === 0 ? '۰' : faNumber((processed.page - 1) * state.pageSize + 1)}
          {' '}تا {faNumber((processed.page - 1) * state.pageSize + processed.pageRows.length)}
          {' '}از {faNumber(processed.totalRows)} مورد
        </span>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 font-bold">
            در هر صفحه
            <Select
              aria-label="تعداد ردیف در هر صفحه"
              value={String(state.pageSize)}
              onChange={event => setState(withFirstPage(state, { pageSize: Number(event.target.value) }))}
              className="min-w-20"
            >
              {pageSizeOptions.map(size => (
                <option key={size} value={size}>{faNumber(size)}</option>
              ))}
            </Select>
          </label>
          <Button variant="secondary" size="sm" disabled={processed.page <= 1 || loading} onClick={() => setState({ ...state, page: processed.page - 1 })}>
            صفحهٔ قبل
          </Button>
          <span aria-live="polite">صفحهٔ {faNumber(processed.page)} از {faNumber(processed.totalPages)}</span>
          <Button variant="secondary" size="sm" disabled={processed.page >= processed.totalPages || loading} onClick={() => setState({ ...state, page: processed.page + 1 })}>
            صفحهٔ بعد
          </Button>
        </div>
      </div>

      {loading && <span role="status" className="sr-only">در حال بارگذاری جدول…</span>}
    </div>
  );
}
