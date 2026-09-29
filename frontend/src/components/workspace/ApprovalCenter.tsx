import { runtime } from '../../config/runtime';
import { usePageCorrection } from '../../routing/usePageCorrection';
import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useWorkspacePage } from '../../queries/workspacePages';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { request } from '../../api/client';
import { parseApiError } from '../../api/errors';
import { Button, EmptyState, ErrorState, FormField, LoadingState, Modal, PageHeader, Textarea } from '../common/Primitives';
import { Pagination } from '../common/WorkspacePatterns';
import { formatPersianDate } from '../../utils/date';
import { canUsePermission } from '../../utils/permissions';
export function ApprovalCenter() {
  const {currentUser} = useAuth(); const {notify} = useApp(); const client = useQueryClient();
  const allowed = canUsePermission(currentUser, [], 'content.view') && canUsePermission(currentUser, [], 'content.approve');
  const [params,setParams] = useSearchParams(); const n = Number(params.get('page'));
  const filter: Record<string,string|number> = {page: Number.isSafeInteger(n) && n > 0 && n <= 100000 ? n : 1, per_page:20};
  if (/^[1-9]\d{0,18}$/.test(params.get('item') || '')) filter.item = params.get('item')!;
  if (/^[1-9]\d{0,18}$/.test(params.get('content') || '')) filter.content_id = params.get('content')!;
  if (params.get('stage') && params.get('stage')!.length <= 120) filter.stage_id = params.get('stage')!;
  const query = useWorkspacePage('approvals',filter,allowed);
  usePageCorrection(query);
  const [selection, setSelection] = useState<{row:any; decision:'approve'|'reject'} | null>(null);
  const [note,setNote] = useState('');
  const mutation = useMutation({ mutationFn: () => request(`/contents/${selection!.row.contentId}/stages/${encodeURIComponent(selection!.row.stageId)}/decision`, {method:'POST',body:{decision:selection!.decision,note,expectedVersion:selection!.row.expectedVersion}}),
    onSuccess: async () => { await Promise.all([
      client.invalidateQueries({queryKey:['pages',currentUser.id,'approvals']}),
      ...['contents','tasks'].flatMap(module => ['pages','entity','workspace','preview'].map(scope =>
        client.invalidateQueries({queryKey:[scope,currentUser.id,module]}))),
    ]); setSelection(null); setNote(''); notify({type:'success',title:'تصمیم بررسی در سرور ثبت شد.',dedupeKey:'review-decision'}); },
  });
  const open = (row:any,decision:'approve'|'reject') => { mutation.reset(); setNote(''); setSelection({row,decision}); };
  const parsed = mutation.isError ? parseApiError(mutation.error) : null;
  if (!allowed) return <ErrorState title="شما مجوز بررسی محتوا را ندارید." />;
  if (runtime.demoMode) return <EmptyState title="این بخش عملیاتی در محیط نمایشی فعال نیست؛ به API واقعی نیاز دارد." />;
  return <section className="max-w-5xl mx-auto p-2 sm:p-5" dir="rtl"><PageHeader title="مرکز بررسی و تأیید" description="ارجاع‌های بررسی مراحل محتوا که در سرور به شما واگذار شده‌اند." actions={<Button variant="secondary" loading={query.isFetching} onClick={() => void query.refetch()}>تازه‌سازی</Button>} />
    {(filter.item || filter.content_id || filter.stage_id) && <Button variant="ghost" onClick={() => setParams({})}>همهٔ بررسی‌های من</Button>}
    {query.isPending ? <LoadingState /> : query.isError ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> : <>
      {!query.data?.data.length ? <EmptyState title="بررسی‌ای در انتظار شما نیست." /> : <ul className="space-y-3">{query.data.data.map(row => <li key={row.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 break-words"><h2 className="font-bold">{row.title}</h2><p className="text-sm">مرحلهٔ {row.stageTitle} · منتظر بررسی</p><p className="text-xs text-slate-500">تاریخ ارجاع: {formatPersianDate(row.createdAt)}</p><div className="flex flex-wrap gap-2"><Link className="ui-button ui-button-secondary" to={`/contents/${row.contentId}`}>مشاهدهٔ محتوا</Link><Button onClick={() => open(row,'approve')}>تأیید</Button><Button variant="danger" onClick={() => open(row,'reject')}>عودت برای اصلاح</Button></div></li>)}</ul>}
      <Pagination meta={query.data?.meta} busy={query.isFetching} onPage={page => {const next = new URLSearchParams(params);next.set('page',String(page));setParams(next);}} />
    </>}
    <Modal open={!!selection} busy={mutation.isPending} title={selection?.decision === 'reject' ? 'عودت مرحله برای اصلاح' : 'تأیید مرحله'} onClose={() => setSelection(null)}><form className="p-4 space-y-4" onSubmit={e => {e.preventDefault();if (!mutation.isPending) mutation.mutate();}}>
      <p>{selection?.row.title} — {selection?.row.stageTitle}</p>
      <FormField htmlFor="review-note" label={selection?.decision === 'reject' ? 'علت عودت (الزامی)' : 'توضیح (اختیاری)'} error={parsed?.fields.note?.join(' • ')}><Textarea id="review-note" value={note} onChange={e => setNote(e.target.value)} required={selection?.decision === 'reject'} maxLength={3000} rows={4} aria-invalid={!!parsed?.fields.note} /></FormField>
      {parsed && <ErrorState title={parsed.message} />}
      <div className="flex gap-2"><Button type="submit" loading={mutation.isPending}>ثبت تصمیم</Button><Button variant="secondary" disabled={mutation.isPending} onClick={() => setSelection(null)}>انصراف</Button></div>
    </form></Modal>
  </section>;
}
