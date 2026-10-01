import React, { useEffect, useState } from 'react';
import { CheckCircle2, Eye, UserRound } from 'lucide-react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useWorkspacePage } from '../../queries/workspacePages';
import { useApp } from '../../context/AppContext';
import { Button, EmptyState, ErrorState, Input, LoadingState, Select } from '../common/Primitives';
import { DataTable, FilterBar, Pagination } from '../common/WorkspacePatterns';
import { listStatuses } from '../../routing/listQuery';
import { formatPersianDate } from '../../utils/date';
import { PriorityPill, TaskStatusBadge } from '../common/PriorityPill';
import type { Priority, TaskStatus } from '../../types';

/** Related collections never derive totals or rows from the bootstrap cache. */
export function RelatedRecords({module, scope, variant = 'table'}: {module:'tasks'|'contents'|'projects'; scope:Record<string,string>; variant?: 'table'|'task-list'}) {
  const {hasPermission,contentStatuses,unarchiveItem,pendingMutationKeys,currentUser,users,setSelectedTaskId,moveTaskStatus} = useApp(); const location = useLocation(); const [params,setParams] = useSearchParams();
  const prefix = `${module}_`; const rawPage = Number(params.get(prefix+'page'));
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 && rawPage <= 100000 ? rawPage : 1;
  const labels = {...listStatuses[module], ...(module === 'contents' ? Object.fromEntries(contentStatuses.map(s=>[s.id,s.label])) : {})};
  const status = params.get(prefix+'status') || '';
  const search = (params.get(prefix+'search') || '').slice(0,120);
  const [draft,setDraft] = useState(search); useEffect(()=>setDraft(search),[search]);
  const allowed = hasPermission(module === 'contents' ? 'content.view' : `${module}.view`);
  const query = useWorkspacePage(module,{...scope,page,per_page:20, ...((status in labels || (module === 'tasks' && status === 'open')) ? {status} : {}), ...(search ? {search} : {}),...scope}, allowed);
  const update = (key:string,value:string) => { const next=new URLSearchParams(params); if(value)next.set(prefix+key,value);else next.delete(prefix+key);if(key!=='page')next.delete(prefix+'page');setParams(next); };
  useEffect(()=>{
    const last=query.data?.meta?.last_page;
    if (!query.isFetching && !query.isPlaceholderData && !query.isError && last && page>last) {
      const next = new URLSearchParams(params); next.set(prefix+'page',String(last)); setParams(next,{replace:true});
    }
  },[query.data?.meta?.last_page,query.isFetching,query.isPlaceholderData,query.isError,page,params,setParams,prefix]);
  if(!allowed)return <EmptyState title="مجوز مشاهدهٔ این روابط را ندارید." />;
  const title=module==='tasks'?'وظایف مرتبط':module==='contents'?'محتواهای مرتبط':'پروژه‌های مرتبط';
  if (module === 'tasks' && variant === 'task-list') return <section className="min-w-0 space-y-4" aria-label={title}>
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h3 className="text-sm font-black text-slate-900">تسک‌های مرتبط با محتوا</h3><p className="mt-1 text-[11px] text-slate-500">نمای یکپارچهٔ مسئول، وضعیت، اولویت و موعد وظایف این محتوا</p></div><div className="inline-flex w-fit rounded-xl border border-slate-200 bg-slate-50 p-1">{[{id:'',label:'همه'},{id:'open',label:'جاری'},{id:'completed',label:'تکمیل‌شده'}].map(item=><button key={item.id||'all'} type="button" onClick={()=>update('status',item.id)} className={`rounded-lg px-3 py-1.5 text-[10px] font-bold ${status===item.id?'bg-white text-indigo-700 shadow-2xs':'text-slate-500 hover:text-slate-800'}`}>{item.label}</button>)}</div></div>
    {query.isPending?<LoadingState label="در حال دریافت تسک‌های مرتبط…"/>:query.isError?<ErrorState error={query.error} onRetry={()=>void query.refetch()}/>:!query.data?.data.length?<div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50"><EmptyState title="تسک مرتبطی در این وضعیت وجود ندارد."/></div>:<>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-right text-xs"><thead><tr className="border-b border-slate-200 bg-slate-50/80 text-[10px] font-black text-slate-500"><th className="p-4">عنوان وظیفه</th><th className="p-4">مسئول</th><th className="p-4">وضعیت</th><th className="p-4">اولویت</th><th className="p-4">سررسید</th><th className="p-4 text-left">عملیات</th></tr></thead><tbody className="divide-y divide-slate-100">{query.data.data.map(row=>{const assignee=users.find(user=>user.id===row.assigneeId);const completed=row.status==='completed';const toggleDisabled=pendingMutationKeys.includes(`tasks:${row.id}`)||(row.kind==='content_review'&&(completed||!hasPermission('content.approve')));return <tr key={row.id} onClick={()=>setSelectedTaskId(row.id)} className="cursor-pointer transition-colors hover:bg-indigo-50/35"><td className="p-4"><div className="flex items-center gap-3"><button type="button" onClick={event=>{event.stopPropagation();if(!toggleDisabled)void moveTaskStatus(row.id,completed?'todo':'completed');}} disabled={toggleDisabled} aria-label={completed?'بازگشایی وظیفه':'تکمیل وظیفه'} title={row.kind==='content_review'?'تکمیل این وظیفه، مرحله محتوا را نیز تأیید می‌کند':completed?'بازگشایی وظیفه':'تکمیل وظیفه'} className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${completed?'border-emerald-500 bg-emerald-500 text-white':'border-slate-300 bg-white hover:border-emerald-500'}`}>{completed&&<CheckCircle2 className="h-3.5 w-3.5"/>}</button><div className="min-w-0"><strong className={`block max-w-xs break-words text-sm ${completed?'font-medium text-slate-500 line-through':'text-slate-900'}`}>{row.title}</strong><span className="mt-1 block text-[10px] text-slate-400">{row.kind==='content_review'?'ارزیابی محتوا':row.kind==='content_publish'?'انتشار محتوا':'وظیفه اجرایی'}</span></div></div></td><td className="p-4"><span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-1 text-[10px] font-bold text-sky-700"><UserRound className="h-3.5 w-3.5"/>{assignee?.name||'تعیین نشده'}</span></td><td className="p-4"><TaskStatusBadge status={row.status as TaskStatus} size="sm"/></td><td className="p-4"><PriorityPill priority={row.priority as Priority} size="sm"/></td><td className="whitespace-nowrap p-4 text-slate-500">{formatPersianDate(row.deadline)||'بدون سررسید'}</td><td className="p-4 text-left"><button type="button" onClick={event=>{event.stopPropagation();setSelectedTaskId(row.id);}} className="ui-button ui-button-ghost ui-icon-button text-indigo-600" aria-label={`جزئیات ${row.title}`} title="نمایش جزئیات"><Eye className="h-4 w-4"/></button></td></tr>;})}</tbody></table></div></div>
      <Pagination meta={query.data?.meta} busy={query.isFetching} onPage={n=>update('page',String(n))}/>
    </>}
  </section>;
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
