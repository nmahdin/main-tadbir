import React from 'react';
import { Button } from './Primitives';
import type { PageResult } from '../../queries/workspacePages';
export function FilterBar({ children }: { children: React.ReactNode }) { return <div className="flex flex-wrap items-end gap-3 p-4 bg-white border border-slate-200 rounded-xl mb-3" role="search" aria-label="فیلترهای صفحه">{children}</div>; }
export function Pagination({ meta, busy, onPage }: { meta?: PageResult['meta']; busy?: boolean; onPage: (page: number) => void }) {
  if (!meta) return null;
  const page = meta.current_page ?? 1; const last = meta.last_page ?? 1;
  return <nav aria-label="صفحه‌بندی" className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm">
    <span>صفحه {page.toLocaleString('fa-IR')} از {last.toLocaleString('fa-IR')} · {(meta.total ?? 0).toLocaleString('fa-IR')} مورد</span>
    <div className="flex gap-2"><Button variant="secondary" disabled={busy || page <= 1} onClick={() => onPage(page - 1)}>صفحه قبل</Button><Button variant="secondary" disabled={busy || page >= last} onClick={() => onPage(page + 1)}>صفحه بعد</Button></div>
  </nav>;
}
export function DataTable({ children, label }: { children: React.ReactNode; label: string }) { return <div className="max-w-full overflow-x-auto rounded-xl border border-slate-200 bg-white" tabIndex={0} aria-label={label}><table className="w-full min-w-[560px] text-right text-sm [&_th]:p-3 [&_td]:p-3 [&_tr]:border-b [&_tr]:border-slate-100">{children}</table></div>; }
