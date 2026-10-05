import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  Activity, AlertTriangle, Archive, ArrowRight, Building2, CalendarClock, CheckCircle2,
  Clock3, Eye, FileStack, Funnel, Hash, Layers3, Link2, ListChecks, Pause, Pencil, Play,
  Plus, RefreshCw, RotateCcw, Search, Settings2, ShieldCheck, UserRound, X,
} from 'lucide-react';
import { seriesApi } from '../../api/series';
import { parseApiError } from '../../api/errors';
import { useApp } from '../../context/AppContext';
import type { ContentSeries, SeriesRecurrenceType } from '../../types';
import { formatPersianDate } from '../../utils/date';
import {
  Button, ConfirmDialog, EmptyState, ErrorState, FormField, IconButton, Input,
  LoadingState, Modal, Select, Textarea,
} from '../common/Primitives';
import { FilterBar, Pagination } from '../common/WorkspacePatterns';
import { PersianDatePicker } from '../common/PersianDatePicker';
import { SeriesForm } from './series/SeriesForm';

const recurrenceLabels: Record<SeriesRecurrenceType, string> = {
  weekly: 'هفتگی', monthly: 'ماهانه شمسی', project_based: 'بر پایه پروژه', manual: 'دستی',
};
const statusLabels = { active: 'فعال', paused: 'متوقف', archived: 'بایگانی' } as const;
const tabs = [
  { id: 'occurrences', label: 'رخدادها', icon: ListChecks },
  { id: 'schedule', label: 'تقویم آینده', icon: CalendarClock },
  { id: 'defaults', label: 'پیش‌فرض‌ها', icon: Settings2 },
  { id: 'revisions', label: 'نسخه‌ها', icon: FileStack },
  { id: 'activity', label: 'تاریخچه', icon: Activity },
  { id: 'integrity', label: 'یکپارچگی', icon: ShieldCheck },
] as const;
type DetailTab = typeof tabs[number]['id'];

