import React, { useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useWorkspacePage } from '../../queries/workspacePages';
import { useApp } from '../../context/AppContext';
import { Button, EmptyState, ErrorState, Input, LoadingState, Select } from '../common/Primitives';
import { DataTable, FilterBar, Pagination } from '../common/WorkspacePatterns';
import { listStatuses } from '../../routing/listQuery';
import { formatPersianDate } from '../../utils/date';

/** Related collections never derive totals or rows from the bootstrap cache. */
export function RelatedRecords({module, scope}: {module:'tasks'|'contents'|'projects'; scope:Record<string,string>}) {
  const {hasPermission,contentStatuses,unarchiveItem,pendingMutationKeys,currentUser} = useApp(); const location = useLocation(); const [params,setParams] = useSearchParams();
  const prefix = `${module}_`; const rawPage = Number(params.get(prefix+'page'));
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 && rawPage <= 100000 ? rawPage : 1;
  const labels = {...listStatuses[module], ...(module === 'contents' ? Object.fromEntries(contentStatuses.map(s=>[s.id,s.label])) : {})};
  const status = params.get(prefix+'status') || '';
  const search = (params.get(prefix+'search') || '').slice(0,120);
  const [draft,setDraft] = useState(search); useEffect(()=>setDraft(search),[search]);
  const allowed = hasPermission(module === 'contents' ? 'content.view' : `${module}.view`);
  const query = useWorkspacePage(module,{...scope,page,per_page:20, ...(status in labels ? {status} : {}), ...(search ? {search} : {}),...scope}, allowed);
  const update = (key:string,value:string) => { const next=new URLSearchParams(params); if(value)next.set(prefix+key,value);else next.delete(prefix+key);if(key!=='page')next.delete(prefix+'page');setParams(next); };
  useEffect(()=>{
    const last=query.data?.meta?.last_page;
    if (!query.isFetching && !query.isPlaceholderData && !query.isError && last && page>last) {
      const next = new URLSearchParams(params); next.set(prefix+'page',String(last)); setParams(next,{replace:true});
    }
  },[query.data?.meta?.last_page,query.isFetching,query.isPlaceholderData,query.isError,page,params,setParams,prefix]);
  if(!allowed)return <EmptyState title="مجوز مشاهدهٔ این روابط را ندارید." />;
  const title=module==='tasks'?'وظایف مرتبط':module==='contents'?'محتواهای مرتبط':'پروژه‌های مرتبط';
  return <section className="space-y-3 min-w-0" aria-label={title}>
    <FilterBar><form className="flex gap-2 flex-wrap" onSubmit={e=>{e.preventDefault();update('search',draft.trim());}}><Input aria-label={`جستجوی ${title}`} value={draft} maxLength={120} onChange={e=>setDraft(e.target.value)} /><Button type="submit" variant="secondary">جستجو</Button></form>
      {!scope.status && <Select aria-label={`وضعیت ${title}`} value={status in labels?status:''} onChange={e=>update('status',e.target.value)}><option value="">همه وضعیت‌ها</option>{Object.entries(labels).map(([id,label])=><option key={id} value={id}>{label}</option>)}</Select>}
      {(search||status)&&<Button variant="ghost" onClick={()=>{const next=new URLSearchParams(params);['page','search','status'].forEach(k=>next.delete(prefix+k));setParams(next);}}>پاک‌کردن فیلتر روابط</Button>}
    </FilterBar>
    {query.isPending?<LoadingState/>:query.isError?<ErrorState error={query.error} onRetry={()=>void query.refetch()}/>:<>
      {!query.data?.data.length?<EmptyState title="رکورد مرتبطی مطابق فیلتر یافت نشد."/>:<DataTable label={title}><thead><tr><th>عنوان</th><th>وضعیت</th><th>سررسید</th>{scope.status==='archived'&&<th>بازیابی</th>}</tr></thead><tbody>{query.data.data.map(row=><tr key={row.id}><td className="max-w-xs break-words"><Link className="font-bold text-indigo-700" to={`/${module}/${row.id}?${new URLSearchParams({returnTo:location.pathname+location.search,...(module==='tasks'?{display:'page'}:{})})}`}>{row.title||row.name}</Link></td><td>{labels[row.status]||row.status}</td><td>{formatPersianDate(row.deadline)||'—'}</td>{scope.status==='archived'&&<td><Button variant="secondary" loading={pendingMutationKeys.includes(`${module}:${row.id}`)} disabled={row.kind==='content_review'||!(module==='tasks'?(hasPermission('tasks.status')||row.assigneeId===currentUser.id):(module==='contents'?(row.access?.edit??hasPermission('content.edit')):hasPermission('projects.edit')))} onClick={()=>void unarchiveItem(module==='tasks'?'task':module==='projects'?'project':'content',row.id)}>بازیابی وضعیت قبلی</Button></td>}</tr>)}</tbody></DataTable>}
      <Pagination meta={query.data?.meta} busy={query.isFetching} onPage={n=>update('page',String(n))}/>
    </>}
  </section>;
}
