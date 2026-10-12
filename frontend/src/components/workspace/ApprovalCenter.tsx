import { runtime } from '../../config/runtime';
import { usePageCorrection } from '../../routing/usePageCorrection';
import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CheckCircle2, Clock3, ExternalLink, Eye, FileText, RotateCcw, ShieldCheck } from 'lucide-react';
import { useWorkspacePage } from '../../queries/workspacePages';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { request } from '../../api/client';
import { parseApiError } from '../../api/errors';
import { Button, EmptyState, ErrorState, FormField, LoadingState, Modal, Textarea } from '../common/Primitives';
import { Pagination } from '../common/WorkspacePatterns';
import { formatPersianDate } from '../../utils/date';
import { canUsePermission } from '../../utils/permissions';
import { resourceUrl } from '../../utils/resourceUrl';

export function ApprovalCenter() {
  const { currentUser } = useAuth();
  const { notify } = useApp();
  const navigate = useNavigate();
  const client = useQueryClient();
  const allowed = canUsePermission(currentUser, [], 'content.view') && canUsePermission(currentUser, [], 'content.approve');
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('page'));
  const filter: Record<string, string | number> = { page: Number.isSafeInteger(page) && page > 0 && page <= 100000 ? page : 1, per_page: 20 };
  if (/^[1-9]\d{0,18}$/.test(params.get('item') || '')) filter.item = params.get('item')!;
  if (/^[1-9]\d{0,18}$/.test(params.get('content') || '')) filter.content_id = params.get('content')!;
  if (params.get('stage') && params.get('stage')!.length <= 120) filter.stage_id = params.get('stage')!;
  const query = useWorkspacePage('approvals', filter, allowed);
  usePageCorrection(query);
  const [selection, setSelection] = useState<{ row: any; decision: 'approve' | 'reject' } | null>(null);
  const [outputRow, setOutputRow] = useState<any | null>(null);
  const [note, setNote] = useState('');
  const mutation = useMutation({
    mutationFn: () => request(`/contents/${selection!.row.contentId}/stages/${encodeURIComponent(selection!.row.stageId)}/decision`, { method: 'POST', body: { decision: selection!.decision, note, expectedVersion: selection!.row.expectedVersion } }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['pages', currentUser.id, 'approvals'] }),
        ...['contents', 'tasks'].flatMap(module => ['pages', 'entity', 'workspace', 'preview'].map(scope => client.invalidateQueries({ queryKey: [scope, currentUser.id, module] }))),
      ]);
      setSelection(null); setNote('');
      notify({ type: 'success', title: 'تصمیم بررسی در سرور ثبت شد.', dedupeKey: 'review-decision' });
    },
  });
  const open = (row: any, decision: 'approve' | 'reject') => { mutation.reset(); setNote(''); setSelection({ row, decision }); };
  const parsed = mutation.isError ? parseApiError(mutation.error) : null;

  if (!allowed) return <ErrorState title="شما مجوز بررسی محتوا را ندارید." />;
  if (runtime.demoMode) return <EmptyState title="این بخش عملیاتی در محیط نمایشی فعال نیست؛ به API واقعی نیاز دارد." />;

  return <section className="max-w-7xl mx-auto p-3 sm:p-6 lg:p-8 space-y-5" dir="rtl">
    <header className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div className="flex items-center gap-3.5">
        <div className="w-11 h-11 rounded-2xl bg-amber-500 text-white flex items-center justify-center"><ShieldCheck className="w-5 h-5" /></div>
        <div><div className="flex items-center gap-2"><button type="button" onClick={() => window.history.state?.idx > 0 ? navigate(-1) : navigate('/contents')} aria-label="بازگشت به صفحه قبل" title="بازگشت به صفحه قبل" className="ui-button ui-button-ghost ui-icon-button ui-icon-button-back !h-8 !w-8"><ArrowRight className="h-4 w-4" /></button><h1 className="text-xl sm:text-2xl font-black text-slate-900">مرکز بررسی و تأیید</h1></div><p className="mt-1 text-xs sm:text-sm text-slate-500">تصمیم‌گیری دربارهٔ مراحل محتوایی ارجاع‌شده به شما</p></div>
      </div>

    </header>

    {(filter.item || filter.content_id || filter.stage_id) && <div><Button variant="ghost" onClick={() => setParams({})}><RotateCcw className="w-4 h-4" />نمایش همهٔ بررسی‌های من</Button></div>}

    {query.isPending ? <LoadingState label="در حال دریافت موارد نیازمند بررسی…" /> : query.isError ? <ErrorState error={query.error} onRetry={() => void query.refetch()} /> : !query.data?.data.length ? (
      <div className="rounded-3xl border border-emerald-200 bg-emerald-50/60 p-10 text-center"><CheckCircle2 className="w-11 h-11 mx-auto text-emerald-500" /><h2 className="mt-3 font-black text-emerald-900">موردی در انتظار بررسی نیست</h2><p className="mt-1 text-xs text-emerald-700">همهٔ ارجاع‌های شما تعیین تکلیف شده‌اند.</p></div>
    ) : <>
      <div className="grid md:grid-cols-2 gap-4">{query.data.data.map(row => {
        const deadline = row.deadline ? new Date(row.deadline) : null;
        const urgent = deadline ? deadline.getTime() - Date.now() <= 86400000 : false;
        return <article key={row.id} className={`relative overflow-hidden rounded-2xl border bg-white p-4 shadow-xs ${urgent ? 'border-rose-300' : 'border-amber-200'}`}>
          <span className={`absolute inset-y-0 right-0 w-1 ${urgent ? 'bg-rose-500' : 'bg-amber-400'}`} />
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><span className={`inline-flex rounded-lg px-2 py-1 text-[10px] font-black ${urgent ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}`}>{urgent ? 'فوری' : 'منتظر بررسی'}</span><h2 className="mt-2 text-sm font-black text-slate-900 leading-6">{row.title}</h2><p className="mt-1 text-[11px] text-slate-600">مرحلهٔ «{row.stageTitle}»</p></div><ShieldCheck className={`w-5 h-5 shrink-0 ${urgent ? 'text-rose-500' : 'text-amber-500'}`} /></div>
          <div className="mt-3 flex items-center gap-2 text-[10px] text-slate-500"><Clock3 className="w-3.5 h-3.5" /><span>{deadline ? `مهلت: ${formatPersianDate(row.deadline)}` : `ارجاع: ${formatPersianDate(row.createdAt)}`}</span></div>
          <div className="mt-4 flex flex-wrap gap-2"><Button variant="secondary" className="!min-h-8 !px-2.5 !py-1 text-[11px]" onClick={() => setOutputRow(row)}><Eye className="w-3.5 h-3.5" />نمایش خروجی</Button><Link className="ui-button ui-button-secondary !min-h-8 !px-2.5 !py-1 text-[11px]" to={`/contents/${row.contentId}`}><ExternalLink className="w-3.5 h-3.5" />محتوا</Link><Button className="!min-h-8 !px-2.5 !py-1 text-[11px]" onClick={() => open(row, 'approve')}><CheckCircle2 className="w-3.5 h-3.5" />تأیید</Button><Button className="!min-h-8 !px-2.5 !py-1 text-[11px]" variant="danger" onClick={() => open(row, 'reject')}><RotateCcw className="w-3.5 h-3.5" />نیازمند اصلاح</Button></div>
        </article>;
      })}</div>
      <Pagination meta={query.data?.meta} busy={query.isFetching} onPage={nextPage => { const next = new URLSearchParams(params); next.set('page', String(nextPage)); setParams(next); }} />
    </>}

    <Modal open={!!outputRow} title="خروجی مرحله" description={outputRow ? `${outputRow.title} — ${outputRow.stageTitle}` : undefined} onClose={() => setOutputRow(null)}>
      <div className="space-y-4 p-5 sm:p-6">
        {outputRow?.stageDescription && <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-6 text-slate-600">{outputRow.stageDescription}</div>}
        {outputRow?.workReport && <div><h3 className="mb-1.5 text-[11px] font-black text-slate-700">گزارش انجام مرحله</h3><p className="rounded-xl border border-slate-200 bg-white p-3 text-xs leading-6 text-slate-600 whitespace-pre-wrap">{outputRow.workReport}</p></div>}
        <div>
          <h3 className="mb-2 text-[11px] font-black text-slate-700">فایل‌ها و اقلام تحویلی</h3>
          {Array.isArray(outputRow?.outputs) && outputRow.outputs.length ? <div className="space-y-2">{outputRow.outputs.map((output: any, index: number) => {
            const link = resourceUrl(output.url);
            return <article key={output.id || index} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600"><FileText className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="text-xs font-black text-slate-800 break-words">{output.name || output.title || output.fileName || `خروجی ${(index + 1).toLocaleString('fa-IR')}`}</p>{output.value && <p className="mt-1 text-[11px] leading-5 text-slate-500 whitespace-pre-wrap">{output.value}</p>}{link && <a href={link} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-indigo-700"><ExternalLink className="h-3.5 w-3.5" />بازکردن خروجی</a>}</div></article>;
          })}</div> : <p className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-xs text-slate-500">خروجی ثبت‌شده‌ای برای این مرحله وجود ندارد.</p>}
        </div>
        <div className="flex justify-end border-t border-slate-100 pt-3"><Button variant="secondary" onClick={() => setOutputRow(null)}>بستن</Button></div>
      </div>
    </Modal>

    <Modal open={!!selection} busy={mutation.isPending} title={selection?.decision === 'reject' ? 'عودت مرحله برای اصلاح' : 'تأیید مرحله'} description={selection ? `${selection.row.title} — ${selection.row.stageTitle}` : undefined} onClose={() => setSelection(null)}>
      <form onSubmit={event => { event.preventDefault(); if (!mutation.isPending) mutation.mutate(); }}>
        <div className="p-5 sm:p-6 space-y-4 overflow-y-auto"><FormField htmlFor="review-note" label={selection?.decision === 'reject' ? 'علت عودت (الزامی)' : 'توضیح (اختیاری)'} error={parsed?.fields.note?.join(' • ')}><Textarea id="review-note" value={note} onChange={event => setNote(event.target.value)} required={selection?.decision === 'reject'} maxLength={3000} rows={5} aria-invalid={!!parsed?.fields.note} /></FormField>{parsed && <ErrorState title={parsed.message} />}</div>
        <footer className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-slate-100 bg-white px-5 sm:px-6 py-4"><Button action="cancel" variant="secondary" disabled={mutation.isPending} onClick={() => setSelection(null)}>انصراف</Button><Button type="submit" variant={selection?.decision === 'reject' ? 'danger' : 'primary'} loading={mutation.isPending}>ثبت تصمیم</Button></footer>
      </form>
    </Modal>
  </section>;
}
