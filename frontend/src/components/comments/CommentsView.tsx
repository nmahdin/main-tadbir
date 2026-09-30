import React, { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, ExternalLink, MessageSquare } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { commentsApi, CommentSubjectType } from '../../api/comments';
import { useAuth } from '../../context/AuthContext';
import { EmptyState, LoadingState } from '../common/Primitives';

const labels: Record<CommentSubjectType, string> = { task: 'تسک', content: 'محتوا', idea: 'ایده', asset: 'دارایی' };
const tones: Record<CommentSubjectType, string> = { task: 'bg-indigo-50 text-indigo-700', content: 'bg-emerald-50 text-emerald-700', idea: 'bg-amber-50 text-amber-700', asset: 'bg-sky-50 text-sky-700' };

export const CommentsView: React.FC = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [type, setType] = useState<CommentSubjectType | ''>('');
  const params = useMemo(() => ({ page, per_page: perPage, subject_type: type }), [page, perPage, type]);
  const query = useQuery({
    queryKey: ['comments', currentUser.id, params],
    queryFn: () => commentsApi.list(params),
    placeholderData: keepPreviousData,
  });
  const rows = query.data?.data ?? [];
  const meta = query.data?.meta;
  const lastPage = meta?.last_page ?? 1;
  const total = meta?.total ?? rows.length;

  return <section className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-5" dir="rtl">
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div><div className="inline-flex items-center gap-2 rounded-xl bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700"><MessageSquare className="w-4 h-4" />مرکز دیدگاه‌ها</div><h1 className="mt-3 text-2xl font-black text-slate-900">همهٔ دیدگاه‌ها</h1><p className="mt-1 text-sm text-slate-500">دیدگاه‌های ایده‌ها، تسک‌ها، محتواها و دارایی‌ها در یک نمای مشترک</p></div>
      <select value={type} onChange={event => { setType(event.target.value as CommentSubjectType | ''); setPage(1); }} className="min-w-36 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-700"><option value="">همهٔ منابع</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
    </header>

    <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
      {query.isLoading ? <LoadingState label="در حال دریافت دیدگاه‌ها…" /> : query.isError ? <div className="p-8 text-center"><p className="text-sm font-bold text-rose-700">دریافت دیدگاه‌ها انجام نشد.</p><button type="button" onClick={() => void query.refetch()} className="mt-3 text-xs font-bold text-indigo-700">تلاش دوباره</button></div> : rows.length === 0 ? <EmptyState title="دیدگاهی پیدا نشد"><p className="mt-2 text-xs">با تغییر فیلتر دوباره بررسی کنید.</p></EmptyState> : <div className="divide-y divide-slate-100">{rows.map(comment => <article key={comment.id} className="p-4 sm:p-5 hover:bg-slate-50/70 transition-colors">
        <div className="flex items-start gap-3"><div className="h-9 w-9 shrink-0 rounded-xl bg-slate-100 overflow-hidden flex items-center justify-center text-xs font-black text-slate-600">{comment.userAvatar ? <img src={comment.userAvatar} alt="" className="h-full w-full object-cover" /> : comment.userName.slice(0, 1)}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-extrabold text-slate-800">{comment.userName}</span><span className={`rounded-lg px-2 py-1 text-[10px] font-bold ${tones[comment.subjectType]}`}>{labels[comment.subjectType]}</span><time className="text-[10px] text-slate-400" dateTime={comment.createdAt}>{new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(comment.createdAt))}</time></div><p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-700">{comment.text}</p><button type="button" onClick={() => comment.subjectUrl && navigate(comment.subjectUrl)} className="mt-3 inline-flex max-w-full items-center gap-1.5 text-xs font-bold text-indigo-700 hover:text-indigo-900"><ExternalLink className="w-3.5 h-3.5" /><span className="truncate">{comment.subjectTitle || `${labels[comment.subjectType]} شماره ${comment.subjectId}`}</span></button></div></div>
      </article>)}</div>}
    </div>

    <footer className="flex flex-col-reverse sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
      <div>{total.toLocaleString('fa-IR')} دیدگاه</div>
      <div className="flex items-center gap-2"><label className="flex items-center gap-2 font-bold text-slate-600">تعداد در صفحه<select value={perPage} onChange={event => { setPerPage(Number(event.target.value)); setPage(1); }} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs">{[10, 20, 50, 100].map(value => <option key={value} value={value}>{value.toLocaleString('fa-IR')}</option>)}</select></label>{lastPage > 1 && <div className="flex items-center rounded-xl border border-slate-200 bg-white p-1"><button type="button" aria-label="صفحه قبل" disabled={page <= 1 || query.isFetching} onClick={() => setPage(value => value - 1)} className="p-1.5 rounded-lg disabled:opacity-30 hover:bg-slate-100"><ChevronRight className="w-4 h-4" /></button><span className="px-3 font-bold text-slate-700">{page.toLocaleString('fa-IR')} از {lastPage.toLocaleString('fa-IR')}</span><button type="button" aria-label="صفحه بعد" disabled={page >= lastPage || query.isFetching} onClick={() => setPage(value => value + 1)} className="p-1.5 rounded-lg disabled:opacity-30 hover:bg-slate-100"><ChevronLeft className="w-4 h-4" /></button></div>}</div>
    </footer>
  </section>;
};