export const ContentSeriesView: React.FC = () => {
  const {
    projects, departments, users, contentTypes, processTemplates, assets, hasPermission, notify,
    setSelectedContentId, setActiveView,
  } = useApp();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('series');
  const projectFilter = params.get('project') || '';
  const [search, setSearch] = useState('');
  const [listPage, setListPage] = useState(1);
  const [status, setStatus] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [recurrenceFilter, setRecurrenceFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [tab, setTab] = useState<DetailTab>('occurrences');
  const [occurrencePage, setOccurrencePage] = useState(1);
  const [revisionPage, setRevisionPage] = useState(1);
  const [activityPage, setActivityPage] = useState(1);
  const [occurrenceSearch, setOccurrenceSearch] = useState('');
  const [occurrenceStatus, setOccurrenceStatus] = useState('');
  const [activationFilter, setActivationFilter] = useState('');
  const [editing, setEditing] = useState<ContentSeries | null>(null);
  const [formOpen, setFormOpen] = useState(params.get('create') === '1');
  const [nextConfirmationOpen, setNextConfirmationOpen] = useState(false);
  const [archiveConfirmationOpen, setArchiveConfirmationOpen] = useState(false);
  const [batchConfirmationOpen, setBatchConfirmationOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualStart, setManualStart] = useState('');
  const [manualDeadline, setManualDeadline] = useState('');
  const [manualTitle, setManualTitle] = useState('');
  const [batchCount, setBatchCount] = useState(3);
  const [nextRequestKey, setNextRequestKey] = useState('');
  const [batchRequestKey, setBatchRequestKey] = useState('');
  const queryClient = useQueryClient();

  const list = useQuery({
    queryKey: ['content-series', 'list', projectFilter, search, status, ownerFilter, recurrenceFilter, typeFilter, listPage],
    queryFn: () => seriesApi.list({
      projectId: projectFilter, search, status, ownerId: ownerFilter, recurrenceType: recurrenceFilter,
      contentType: typeFilter, page: listPage, per_page: 20,
    }),
    enabled: !selectedId,
  });
  const workspaceSummary = useQuery({
    queryKey: ['content-series', 'workspace-summary'], queryFn: seriesApi.workspaceSummary, enabled: !selectedId,
  });
  const detail = useQuery({
    queryKey: ['content-series', 'detail', selectedId], queryFn: () => seriesApi.get(selectedId!), enabled: Boolean(selectedId),
  });
  const itemSummary = useQuery({
    queryKey: ['content-series', selectedId, 'summary'], queryFn: () => seriesApi.itemSummary(selectedId!), enabled: Boolean(selectedId),
  });
  const preview = useQuery({
    queryKey: ['content-series', selectedId, 'preview'], queryFn: () => seriesApi.preview(selectedId!),
    enabled: Boolean(selectedId && detail.data?.data.status === 'active'),
  });
  const schedule = useQuery({
    queryKey: ['content-series', selectedId, 'schedule', batchCount], queryFn: () => seriesApi.schedule(selectedId!, batchCount),
    enabled: Boolean(selectedId && (tab === 'schedule' || batchConfirmationOpen)),
  });
  const occurrences = useQuery({
    queryKey: ['content-series', selectedId, 'occurrences', occurrencePage, occurrenceSearch, occurrenceStatus, activationFilter],
    queryFn: () => seriesApi.occurrences(selectedId!, {
      page: occurrencePage, per_page: 20, search: occurrenceSearch, status: occurrenceStatus, activation: activationFilter,
    }),
    enabled: Boolean(selectedId && tab === 'occurrences'),
  });
  const revisions = useQuery({
    queryKey: ['content-series', selectedId, 'revisions', revisionPage], queryFn: () => seriesApi.revisions(selectedId!, revisionPage),
    enabled: Boolean(selectedId && tab === 'revisions'),
  });
  const activity = useQuery({
    queryKey: ['content-series', selectedId, 'activity', activityPage], queryFn: () => seriesApi.activity(selectedId!, activityPage),
    enabled: Boolean(selectedId && tab === 'activity'),
  });
  const integrity = useQuery({
    queryKey: ['content-series', selectedId, 'integrity'], queryFn: () => seriesApi.integrity(selectedId!),
    enabled: Boolean(selectedId && tab === 'integrity'),
  });

  useEffect(() => {
    setTab('occurrences'); setOccurrencePage(1); setRevisionPage(1); setActivityPage(1);
  }, [selectedId]);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['content-series'] });
  };

  const transition = useMutation({
    mutationFn: ({ series, command }: { series: ContentSeries; command: 'pause' | 'resume' | 'archive' | 'restore' }) =>
      seriesApi.transition(series.id, command, series.lockVersion),
    onSuccess: async (result, variables) => {
      const labels = { pause: 'مجموعه متوقف شد', resume: 'مجموعه ادامه یافت', archive: 'مجموعه بایگانی شد', restore: 'مجموعه بازگردانی شد' };
      notify({ type: 'success', title: labels[variables.command], message: variables.command === 'archive' ? 'رخدادها، روابط و تاریخچه حفظ شدند.' : undefined });
      setArchiveConfirmationOpen(false);
      queryClient.setQueryData(['content-series', 'detail', result.data.id], result);
      await invalidate();
    },
    onError: error => {
      notify({ type: 'error', title: parseApiError(error).message });
      void detail.refetch();
    },
  });
  const nextMutation = useMutation({
    mutationFn: ({ series, startDate, deadline, title }: { series: ContentSeries; startDate?: string; deadline?: string; title?: string }) =>
      seriesApi.createNext(series.id, {
        periodKey: preview.data!.data.periodKey,
        requestKey: nextRequestKey,
        lockVersion: series.lockVersion,
        startDate, deadline, title,
      }),
    onSuccess: async result => {
      notify({ type: 'success', title: 'رخداد مستقل ساخته شد', message: `«${result.data.title}» با جریان کار مستقل ثبت شد.` });
      setNextConfirmationOpen(false); setManualOpen(false); setNextRequestKey('');
      await invalidate();
    },
    onError: error => {
      notify({ type: 'error', title: parseApiError(error).message, message: 'کلید درخواست برای تلاش مجدد حفظ شد.' });
      void detail.refetch(); void preview.refetch();
    },
  });
  const batchMutation = useMutation({
    mutationFn: (series: ContentSeries) => seriesApi.batch(series.id, batchCount, batchRequestKey, series.lockVersion),
    onSuccess: async result => {
      notify({ type: 'success', title: 'برنامه‌ریزی دسته‌ای انجام شد', message: `${result.data.length.toLocaleString('fa-IR')} Content مستقل ثبت شد.` });
      setBatchConfirmationOpen(false); setBatchRequestKey('');
      await invalidate();
    },
    onError: error => {
      notify({ type: 'error', title: parseApiError(error).message, message: 'کلید دسته برای تلاش مجدد تغییر نکرده است.' });
      void detail.refetch();
    },
  });

  const closeForm = () => {
    setFormOpen(false); setEditing(null);
    const next = new URLSearchParams(params); next.delete('create'); setParams(next);
  };
  const openDetail = (id: string) => {
    const next = new URLSearchParams(params); next.set('series', id); setParams(next);
  };
  const backToList = () => {
    const next = new URLSearchParams(params); next.delete('series'); setParams(next);
  };

  const selected = detail.data?.data;
  if (selectedId) {
    if (detail.isLoading) return <PageShell><LoadingState label="در حال دریافت فضای کاری مجموعه…" /></PageShell>;
    if (detail.isError || !selected) return <PageShell><ErrorState error={detail.error} onRetry={() => detail.refetch()} title="جزئیات مجموعه دریافت نشد." /></PageShell>;
    const nextPreview = preview.data?.data;
    const selectedProject = projects.find(project => project.id === selected.projectId);
    const selectedOwner = users.find(user => user.id === selected.ownerId);
    const selectedDepartment = departments.find(department => department.id === selected.departmentId);
    const publication = selected.defaultPublicationConfig as Record<string, unknown>;

    const beginNext = () => {
      if (!nextPreview) return;
      if (!nextRequestKey) setNextRequestKey(crypto.randomUUID());
      if (selected.recurrenceType === 'manual') {
        const start = nextPreview.startDate || new Date().toISOString().slice(0, 10);
        setManualStart(start); setManualDeadline(nextPreview.deadline || start); setManualTitle(nextPreview.title); setManualOpen(true);
      } else setNextConfirmationOpen(true);
    };
    const beginBatch = () => {
      if (!batchRequestKey) setBatchRequestKey(crypto.randomUUID());
      setBatchConfirmationOpen(true);
    };

    return (
      <PageShell>
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xs">
          <div className="h-1 bg-gradient-to-l from-indigo-600 via-violet-500 to-fuchsia-400" />
          <div className="p-5 sm:p-6">
            <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <IconButton label="بازگشت به مجموعه‌ها" purpose="back" variant="ghost" onClick={backToList}><ArrowRight className="h-4 w-4" /></IconButton>
                  <SeriesStatus status={selected.status} />
                  <Badge>{recurrenceLabels[selected.recurrenceType]}</Badge>
                  <Badge>نسخه {selected.currentRevision?.version || 1}</Badge>
                </div>
                <h1 className="mt-3 text-xl font-black text-slate-900 sm:text-2xl">{selected.name}</h1>
                <p className="mt-2 max-w-3xl text-xs leading-6 text-slate-600">{selected.description || 'توضیحی ثبت نشده است.'}</p>
                <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-slate-500">
                  <Meta icon={<Layers3 />} label="پروژه" value={selectedProject?.name || 'بدون پروژه'} />
                  <Meta icon={<UserRound />} label="مالک" value={selectedOwner?.name || '—'} />
                  <Meta icon={<Building2 />} label="دپارتمان" value={selectedDepartment?.name || '—'} />
                  <Meta icon={<Hash />} label="شناسه کد" value={selected.codePrefix || '—'} />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {selected.access?.edit && selected.status === 'active' && <Button variant="warning" loading={transition.isPending} onClick={() => transition.mutate({ series: selected, command: 'pause' })}><Pause className="h-4 w-4" />توقف</Button>}
                {selected.access?.edit && selected.status === 'paused' && <Button loading={transition.isPending} onClick={() => transition.mutate({ series: selected, command: 'resume' })}><Play className="h-4 w-4" />ادامه</Button>}
                {selected.access?.edit && selected.status === 'archived' && <Button variant="secondary" loading={transition.isPending} onClick={() => transition.mutate({ series: selected, command: 'restore' })}><RotateCcw className="h-4 w-4" />بازگردانی به توقف</Button>}
                {selected.access?.edit && selected.status !== 'archived' && <Button variant="secondary" onClick={() => { setEditing(selected); setFormOpen(true); }}><Pencil className="h-4 w-4" />نسخه آینده</Button>}
                {selected.access?.archive && selected.status !== 'archived' && <Button variant="danger" onClick={() => setArchiveConfirmationOpen(true)}><Archive className="h-4 w-4" />بایگانی</Button>}
              </div>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-2 border-t border-slate-100 pt-5 sm:grid-cols-4 lg:grid-cols-7">
              <Metric label="کل رخداد" value={selected.occurrenceCount} />
              <Metric label="منتشرشده" value={selected.publishedCount} />
              <Metric label="انتظار فعال‌سازی" value={selected.plannedCount} />
              <Metric label="تسک باز" value={selected.activeTaskCount} />
              <Metric label="عقب‌افتاده" value={itemSummary.data?.data.overdue || 0} tone="danger" />
              <Metric label="شماره بعدی" value={selected.nextSequenceNumber} />
              <Metric label="آخرین کد" value={itemSummary.data?.data.latestCode || '—'} />
            </div>
          </div>
        </section>

        {selected.status === 'active' && selected.access?.edit && (
          <section className="rounded-2xl border border-indigo-200 bg-indigo-50/70 p-4">
            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-black text-indigo-800"><CalendarClock className="h-5 w-5" />رخداد بعدی</div>
                {preview.isLoading && <p className="mt-2 text-xs text-indigo-500">در حال محاسبه سروری…</p>}
                {nextPreview && <><p className="mt-2 truncate text-sm font-bold text-slate-900">{nextPreview.title}</p><p className="mt-1 text-[11px] text-slate-600">شروع {formatPersianDate(nextPreview.startDate)} · مهلت {formatPersianDate(nextPreview.deadline)} · نسخه {nextPreview.revisionVersion} · {nextPreview.willActivateTasks ? 'فعال‌سازی فوری تسک‌ها' : 'فعال‌سازی تسک‌ها در سررسید'}</p></>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button disabled={!nextPreview} loading={nextMutation.isPending} onClick={beginNext}><Plus className="h-4 w-4" />{selected.recurrenceType === 'manual' ? 'رخداد دستی' : 'ایجاد بعدی'}</Button>
                {selected.recurrenceType !== 'manual' && <><Input aria-label="تعداد رخداد دسته‌ای" type="number" min={1} max={24} value={batchCount} onChange={event => setBatchCount(Math.max(1, Math.min(24, Number(event.target.value) || 1)))} className="w-20 text-center" /><Button variant="secondary" onClick={beginBatch}>پیش‌نمایش دسته</Button></>}
              </div>
            </div>
          </section>
        )}

        <nav className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5" aria-label="بخش‌های مجموعه">
          {tabs.filter(item => item.id !== 'integrity' || hasPermission('integrity.view')).map(item => { const Icon = item.icon; return <button key={item.id} onClick={() => setTab(item.id)} className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-[11px] font-bold ${tab === item.id ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}><Icon className="h-4 w-4" />{item.label}</button>; })}
        </nav>

        {tab === 'occurrences' && (
          <Panel title="رخدادهای مستقل" subtitle="فیلتر و صفحه‌بندی در سرور انجام می‌شود.">
            <FilterBar>
              <Input value={occurrenceSearch} onChange={event => { setOccurrenceSearch(event.target.value); setOccurrencePage(1); }} placeholder="جستجو در عنوان یا کد…" className="min-w-52 flex-1" />
              <Select value={occurrenceStatus} onChange={event => { setOccurrenceStatus(event.target.value); setOccurrencePage(1); }}><option value="">همه وضعیت‌ها</option><option value="planning">برنامه‌ریزی</option><option value="producing">در حال تولید</option><option value="reviewing">در بررسی</option><option value="published">منتشرشده</option><option value="archived">بایگانی</option></Select>
              <Select value={activationFilter} onChange={event => { setActivationFilter(event.target.value); setOccurrencePage(1); }}><option value="">همه چرخه‌ها</option><option value="active">تسک‌ها فعال</option><option value="waiting">منتظر فعال‌سازی</option></Select>
            </FilterBar>
            {occurrences.isLoading && <LoadingState label="در حال دریافت رخدادها…" />}
            {occurrences.isError && <ErrorState error={occurrences.error} onRetry={() => occurrences.refetch()} />}
            {!occurrences.isLoading && !occurrences.isError && <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-100">{(occurrences.data?.data || []).map(content => <button key={content.id} onClick={() => { setSelectedContentId(content.id); setActiveView('content-detail'); }} className="flex w-full flex-col gap-3 bg-white p-4 text-right hover:bg-indigo-50/40 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-xs font-extrabold text-slate-900">{content.title}</p><span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[10px]">{content.code || 'بدون کد'}</span>{content.seriesRevisionId && <span className="text-[10px] text-indigo-600">نسخه #{content.seriesRevisionId}</span>}</div><p className="mt-1 text-[11px] text-slate-500">دوره {content.periodKey} · مهلت {formatPersianDate(content.deadline)} · انتشار {formatPersianDate(content.publishInfo?.date)}{content.publishInfo?.time ? ` ساعت ${content.publishInfo.time}` : ''}</p><p className="mt-1 text-[10px] text-slate-400">{content.seriesActivatedAt ? 'تسک‌ها فعال شده‌اند' : `فعال‌سازی در ${formatPersianDate(content.plannedStartAt)}`}</p></div><span className="w-fit rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold">{content.status}</span></button>)}{!occurrences.data?.data.length && <EmptyState title="رخدادی مطابق فیلتر پیدا نشد." />}</div>}
            <Pagination meta={occurrences.data?.meta} busy={occurrences.isFetching} onPage={setOccurrencePage} />
          </Panel>
        )}

        {tab === 'schedule' && (
          <Panel title="تقویم آینده" subtitle="محاسبه قطعی سمت سرور و بر پایه تقویم سازمان است.">
            {schedule.isLoading && <LoadingState label="در حال محاسبه تقویم…" />}
            {schedule.isError && <ErrorState error={schedule.error} onRetry={() => schedule.refetch()} />}
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{(schedule.data?.data || []).map(item => <div key={`${item.periodKey}-${item.sequence}`} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-center justify-between"><span className="text-xs font-black text-slate-800">شماره {item.sequence.toLocaleString('fa-IR')}</span><Badge>{item.periodLabel}</Badge></div><p className="mt-3 truncate text-xs font-bold">{item.title}</p><p className="mt-2 text-[11px] leading-5 text-slate-500">شروع {formatPersianDate(item.startDate)}<br />مهلت {formatPersianDate(item.deadline)}<br />انتشار {formatPersianDate(item.publicationDate)} ساعت {item.publicationTime}<br />کد پیشنهادی {item.proposedCode || 'خودکار'}</p></div>)}</div>
          </Panel>
        )}

        {tab === 'defaults' && (
          <Panel title="تنظیمات نسخه جاری" subtitle="رخدادهای قبلی snapshot خود را حفظ می‌کنند.">
            <div className="grid gap-4 md:grid-cols-2">
              <InfoCard icon={<FileStack />} title="فرایند"><InfoLine label="قالب" value={processTemplates.find(item => item.id === selected.processTemplateId)?.name || 'بدون قالب'} /><InfoLine label="تعداد مراحل" value={String(selected.defaultContentPayload?.stages?.length || 0)} /><InfoLine label="نوع محتوا" value={contentTypes.find(item => item.id === selected.contentType)?.name || selected.contentType} /></InfoCard>
              <InfoCard icon={<Eye />} title="انتشار و نمایش"><InfoLine label="سطح نمایش" value={visibilityLabel(String(publication?.visibility || 'internal'))} /><InfoLine label="کانال‌ها" value={Array.isArray(publication?.channels) ? publication.channels.join('، ') || '—' : '—'} /><InfoLine label="وضعیت اولیه" value={String(publication?.status || 'planned')} /><InfoLine label="ساعت انتشار" value={String(publication?.time || selected.recurrenceConfig.activationTime || '۰۰:۰۰')} /></InfoCard>
              <InfoCard icon={<Link2 />} title="دارایی‌های مرجع"><div className="flex flex-wrap gap-2">{(selected.defaultContentPayload?.assetIds || []).map(id => <span key={id} className="rounded-lg border border-slate-200 px-2 py-1 text-[10px]">{assets.find(asset => asset.id === String(id))?.title || `دارایی ${id}`}</span>)}{!selected.defaultContentPayload?.assetIds?.length && <span className="text-xs text-slate-400">دارایی مرجعی انتخاب نشده است.</span>}</div></InfoCard>
              <InfoCard icon={<CalendarClock />} title="قاعده زمان‌بندی"><InfoLine label="تقویم" value={selected.recurrenceConfig.calendar === 'gregorian' ? 'میلادی' : 'جلالی سازمان'} /><InfoLine label="لنگر" value={formatPersianDate(selected.recurrenceConfig.startDate)} /><InfoLine label="فاصله" value={String(selected.recurrenceConfig.interval || 1)} /></InfoCard>
            </div>
          </Panel>
        )}

        {tab === 'revisions' && (
          <Panel title="نسخه‌های تنظیمات" subtitle="هر نسخه از شماره رخداد مشخصی مؤثر است.">
            {revisions.isLoading && <LoadingState label="در حال دریافت نسخه‌ها…" />}
            {revisions.isError && <ErrorState error={revisions.error} onRetry={() => revisions.refetch()} />}
            <div className="space-y-3">{(revisions.data?.data || []).map(revision => <div key={revision.id} className={`rounded-2xl border p-4 ${revision.id === selected.currentRevisionId ? 'border-indigo-200 bg-indigo-50/50' : 'border-slate-200'}`}><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-black">نسخه {revision.version.toLocaleString('fa-IR')} {revision.id === selected.currentRevisionId && <span className="text-indigo-600">· جاری</span>}</p><span className="text-[10px] text-slate-400">{formatPersianDate(revision.createdAt)}</span></div><p className="mt-2 text-[11px] text-slate-600">از رخداد {revision.effectiveFromSequence.toLocaleString('fa-IR')} · {recurrenceLabels[revision.recurrenceType]} · {revision.author?.name || 'سامانه'}</p><p className="mt-1 text-[11px] text-slate-500">{revision.changeReason || 'بدون توضیح تغییر'}</p></div>)}</div>
            <Pagination meta={revisions.data?.meta} busy={revisions.isFetching} onPage={setRevisionPage} />
          </Panel>
        )}

        {tab === 'activity' && (
          <Panel title="تاریخچه عملیاتی" subtitle="رویدادهای محدود و سرورساخته؛ بدون مقادیر حساس.">
            {activity.isLoading && <LoadingState label="در حال دریافت تاریخچه…" />}
            {activity.isError && <ErrorState error={activity.error} onRetry={() => activity.refetch()} />}
            <div className="space-y-2">{(activity.data?.data || []).map(item => <div key={item.id} className="flex items-start gap-3 rounded-2xl border border-slate-100 p-3"><span className="mt-0.5 rounded-lg bg-slate-100 p-2"><Activity className="h-4 w-4 text-slate-500" /></span><div><p className="text-xs font-bold text-slate-800">{item.action}</p><p className="mt-1 text-[10px] text-slate-500">{item.actor?.name || 'سامانه'} · {formatPersianDate(item.createdAt)}</p></div></div>)}{!activity.data?.data.length && !activity.isLoading && <EmptyState title="رویدادی ثبت نشده است." />}</div>
            <Pagination meta={activity.data?.meta} busy={activity.isFetching} onPage={setActivityPage} />
          </Panel>
        )}

        {tab === 'integrity' && (
          <Panel title="تشخیص یکپارچگی" subtitle="این نما فقط خواندنی است و هیچ ترمیم خودکاری انجام نمی‌دهد.">
            {integrity.isLoading && <LoadingState label="در حال بررسی…" />}
            {integrity.isError && <ErrorState error={integrity.error} onRetry={() => integrity.refetch()} />}
            {integrity.data?.data.healthy ? <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm font-bold text-emerald-800"><CheckCircle2 className="h-6 w-6" />ناسازگاری قابل مشاهده‌ای یافت نشد.</div> : <div className="space-y-3">{integrity.data?.data.issues.map(issue => <div key={issue.code} className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4"><AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" /><div><p className="text-xs font-bold text-amber-900">{issue.message}</p><p className="mt-1 text-[10px] text-amber-700">{issue.count.toLocaleString('fa-IR')} مورد · {issue.code}</p></div></div>)}</div>}
            <Button variant="secondary" className="mt-4" onClick={() => integrity.refetch()} loading={integrity.isFetching}><RefreshCw className="h-4 w-4" />بررسی دوباره</Button>
          </Panel>
        )}

        <SeriesForm open={formOpen} initial={editing} projectDefault={projectFilter} onClose={closeForm} onSaved={async () => { await invalidate(); }} />
        <ConfirmDialog open={nextConfirmationOpen} onClose={() => setNextConfirmationOpen(false)} onConfirm={() => nextMutation.mutate({ series: selected })} busy={nextMutation.isPending} title={`رخداد «${nextPreview?.title || 'بعدی'}» با کلید دوره ${nextPreview?.periodKey || '—'} ساخته شود؟`} />
        <ConfirmDialog open={archiveConfirmationOpen} onClose={() => setArchiveConfirmationOpen(false)} onConfirm={() => transition.mutate({ series: selected, command: 'archive' })} busy={transition.isPending} title={`مجموعه «${selected.name}» بایگانی شود؟ رخدادها، انتشارها، روابط و تاریخچه حذف نمی‌شوند.`} />
        <ConfirmDialog open={batchConfirmationOpen} onClose={() => setBatchConfirmationOpen(false)} onConfirm={() => batchMutation.mutate(selected)} busy={batchMutation.isPending} title={`${batchCount.toLocaleString('fa-IR')} رخداد مستقل از ${formatPersianDate(schedule.data?.data[0]?.startDate)} تا ${formatPersianDate(schedule.data?.data.at(-1)?.startDate)} ثبت شود؟`} />
        <Modal open={manualOpen} onClose={() => setManualOpen(false)} title="رخداد دستی با تاریخ صریح" description="تاریخ‌ها فقط برای همین Content مستقل هستند." icon={<Clock3 className="h-5 w-5" />} busy={nextMutation.isPending} size="md"><form onSubmit={event => { event.preventDefault(); nextMutation.mutate({ series: selected, startDate: manualStart, deadline: manualDeadline, title: manualTitle }); }} className="space-y-4 p-5"><FormField label="عنوان" htmlFor="manual-title"><Input id="manual-title" required value={manualTitle} onChange={event => setManualTitle(event.target.value)} /></FormField><div className="grid gap-4 sm:grid-cols-2"><PersianDatePicker label="تاریخ رخداد" required value={manualStart} onChange={setManualStart} portal /><PersianDatePicker label="مهلت" required value={manualDeadline} onChange={setManualDeadline} portal /></div><div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><Button type="button" variant="secondary" onClick={() => setManualOpen(false)}>انصراف</Button><Button type="submit" loading={nextMutation.isPending}>ایجاد رخداد</Button></div></form></Modal>
      </PageShell>
    );
  }

  const rows = list.data?.data || [];
  const totals = workspaceSummary.data?.data;
  const activeFilterCount = [search.trim(), projectFilter, ownerFilter, status, recurrenceFilter, typeFilter]
    .filter(Boolean).length;
  const clearFilters = () => {
    setSearch(''); setOwnerFilter(''); setStatus(''); setRecurrenceFilter(''); setTypeFilter(''); setListPage(1);
    const next = new URLSearchParams(params); next.delete('project'); setParams(next);
  };
  return (
    <PageShell>
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-md shadow-indigo-200"><Layers3 className="h-5 w-5" /></div><div><h1 className="text-xl font-black text-slate-900 sm:text-2xl">مجموعه‌های محتوا</h1><p className="mt-1 text-xs text-slate-600">برنامه‌ریزی تکرارشونده با رخدادهای مستقل و نسخه‌های آینده</p></div></div>
        {hasPermission('content.create') && <Button onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="h-4 w-4" />مجموعه جدید</Button>}
      </header>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7"><Metric label="کل مجموعه" value={totals?.total || 0} /><Metric label="فعال" value={totals?.active || 0} /><Metric label="متوقف" value={totals?.paused || 0} /><Metric label="بایگانی" value={totals?.archived || 0} /><Metric label="کل رخداد" value={totals?.occurrences || 0} /><Metric label="منتشرشده" value={totals?.published || 0} /><Metric label="منتظر فعال‌سازی" value={totals?.waitingActivation || 0} /></div>
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs" role="search" aria-label="فیلترهای مجموعه‌های محتوا">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-indigo-100 bg-indigo-50 text-indigo-600"><Funnel className="h-4 w-4" /></span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><h2 className="text-xs font-black text-slate-800">جست‌وجو و فیلترها</h2>{activeFilterCount > 0 && <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-black text-indigo-700">{activeFilterCount.toLocaleString('fa-IR')} فیلتر فعال</span>}</div>
              <p className="mt-0.5 text-[10px] text-slate-500">نتایج با تغییر هر گزینه به‌روز می‌شوند.</p>
            </div>
          </div>
          {activeFilterCount > 0 && <Button variant="ghost" className="text-[11px] text-slate-600" onClick={clearFilters}><X className="h-3.5 w-3.5" />پاک‌کردن همه</Button>}
        </div>
        <div className="space-y-4 p-4 sm:p-5">
          <div>
            <label htmlFor="series-search" className="mb-1.5 block text-[11px] font-bold text-slate-600">جست‌وجو</label>
            <div className="relative"><Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input id="series-search" value={search} onChange={event => { setSearch(event.target.value); setListPage(1); }} placeholder="نام مجموعه، شناسه کد یا بخشی از توضیحات…" className="w-full pr-9" /></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <CompactFilter label="پروژه" htmlFor="series-project-filter">
              <Select id="series-project-filter" value={projectFilter} onChange={event => { const next = new URLSearchParams(params); event.target.value ? next.set('project', event.target.value) : next.delete('project'); setParams(next); setListPage(1); }}><option value="">همه پروژه‌ها</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</Select>
            </CompactFilter>
            <CompactFilter label="مالک" htmlFor="series-owner-filter">
              <Select id="series-owner-filter" value={ownerFilter} onChange={event => { setOwnerFilter(event.target.value); setListPage(1); }}><option value="">همه مالکان</option>{users.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}</Select>
            </CompactFilter>
            <CompactFilter label="وضعیت" htmlFor="series-status-filter">
              <Select id="series-status-filter" value={status} onChange={event => { setStatus(event.target.value); setListPage(1); }}><option value="">همه وضعیت‌ها</option><option value="active">فعال</option><option value="paused">متوقف</option><option value="archived">بایگانی</option></Select>
            </CompactFilter>
            <CompactFilter label="تناوب" htmlFor="series-recurrence-filter">
              <Select id="series-recurrence-filter" value={recurrenceFilter} onChange={event => { setRecurrenceFilter(event.target.value); setListPage(1); }}><option value="">همه تناوب‌ها</option>{Object.entries(recurrenceLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</Select>
            </CompactFilter>
            <CompactFilter label="نوع محتوا" htmlFor="series-type-filter">
              <Select id="series-type-filter" value={typeFilter} onChange={event => { setTypeFilter(event.target.value); setListPage(1); }}><option value="">همه انواع محتوا</option>{contentTypes.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}</Select>
            </CompactFilter>
          </div>
        </div>
      </section>
      {list.isLoading && <LoadingState label="در حال دریافت مجموعه‌ها…" />}
      {list.isError && <ErrorState error={list.error} onRetry={() => list.refetch()} title="فهرست مجموعه‌ها دریافت نشد." />}
      {!list.isLoading && !list.isError && <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="hidden grid-cols-[minmax(15rem,2fr)_1fr_1fr_7rem_7rem] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 text-[10px] font-bold text-slate-500 lg:grid"><span>مجموعه</span><span>دامنه</span><span>تناوب</span><span>رخداد</span><span>وضعیت</span></div>{rows.map(row => <button key={row.id} onClick={() => openDetail(row.id)} className="grid w-full gap-3 border-b border-slate-100 p-4 text-right last:border-0 hover:bg-indigo-50/40 lg:grid-cols-[minmax(15rem,2fr)_1fr_1fr_7rem_7rem] lg:items-center"><div className="min-w-0"><p className="truncate text-xs font-black text-slate-900">{row.name}</p><p className="mt-1 truncate text-[10px] text-slate-500">{row.codePrefix} · {row.description || 'بدون توضیح'}</p></div><div className="text-[11px] text-slate-600"><p>{row.project?.name || projects.find(project => project.id === row.projectId)?.name || 'بدون پروژه'}</p><p className="mt-1 text-[10px] text-slate-400">{row.owner?.name || users.find(user => user.id === row.ownerId)?.name || '—'}</p></div><div className="text-[11px] text-slate-600">{recurrenceLabels[row.recurrenceType]}<p className="mt-1 text-[10px] text-slate-400">نسخه {row.currentRevisionVersion || 1}</p></div><span className="text-xs font-black text-slate-700">{row.occurrenceCount.toLocaleString('fa-IR')}</span><SeriesStatus status={row.status} /></button>)}{!rows.length && <EmptyState title="مجموعه‌ای مطابق فیلترها پیدا نشد." />}</div>}
      <Pagination meta={list.data?.meta} busy={list.isFetching} onPage={setListPage} />
      <SeriesForm open={formOpen} initial={editing} projectDefault={projectFilter} onClose={closeForm} onSaved={async series => { await invalidate(); openDetail(series.id); }} />
    </PageShell>
  );
};

function PageShell({ children }: { children: React.ReactNode }) { return <div dir="rtl" className="mx-auto max-w-7xl space-y-5 p-4 text-right sm:p-6 lg:p-8">{children}</div>; }
function SeriesStatus({ status }: { status: ContentSeries['status'] }) { const styles = status === 'active' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : status === 'paused' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-slate-200 bg-slate-100 text-slate-600'; return <span className={`w-fit rounded-lg border px-2.5 py-1 text-[10px] font-extrabold ${styles}`}>{statusLabels[status]}</span>; }
function CompactFilter({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) { return <div className="min-w-0 space-y-1.5"><label htmlFor={htmlFor} className="block text-[11px] font-bold text-slate-600">{label}</label><div className="[&_.ui-input]:w-full">{children}</div></div>; }
function Badge({ children }: { children: React.ReactNode }) { return <span className="rounded-lg border border-indigo-100 bg-indigo-50 px-2.5 py-1 text-[10px] font-bold text-indigo-700">{children}</span>; }
function Metric({ label, value, tone = 'default' }: { label: string; value: number | string; tone?: 'default' | 'danger' }) { return <div className={`rounded-2xl border p-3 ${tone === 'danger' ? 'border-rose-100 bg-rose-50' : 'border-slate-100 bg-white'}`}><p className="text-[10px] font-bold text-slate-500">{label}</p><p className={`mt-1 text-base font-black ${tone === 'danger' ? 'text-rose-700' : 'text-slate-900'}`}>{typeof value === 'number' ? value.toLocaleString('fa-IR') : value}</p></div>; }
function Meta({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { return <span className="inline-flex items-center gap-1.5"><span className="text-indigo-500 [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>{label}: <b className="text-slate-700">{value}</b></span>; }
function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) { return <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-2xs sm:p-5"><div className="mb-4"><h2 className="text-sm font-black text-slate-900">{title}</h2><p className="mt-1 text-[11px] text-slate-500">{subtitle}</p></div>{children}</section>; }
function InfoCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) { return <div className="rounded-2xl border border-slate-200 p-4"><div className="mb-3 flex items-center gap-2 text-xs font-black text-slate-800"><span className="text-indigo-500 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>{title}</div><div className="space-y-2">{children}</div></div>; }
function InfoLine({ label, value }: { label: string; value: string }) { return <div className="flex justify-between gap-3 text-[11px]"><span className="text-slate-500">{label}</span><b className="text-left text-slate-700">{value}</b></div>; }
function visibilityLabel(value: string) { return value === 'public' ? 'عمومی' : value === 'restricted' ? 'محدود' : 'داخلی'; }

export default ContentSeriesView;
