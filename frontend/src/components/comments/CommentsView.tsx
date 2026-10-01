import React, { useMemo, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  MessageCircleReply,
  MessageSquare,
  Pencil,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { commentsApi, CommentSubjectType, UnifiedComment } from '../../api/comments';
import { useApp } from '../../context/AppContext';
import { EmptyState, ErrorState, LoadingState } from '../common/Primitives';

const labels: Record<CommentSubjectType, string> = { task: 'تسک', content: 'محتوا', idea: 'ایده', asset: 'دارایی' };
const tones: Record<CommentSubjectType, string> = {
  task: 'border-sky-100 bg-sky-50 text-sky-700',
  content: 'border-violet-100 bg-violet-50 text-violet-700',
  idea: 'border-amber-100 bg-amber-50 text-amber-700',
  asset: 'border-emerald-100 bg-emerald-50 text-emerald-700',
};

type Composer = { mode: 'reply' | 'edit'; comment: UnifiedComment } | null;

export const CommentsView: React.FC = () => {
  const { currentUser, hasPermission, notify, notifyApiError } = useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [type, setType] = useState<CommentSubjectType | ''>('');
  const [composer, setComposer] = useState<Composer>(null);
  const [draft, setDraft] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
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
  const byId = useMemo(() => new Map(rows.map(comment => [comment.id, comment])), [rows]);

  const begin = (mode: 'reply' | 'edit', comment: UnifiedComment) => {
    setComposer({ mode, comment });
    setDraft(mode === 'edit' ? comment.text : '');
  };
  const closeComposer = () => { setComposer(null); setDraft(''); };
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['comments', currentUser.id] });

  const submitComposer = async () => {
    if (!composer || !draft.trim() || busyId) return;
    setBusyId(composer.comment.id);
    try {
      if (composer.mode === 'edit') {
        await commentsApi.update(composer.comment.id, draft.trim());
        notify({ type: 'success', title: 'دیدگاه ویرایش شد.' });
      } else {
        await commentsApi.create({
          subjectType: composer.comment.subjectType,
          subjectId: composer.comment.subjectId,
          text: draft.trim(),
          replyToId: composer.comment.id,
        });
        notify({ type: 'success', title: 'پاسخ ثبت شد.' });
      }
      closeComposer();
      await refresh();
    } catch (error) {
      notifyApiError('comments-submit', error, composer.mode === 'edit' ? 'ویرایش دیدگاه ناموفق بود' : 'ثبت پاسخ ناموفق بود');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (comment: UnifiedComment) => {
    if (busyId || !window.confirm('این دیدگاه حذف شود؟')) return;
    setBusyId(comment.id);
    try {
      await commentsApi.remove(comment.id);
      if (composer?.comment.id === comment.id) closeComposer();
      notify({ type: 'success', title: 'دیدگاه حذف شد.' });
      await refresh();
    } catch (error) {
      notifyApiError('comments-delete', error, 'حذف دیدگاه ناموفق بود');
    } finally {
      setBusyId(null);
    }
  };

  return <section className="max-w-7xl mx-auto p-3 sm:p-6 lg:p-8 space-y-5" dir="rtl">
    <header className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white"><MessageSquare className="h-5 w-5" /></span>
          <div><h1 className="text-xl sm:text-2xl font-black text-slate-900">مرکز دیدگاه‌ها</h1><p className="mt-1 text-xs sm:text-sm text-slate-500">پاسخ‌گویی و مدیریت دیدگاه‌های ایده‌ها، تسک‌ها، محتواها و دارایی‌ها</p></div>
        </div>
        <span className="self-start rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs font-black text-indigo-700">{total.toLocaleString('fa-IR')} دیدگاه</span>
      </div>
    </header>

    <div className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4 shadow-xs flex items-center justify-between gap-3">
      <span className="text-xs font-bold text-slate-500">فیلتر بر اساس منبع</span>
      <select aria-label="نوع منبع" value={type} onChange={event => { setType(event.target.value as CommentSubjectType | ''); setPage(1); }} className="ui-input min-w-40 text-xs font-bold"><option value="">همهٔ منابع</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
    </div>

    <div className="space-y-3">
      {query.isLoading ? <div className="rounded-3xl border border-slate-200 bg-white"><LoadingState label="در حال دریافت دیدگاه‌ها…" /></div>
        : query.isError ? <div className="rounded-3xl border border-slate-200 bg-white"><ErrorState error={query.error} onRetry={() => void query.refetch()} /></div>
        : rows.length === 0 ? <div className="rounded-3xl border border-dashed border-slate-300 bg-white"><EmptyState title="دیدگاهی پیدا نشد"><p className="mt-2 text-xs">فیلترها را تغییر دهید و دوباره بررسی کنید.</p></EmptyState></div>
        : rows.map(comment => {
          const owner = comment.userId === currentUser.id;
          const canEdit = owner || hasPermission('comments.edit_any');
          const canDelete = owner || hasPermission('comments.delete_any');
          const parent = comment.replyToId ? byId.get(comment.replyToId) : null;
          const open = composer?.comment.id === comment.id;
          return <article key={comment.id} className={`rounded-2xl border bg-white p-4 sm:p-5 shadow-2xs transition-colors ${comment.replyToId ? 'mr-4 sm:mr-8 border-r-4 border-r-indigo-200 border-slate-200' : 'border-slate-200 hover:border-slate-300'}`}>
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 shrink-0 overflow-hidden rounded-2xl bg-slate-100 flex items-center justify-center text-xs font-black text-slate-600">{comment.userAvatar ? <img src={comment.userAvatar} alt="" className="h-full w-full object-cover" /> : comment.userName.slice(0, 1)}</div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-xs font-extrabold text-slate-800">{comment.userName}</strong>
                  <span className={`rounded-lg border px-2 py-1 text-[10px] font-bold ${tones[comment.subjectType]}`}>{labels[comment.subjectType]}</span>
                  <time className="text-[10px] text-slate-400" dateTime={comment.createdAt}>{new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(comment.createdAt))}</time>
                </div>
                {comment.replyToId && <p className="mt-2 flex items-center gap-1 text-[10px] font-bold text-indigo-600"><MessageCircleReply className="h-3.5 w-3.5" />پاسخ به {parent?.userName || 'دیدگاه قبلی'}</p>}
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">{comment.text}</p>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                  <button type="button" onClick={() => comment.subjectUrl && navigate(comment.subjectUrl)} className="inline-flex max-w-full items-center gap-1.5 text-xs font-bold text-indigo-700 hover:text-indigo-900"><ExternalLink className="h-3.5 w-3.5" /><span className="truncate">{comment.subjectTitle || `${labels[comment.subjectType]} شماره ${comment.subjectId}`}</span></button>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => begin('reply', comment)} className="ui-button ui-button-ghost ui-icon-button text-indigo-600" title="پاسخ" aria-label="پاسخ به دیدگاه"><MessageCircleReply className="h-4 w-4" /></button>
                    {canEdit && <button type="button" onClick={() => begin('edit', comment)} className="ui-button ui-button-ghost ui-icon-button text-slate-600" title="ویرایش" aria-label="ویرایش دیدگاه"><Pencil className="h-4 w-4" /></button>}
                    {canDelete && <button type="button" disabled={busyId === comment.id} onClick={() => void remove(comment)} className="ui-button ui-button-ghost ui-icon-button text-rose-600 disabled:opacity-50" title="حذف" aria-label="حذف دیدگاه"><Trash2 className="h-4 w-4" /></button>}
                  </div>
                </div>
                {open && <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-2 flex items-center justify-between"><span className="text-[11px] font-black text-slate-700">{composer.mode === 'edit' ? 'ویرایش دیدگاه' : `پاسخ به ${comment.userName}`}</span><button type="button" onClick={closeComposer} className="ui-button ui-button-ghost ui-icon-button" aria-label="بستن"><X className="h-4 w-4" /></button></div>
                  <textarea autoFocus rows={3} value={draft} onChange={event => setDraft(event.target.value)} maxLength={3000} className="ui-input resize-y text-xs leading-6" placeholder="متن را بنویسید…" />
                  <div className="mt-2 flex justify-end"><button type="button" disabled={!draft.trim() || busyId === comment.id} onClick={() => void submitComposer()} className="ui-button ui-button-primary text-xs disabled:opacity-50"><Send className="h-4 w-4" />{busyId === comment.id ? 'در حال ذخیره…' : composer.mode === 'edit' ? 'ذخیره تغییرات' : 'ثبت پاسخ'}</button></div>
                </div>}
              </div>
            </div>
          </article>;
        })}
    </div>

    <footer className="flex flex-col-reverse sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
      <span>نمایش {rows.length.toLocaleString('fa-IR')} مورد از {total.toLocaleString('fa-IR')}</span>
      <div className="flex flex-wrap justify-center items-center gap-2"><label className="flex items-center gap-2 font-bold text-slate-600">تعداد در صفحه<select value={perPage} onChange={event => { setPerPage(Number(event.target.value)); setPage(1); }} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs">{[10, 20, 50, 100].map(value => <option key={value} value={value}>{value.toLocaleString('fa-IR')}</option>)}</select></label>{lastPage > 1 && <div className="flex items-center rounded-xl border border-slate-200 bg-white p-1"><button type="button" aria-label="صفحه قبل" disabled={page <= 1 || query.isFetching} onClick={() => setPage(value => value - 1)} className="p-1.5 rounded-lg disabled:opacity-30 hover:bg-slate-100"><ChevronRight className="w-4 h-4" /></button><span className="px-3 font-bold text-slate-700">{page.toLocaleString('fa-IR')} از {lastPage.toLocaleString('fa-IR')}</span><button type="button" aria-label="صفحه بعد" disabled={page >= lastPage || query.isFetching} onClick={() => setPage(value => value + 1)} className="p-1.5 rounded-lg disabled:opacity-30 hover:bg-slate-100"><ChevronLeft className="w-4 h-4" /></button></div>}</div>
    </footer>
  </section>;
};
