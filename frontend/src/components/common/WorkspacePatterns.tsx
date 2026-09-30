import React from 'react';
import { ChevronLeft, ChevronRight, Rows3 } from 'lucide-react';
import { Button, Select } from './Primitives';
import type { PageResult } from '../../queries/workspacePages';

export function FilterBar({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-end gap-3 p-4 bg-white border border-slate-200 rounded-xl mb-3" role="search" aria-label="فیلترهای صفحه">{children}</div>;
}

export function Pagination({
  meta,
  busy,
  onPage,
  onPerPage,
  perPageOptions = [10, 20, 50, 100],
}: {
  meta?: PageResult['meta'];
  busy?: boolean;
  onPage: (page: number) => void;
  onPerPage?: (perPage: number) => void;
  perPageOptions?: number[];
}) {
  if (!meta) return null;
  const page = meta.current_page ?? 1;
  const last = meta.last_page ?? 1;
  const total = meta.total ?? 0;
  const perPage = meta.per_page ?? 20;
  const hasPrevious = page > 1;
  const hasNext = page < last;
  const canResize = Boolean(onPerPage) && total > Math.min(...perPageOptions);

  if (!hasPrevious && !hasNext && !canResize) return null;

  return (
    <nav aria-label="صفحه‌بندی" className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-4 text-xs text-slate-600">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="font-bold text-slate-700">
          نمایش {Math.min((page - 1) * perPage + 1, total).toLocaleString('fa-IR')} تا {Math.min(page * perPage, total).toLocaleString('fa-IR')} از {total.toLocaleString('fa-IR')} مورد
        </span>
        {canResize && (
          <label className="inline-flex items-center gap-2 font-bold text-slate-500">
            <Rows3 className="w-4 h-4" />
            تعداد در صفحه
            <Select
              aria-label="تعداد موارد در صفحه"
              value={String(perPage)}
              disabled={busy}
              onChange={event => onPerPage?.(Number(event.target.value))}
              className="w-20 py-1.5 text-xs"
            >
              {perPageOptions.map(option => <option key={option} value={option}>{option.toLocaleString('fa-IR')}</option>)}
            </Select>
          </label>
        )}
      </div>
      {(hasPrevious || hasNext) && (
        <div className="flex items-center gap-2">
          {hasPrevious && (
            <Button variant="secondary" disabled={busy} onClick={() => onPage(page - 1)} className="border border-slate-200 bg-white hover:bg-slate-50 shadow-xs">
              <ChevronRight className="w-4 h-4" />صفحه قبل
            </Button>
          )}
          <span className="min-w-20 text-center font-bold text-slate-500">صفحه {page.toLocaleString('fa-IR')} از {last.toLocaleString('fa-IR')}</span>
          {hasNext && (
            <Button variant="secondary" disabled={busy} onClick={() => onPage(page + 1)} className="border border-slate-200 bg-white hover:bg-slate-50 shadow-xs">
              صفحه بعد<ChevronLeft className="w-4 h-4" />
            </Button>
          )}
        </div>
      )}
    </nav>
  );
}

export function DataTable({ children, label }: { children: React.ReactNode; label: string }) {
  return <div className="max-w-full overflow-x-auto rounded-xl border border-slate-200 bg-white" tabIndex={0} aria-label={label}><table className="w-full min-w-[560px] text-right text-sm [&_th]:p-3 [&_td]:p-3 [&_tr]:border-b [&_tr]:border-slate-100">{children}</table></div>;
}
