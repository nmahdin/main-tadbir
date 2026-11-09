/**
 * DS-2.1 DataTable — pure state logic (unit-testable).
 *
 * Client mode runs rows through search → filters → sort → paginate
 * here. Server mode never touches the rows: the component only
 * reports a DataTableServerState contract and renders what the
 * caller fetched, so large tenant datasets are never pulled into
 * the browser wholesale.
 */

export type SortDirection = 'asc' | 'desc';

export interface DataTableSort {
  key: string;
  direction: SortDirection;
}

export interface DataTableState {
  page: number;
  pageSize: number;
  sort: DataTableSort | null;
  query: string;
  /** column key -> selected filter value ('' clears) */
  filters: Record<string, string>;
}

/** Explicit contract handed to server-driven callers. */
export interface DataTableServerState extends DataTableState {
  offset: number;
}

export const DEFAULT_PAGE_SIZE = 10;

export function initialDataTableState(pageSize: number = DEFAULT_PAGE_SIZE): DataTableState {
  return { page: 1, pageSize, sort: null, query: '', filters: {} };
}

export function toServerState(state: DataTableState): DataTableServerState {
  return { ...state, offset: (state.page - 1) * state.pageSize };
}

/** Header click cycle: unsorted → asc → desc → unsorted. */
export function cycleSort(current: DataTableSort | null, key: string): DataTableSort | null {
  if (!current || current.key !== key) return { key, direction: 'asc' };
  if (current.direction === 'asc') return { key, direction: 'desc' };
  return null;
}

export function compareValues(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), 'fa');
}

export function sortRows<Row>(rows: readonly Row[], sort: DataTableSort | null, valueOf: (row: Row, key: string) => unknown): Row[] {
  if (!sort) return [...rows];
  const factor = sort.direction === 'asc' ? 1 : -1;
  return [...rows].sort((left, right) => factor * compareValues(valueOf(left, sort.key), valueOf(right, sort.key)));
}

export function filterRows<Row>(
  rows: readonly Row[],
  state: Pick<DataTableState, 'query' | 'filters'>,
  searchTextOf: (row: Row) => string,
  filterValueOf: (row: Row, key: string) => string,
): Row[] {
  const query = state.query.trim().toLocaleLowerCase();
  const activeFilters = Object.entries(state.filters).filter(([, value]) => value !== '');
  return rows.filter(row => {
    if (query && !searchTextOf(row).toLocaleLowerCase().includes(query)) return false;
    return activeFilters.every(([key, value]) => filterValueOf(row, key) === value);
  });
}

export function paginateRows<Row>(rows: readonly Row[], page: number, pageSize: number): { pageRows: Row[]; page: number; totalPages: number } {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return { pageRows: rows.slice(start, start + pageSize), page: safePage, totalPages };
}

/** Any state change except paging itself returns to page 1. */
export function withFirstPage(state: DataTableState, patch: Partial<DataTableState>): DataTableState {
  const next = { ...state, ...patch };
  if (patch.page === undefined) next.page = 1;
  return next;
}

export function toggleSelection(selected: ReadonlySet<string>, key: string): Set<string> {
  const next = new Set(selected);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

export function togglePageSelection(selected: ReadonlySet<string>, pageKeys: readonly string[]): Set<string> {
  const allSelected = pageKeys.length > 0 && pageKeys.every(key => selected.has(key));
  const next = new Set(selected);
  for (const key of pageKeys) {
    if (allSelected) next.delete(key);
    else next.add(key);
  }
  return next;
}

export function pageSelectionState(selected: ReadonlySet<string>, pageKeys: readonly string[]): 'none' | 'some' | 'all' {
  if (pageKeys.length === 0) return 'none';
  const count = pageKeys.filter(key => selected.has(key)).length;
  if (count === 0) return 'none';
  return count === pageKeys.length ? 'all' : 'some';
}
