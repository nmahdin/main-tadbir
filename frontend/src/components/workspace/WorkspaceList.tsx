import { usePageCorrection } from '../../routing/usePageCorrection';
import React, { useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useWorkspacePage, type WorkspaceModule } from '../../queries/workspacePages';
import { parseListQuery, listStatuses } from '../../routing/listQuery';
import { useApp } from '../../context/AppContext';
import { Button, EmptyState, ErrorState, Input, LoadingState, PageHeader, Select } from '../common/Primitives';
import { DataTable, FilterBar, Pagination } from '../common/WorkspacePatterns';
import { EntityPreview } from './details';
import { formatPersianDate } from '../../utils/date';
const filterNames: Record<string,string> = {status:'وضعیت',search:'جستجو',due:'سررسید',assignee:'مسئول',owner:'مالک',project_id:'پروژه',project_manager_id:'مدیر پروژه',sort:'مرتب‌سازی',direction:'ترتیب'};
const filterValues: Record<string,string> = {me:'من',today:'امروز',overdue:'عقب‌افتاده',asc:'صعودی',desc:'نزولی',created_at:'تاریخ ایجاد',updated_at:'آخرین تغییر',deadline:'سررسید'};
const titles = { projects: 'پروژه‌ها', tasks: 'تسک‌ها', contents: 'محتواها' };
export const WorkspaceList: React.FC<{ module: 'projects' | 'tasks' | 'contents' }> = ({ module }) => {
  const app = useApp(); const [search, setSearch] = useSearchParams(); const location = useLocation();
  const custom = module === 'contents' ? app.contentStatuses.map(s => s.id) : [];
  const filters = parseListQuery(location.search, module, custom);
  const [draft, setDraft] = useState(filters.search || '');
  useEffect(() => setDraft(filters.search || ''), [filters.search]);
  const view = search.get('view') === 'cards' ? 'cards' : 'list';
  const query = useWorkspacePage(module, { ...filters, per_page: 20 });
  usePageCorrection(query);
  const rows = query.data?.data ?? [];
  const labels = { ...listStatuses[module], ...(module === 'contents' ? Object.fromEntries(app.contentStatuses.map(s => [s.id, s.label])) : {}) };
  const update = (key: string, value: string) => { const next = new URLSearchParams(filters); if (value) next.set(key,value); else next.delete(key); if (key !== 'page') next.delete('page'); if (key !== 'view' && view === 'cards') next.set('view',view); setSearch(next); };
  const create = module === 'projects' ? () => app.setIsCreateProjectOpen(true) : module === 'tasks' ? () => app.setIsCreateTaskOpen(true) : () => app.setIsCreateContentOpen(true);
  const creationLabel = module === 'projects' ? 'ایجاد پروژه جدید' : module === 'tasks' ? 'وظیفه جدید' : 'ایجاد محتوای جدید';
  const detail = (id: string) => { const back = new URLSearchParams(search); back.delete('preview'); return `/${module}/${id}?${new URLSearchParams({ returnTo: `/${module}${back.size ? `?${back}` : ''}`, ...(module === 'tasks' ? { display: 'page' } : {}) })}`; };
  return <section className="max-w-7xl mx-auto p-2 sm:p-5 space-y-3 min-w-0" dir="rtl">
    <PageHeader title={titles[module]} description="فهرست سرور؛ فیلتر و صفحه با نشانی قابل اشتراک است." actions={app.hasPermission(`${module === 'contents' ? 'content' : module}.create`) && <Button onClick={create}>{creationLabel}</Button>} />
    <FilterBar>
      <form className="flex gap-2 flex-wrap max-w-full" onSubmit={e => { e.preventDefault(); update('search',draft); }}><label className="text-xs">جستجو<Input value={draft} maxLength={120} onChange={e => setDraft(e.target.value)} aria-label="جستجوی صفحه" /></label><Button className="self-end" variant="secondary" type="submit">جستجو</Button></form>
      <label className="text-xs">وضعیت<Select aria-label="فیلتر وضعیت" value={filters.status || ''} onChange={e => update('status',e.target.value)}><option value="">همه وضعیت‌ها</option>{Object.entries(labels).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</Select></label>
      {module === 'tasks' && <><label className="text-xs">مسئول<Select aria-label="مسئول" value={filters.assignee || ''} onChange={e => update('assignee', e.target.value)}><option value="">همهٔ مجاز</option><option value="me">من</option></Select></label><label className="text-xs">سررسید<Select aria-label="سررسید" value={filters.due || ''} onChange={e => update('due',e.target.value)}><option value="">همه</option><option value="today">امروز</option><option value="overdue">عقب‌افتاده</option></Select></label></>}
      <label className="text-xs">مرتب‌سازی<Select aria-label="مرتب‌سازی" value={filters.sort || 'created_at'} onChange={e => update('sort', e.target.value)}><option value="created_at">تاریخ ایجاد</option><option value="updated_at">آخرین تغییر</option><option value="deadline">سررسید</option></Select></label>
      <label className="text-xs">ترتیب<Select aria-label="ترتیب" value={filters.direction || 'desc'} onChange={e => update('direction', e.target.value)}><option value="desc">نزولی</option><option value="asc">صعودی</option></Select></label>
      <label className="text-xs">نما<Select aria-label="نما" value={view} onChange={e => update('view', e.target.value)}><option value="list">جدول</option><option value="cards">کارت</option></Select></label>
    </FilterBar>
    {Object.keys(filters).filter(k => k !== 'page').length > 0 && <div className="flex flex-wrap gap-2 text-xs" aria-label="فیلترهای فعال">{Object.entries(filters).filter(([key]) => key !== 'page').map(([key,value]) => <Button key={key} variant="ghost" onClick={() => update(key,'')} aria-label={`حذف فیلتر ${filterNames[key] || key}`}>{filterNames[key]}: {labels[value] || filterValues[value] || value} ×</Button>)}<Button variant="secondary" onClick={() => setSearch(view === 'cards' ? { view } : {})}>پاک‌کردن فیلترها</Button></div>}
    {query.isPending ? <LoadingState /> : query.isError ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> : <div aria-busy={query.isFetching}>
      {query.isFetching && <p role="status" className="text-xs">در حال تازه‌سازی…</p>}
      {!rows.length ? <EmptyState title="موردی مطابق فیلترها یافت نشد." /> : view === 'list' ? <DataTable label={titles[module]}><thead><tr><th>عنوان</th><th>وضعیت</th><th>سررسید</th><th>اقدام</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td className="max-w-xs break-words"><Link className="text-indigo-700 font-bold underline-offset-4 hover:underline" to={detail(row.id)}>{row.name || row.title}</Link></td><td>{labels[row.status] || row.status}</td><td>{row.deadline ? formatPersianDate(row.deadline) : '—'}</td><td><Button variant="ghost" onClick={() => { const next = new URLSearchParams(search); next.set('preview',row.id); setSearch(next); }}>پیش‌نمایش</Button></td></tr>)}</tbody></DataTable> : <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{rows.map(row => <article key={row.id} className="p-4 bg-white border border-slate-200 rounded-xl min-w-0 space-y-3"><Link className="font-bold break-words text-indigo-700" to={detail(row.id)}>{row.name || row.title}</Link><p className="text-sm">{labels[row.status] || row.status} · {row.deadline ? formatPersianDate(row.deadline) : 'بدون سررسید'}</p><Button variant="ghost" onClick={() => { const next = new URLSearchParams(search); next.set('preview',row.id); setSearch(next); }}>پیش‌نمایش</Button></article>)}</div>}
      <Pagination meta={query.data?.meta} busy={query.isFetching} onPage={page => update('page',String(page))} />
    </div>}
    <EntityPreview module={module} id={search.get('preview')} fullLink={detail} onClose={() => { const next = new URLSearchParams(search); next.delete('preview'); setSearch(next, { replace: true }); }} />
  </section>;
}
