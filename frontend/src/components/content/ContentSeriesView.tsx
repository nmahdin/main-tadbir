import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  Archive, ArrowRight, Building2, CalendarClock, Clock3, Eye, FileStack, Grid3X3, Hash,
  Layers3, Link2, List, ListChecks, Pause, Pencil, Play, Plus, RotateCcw, Search,
  Settings2, SlidersHorizontal, UserRound, X,
} from 'lucide-react';
import { seriesApi, type NextOccurrenceInput } from '../../api/series';
import { parseApiError } from '../../api/errors';
import { useApp } from '../../context/AppContext';
import type { ContentProcessTemplate, ContentSeries, Department, SeriesPeriodPreview, SeriesRecurrenceType, User } from '../../types';
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
  { id: 'occurrences', label: 'پرونده‌های محتوا', icon: ListChecks },
  { id: 'schedule', label: 'تقویم آینده', icon: CalendarClock },
  { id: 'defaults', label: 'پیش‌فرض‌ها', icon: Settings2 },
  { id: 'revisions', label: 'نسخه‌ها', icon: FileStack },
] as const;
type DetailTab = typeof tabs[number]['id'];
type OccurrenceDraft = {
  title: string;
  startDate: string;
  deadline: string;
  processTemplateId: string;
  publicationDate: string;
  publicationTime: string;
  caption: string;
  assignments: Record<string, { assigneeId: string; reviewerId: string }>;
};

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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [tab, setTab] = useState<DetailTab>('occurrences');
  const [occurrencePage, setOccurrencePage] = useState(1);
  const [revisionPage, setRevisionPage] = useState(1);
  const [occurrenceSearch, setOccurrenceSearch] = useState('');
  const [occurrenceStatus, setOccurrenceStatus] = useState('');
  const [activationFilter, setActivationFilter] = useState('');
  const [editing, setEditing] = useState<ContentSeries | null>(null);
  const [formOpen, setFormOpen] = useState(params.get('create') === '1');
  const [occurrenceOpen, setOccurrenceOpen] = useState(false);
  const [occurrenceDraft, setOccurrenceDraft] = useState<OccurrenceDraft | null>(null);
  const [archiveConfirmationOpen, setArchiveConfirmationOpen] = useState(false);
  const [listArchiveTarget, setListArchiveTarget] = useState<ContentSeries | null>(null);
  const [batchConfirmationOpen, setBatchConfirmationOpen] = useState(false);
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


  useEffect(() => {
    setTab('occurrences'); setOccurrencePage(1); setRevisionPage(1);
  }, [selectedId]);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['content-series'] });
  };

  const transition = useMutation({
    mutationFn: ({ series, command }: { series: ContentSeries; command: 'pause' | 'resume' | 'archive' | 'restore' }) =>
      seriesApi.transition(series.id, command, series.lockVersion),
    onSuccess: async (result, variables) => {
      const labels = { pause: 'مجموعه متوقف شد', resume: 'مجموعه ادامه یافت', archive: 'مجموعه بایگانی شد', restore: 'مجموعه بازگردانی شد' };
      notify({ type: 'success', title: labels[variables.command], message: variables.command === 'archive' ? 'پرونده‌های محتوا، روابط و تاریخچه حفظ شدند.' : undefined });
      setArchiveConfirmationOpen(false);
      setListArchiveTarget(null);
      queryClient.setQueryData(['content-series', 'detail', result.data.id], result);
      await invalidate();
    },
    onError: error => {
      notify({ type: 'error', title: parseApiError(error).message });
      void detail.refetch();
    },
  });
  const nextMutation = useMutation({
    mutationFn: ({ series, overrides }: { series: ContentSeries; overrides: Omit<NextOccurrenceInput, 'periodKey' | 'requestKey' | 'lockVersion'> }) =>
      seriesApi.createNext(series.id, {
        periodKey: preview.data!.data.periodKey,
        requestKey: nextRequestKey,
        lockVersion: series.lockVersion,
        ...overrides,
      }),
    onSuccess: async result => {
      notify({ type: 'success', title: 'پروندهٔ محتوای مستقل ساخته شد', message: `«${result.data.title}» به این مجموعه پیوند خورد و جریان کار مستقل خود را دارد.` });
      setOccurrenceOpen(false); setOccurrenceDraft(null); setNextRequestKey('');
      await invalidate();
    },
    onError: error => {
      notify({ type: 'error', title: parseApiError(error).message, message: 'کلید درخواست برای تلاش مجدد حفظ شد.' });
      void detail.refetch(); void preview.refetch();
    },
  });
  const batchMutation = useMutation({
    mutationFn: (series: ContentSeries) => seriesApi.batch(series.id, Math.min(batchCount, schedule.data?.data.length || batchCount), batchRequestKey, series.lockVersion),
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
      if (!nextPreview?.canCreate) return;
      if (!nextRequestKey) setNextRequestKey(crypto.randomUUID());
      const publicationDefaults = selected.defaultPublicationConfig as Record<string, unknown>;
      const defaultStages = selected.defaultContentPayload?.stages || [];
      setOccurrenceDraft({
        title: selected.recurrenceType === 'manual' ? selected.name : nextPreview.title,
        startDate: nextPreview.startDate || new Date().toISOString().slice(0, 10),
        deadline: nextPreview.deadline || nextPreview.startDate,
        processTemplateId: selected.processTemplateId || '',
        publicationDate: nextPreview.publicationDate || nextPreview.startDate,
        publicationTime: nextPreview.publicationTime || String(publicationDefaults.time || '00:00'),
        caption: String(publicationDefaults.caption || ''),
        assignments: Object.fromEntries(defaultStages.map(stage => [
          stage.stageKey || stage.id,
          { assigneeId: stage.assigneeId || '', reviewerId: stage.reviewerId || '' },
        ])),
      });
      setOccurrenceOpen(true);
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
            <div className="mt-6 grid grid-cols-2 gap-2 border-t border-slate-100 pt-5 sm:grid-cols-4">
              <Metric label="پرونده محتوا / برنامه" value={selected.recurrenceConfig.occurrenceLimit ? `${selected.occurrenceCount.toLocaleString('fa-IR')} / ${selected.recurrenceConfig.occurrenceLimit.toLocaleString('fa-IR')}` : selected.occurrenceCount} />
              <Metric label="منتشرشده" value={selected.publishedCount} />
              <Metric label="انتظار فعال‌سازی" value={selected.plannedCount} />
              <Metric label="عقب‌افتاده" value={itemSummary.data?.data.overdue || 0} tone="danger" />
            </div>
          </div>
        </section>

        {selected.status === 'active' && selected.access?.edit && (
          <section className="rounded-2xl border border-indigo-200 bg-indigo-50/70 p-4">
            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-black text-indigo-800"><CalendarClock className="h-5 w-5" />پروندهٔ محتوای بعدی</div>
                {preview.isLoading && <p className="mt-2 text-xs text-indigo-500">در حال محاسبه سروری…</p>}
                {nextPreview && <><p className="mt-2 truncate text-sm font-bold text-slate-900">{nextPreview.canCreate ? nextPreview.title : 'برنامه‌ریزی مجموعه تکمیل شده است'}</p><p className={`mt-1 text-[11px] ${nextPreview.canCreate ? 'text-slate-600' : 'font-bold text-amber-700'}`}>{nextPreview.canCreate ? <>شروع {formatPersianDate(nextPreview.startDate)} · انتشار خودکار {formatPersianDate(nextPreview.publicationDate)} ساعت {nextPreview.publicationTime} · نسخه {nextPreview.revisionVersion}</> : nextPreview.limitReason}</p></>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button action="create" disabled={!nextPreview?.canCreate} loading={nextMutation.isPending} onClick={beginNext}><Plus className="h-4 w-4" />{selected.recurrenceType === 'manual' ? 'پروندهٔ محتوای دستی' : 'ایجاد و شخصی‌سازی پروندهٔ محتوا'}</Button>
                {selected.recurrenceType !== 'manual' && nextPreview?.canCreate && <><Input aria-label="تعداد پروندهٔ محتوای دسته‌ای" type="number" min={1} max={24} value={batchCount} onChange={event => setBatchCount(Math.max(1, Math.min(24, Number(event.target.value) || 1)))} className="w-20 text-center" /><Button variant="secondary" onClick={beginBatch}>پیش‌نمایش دسته</Button></>}
              </div>
            </div>
          </section>
        )}

        <nav className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5" aria-label="بخش‌های مجموعه">
          {tabs.map(item => { const Icon = item.icon; return <button key={item.id} onClick={() => setTab(item.id)} className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-[11px] font-bold ${tab === item.id ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}><Icon className="h-4 w-4" />{item.label}</button>; })}
        </nav>

        {tab === 'occurrences' && (
          <Panel title="پرونده‌های محتوای مستقل" subtitle="فیلتر و صفحه‌بندی در سرور انجام می‌شود.">
            <FilterBar>
              <Input value={occurrenceSearch} onChange={event => { setOccurrenceSearch(event.target.value); setOccurrencePage(1); }} placeholder="جستجو در عنوان یا کد…" className="min-w-52 flex-1" />
              <Select value={occurrenceStatus} onChange={event => { setOccurrenceStatus(event.target.value); setOccurrencePage(1); }}><option value="">همه وضعیت‌ها</option><option value="planning">برنامه‌ریزی</option><option value="producing">در حال تولید</option><option value="reviewing">در بررسی</option><option value="published">منتشرشده</option><option value="archived">بایگانی</option></Select>
              <Select value={activationFilter} onChange={event => { setActivationFilter(event.target.value); setOccurrencePage(1); }}><option value="">همه چرخه‌ها</option><option value="active">تسک‌ها فعال</option><option value="waiting">منتظر فعال‌سازی</option></Select>
            </FilterBar>
            {occurrences.isLoading && <LoadingState label="در حال دریافت پرونده‌های محتوا…" />}
            {occurrences.isError && <ErrorState error={occurrences.error} onRetry={() => occurrences.refetch()} />}
            {!occurrences.isLoading && !occurrences.isError && <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-100">{(occurrences.data?.data || []).map(content => <button key={content.id} onClick={() => { setSelectedContentId(content.id); setActiveView('content-detail'); }} className="flex w-full flex-col gap-3 bg-white p-4 text-right hover:bg-indigo-50/40 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-xs font-extrabold text-slate-900">{content.title}</p><span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[10px]">{content.code || 'بدون کد'}</span>{content.seriesRevisionId && <span className="text-[10px] text-indigo-600">نسخه #{content.seriesRevisionId}</span>}</div><p className="mt-1 text-[11px] font-bold text-indigo-700">پروندهٔ محتوای {content.seriesSequence?.toLocaleString('fa-IR') || '—'} از مجموعه «{selected.name}»</p><p className="mt-1 text-[11px] text-slate-500">دوره {content.periodKey} · مهلت {formatPersianDate(content.deadline)} · انتشار {formatPersianDate(content.publishInfo?.date)}{content.publishInfo?.time ? ` ساعت ${content.publishInfo.time}` : ''}</p><p className="mt-1 text-[10px] text-slate-400">{content.seriesActivatedAt ? 'تسک‌ها فعال شده‌اند' : `فعال‌سازی در ${formatPersianDate(content.plannedStartAt)}`}</p></div><span className="w-fit rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold">{content.status}</span></button>)}{!occurrences.data?.data.length && <EmptyState title="پروندهٔ محتوایی مطابق فیلتر پیدا نشد." />}</div>}
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
          <Panel title="تنظیمات نسخه جاری" subtitle="پرونده‌های محتوای قبلی snapshot خود را حفظ می‌کنند.">
            <div className="grid gap-4 md:grid-cols-2">
              <InfoCard icon={<FileStack />} title="فرایند"><InfoLine label="قالب" value={processTemplates.find(item => item.id === selected.processTemplateId)?.name || 'بدون قالب'} /><InfoLine label="تعداد مراحل" value={String(selected.defaultContentPayload?.stages?.length || 0)} /><InfoLine label="نوع محتوا" value={contentTypes.find(item => item.id === selected.contentType)?.name || selected.contentType} /><InfoLine label="هدف رسانه‌ای" value={selected.defaultContentPayload?.mediaGoal || '—'} /><InfoLine label="مخاطبان" value={selected.defaultContentPayload?.targetAudiences?.join('، ') || selected.defaultContentPayload?.targetAudience || '—'} /></InfoCard>
              <InfoCard icon={<Eye />} title="انتشار و نمایش"><InfoLine label="سطح نمایش" value={visibilityLabel(String(publication?.visibility || 'internal'))} /><InfoLine label="کانال‌ها" value={Array.isArray(publication?.channels) ? publication.channels.join('، ') || '—' : '—'} /><InfoLine label="وضعیت اولیه" value={String(publication?.status || 'planned')} /><InfoLine label="ناشر" value={users.find(user => user.id === String(publication?.publisherId || ''))?.name || 'بعداً تعیین می‌شود'} /><InfoLine label="ساعت انتشار" value={String(publication?.time || '۰۰:۰۰')} /></InfoCard>
              <InfoCard icon={<Link2 />} title="دارایی‌های مرجع"><div className="flex flex-wrap gap-2">{(selected.defaultContentPayload?.assetIds || []).map(id => <span key={id} className="rounded-lg border border-slate-200 px-2 py-1 text-[10px]">{assets.find(asset => asset.id === String(id))?.title || `دارایی ${id}`}</span>)}{!selected.defaultContentPayload?.assetIds?.length && <span className="text-xs text-slate-400">دارایی مرجعی انتخاب نشده است.</span>}</div></InfoCard>
              <InfoCard icon={<CalendarClock />} title="قاعده زمان‌بندی"><InfoLine label="تقویم" value={selected.recurrenceConfig.calendar === 'gregorian' ? 'میلادی' : 'جلالی سازمان'} /><InfoLine label="تاریخ شروع مجموعه" value={formatPersianDate(selected.recurrenceConfig.startDate)} /><InfoLine label="تاریخ پایان" value={formatPersianDate(selected.recurrenceConfig.endDate)} /><InfoLine label="تعداد برنامه" value={selected.recurrenceConfig.occurrenceLimit ? selected.recurrenceConfig.occurrenceLimit.toLocaleString('fa-IR') : 'بدون محدودیت'} /><InfoLine label="فاصله" value={String(selected.recurrenceConfig.interval || 1)} /></InfoCard>
            </div>
          </Panel>
        )}

        {tab === 'revisions' && (
          <Panel title="نسخه‌های تنظیمات" subtitle="هر نسخه از شماره پروندهٔ محتوا مشخصی مؤثر است.">
            {revisions.isLoading && <LoadingState label="در حال دریافت نسخه‌ها…" />}
            {revisions.isError && <ErrorState error={revisions.error} onRetry={() => revisions.refetch()} />}
            <div className="space-y-3">{(revisions.data?.data || []).map(revision => <div key={revision.id} className={`rounded-2xl border p-4 ${revision.id === selected.currentRevisionId ? 'border-indigo-200 bg-indigo-50/50' : 'border-slate-200'}`}><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-black">نسخه {revision.version.toLocaleString('fa-IR')} {revision.id === selected.currentRevisionId && <span className="text-indigo-600">· جاری</span>}</p><span className="text-[10px] text-slate-400">{formatPersianDate(revision.createdAt)}</span></div><p className="mt-2 text-[11px] text-slate-600">از پروندهٔ محتوا {revision.effectiveFromSequence.toLocaleString('fa-IR')} · {recurrenceLabels[revision.recurrenceType]} · {revision.author?.name || 'سامانه'}</p><p className="mt-1 text-[11px] text-slate-500">{revision.changeReason || 'بدون توضیح تغییر'}</p></div>)}</div>
            <Pagination meta={revisions.data?.meta} busy={revisions.isFetching} onPage={setRevisionPage} />
          </Panel>
        )}

        <SeriesForm open={formOpen} initial={editing} projectDefault={projectFilter} onClose={closeForm} onSaved={async () => { await invalidate(); }} />
        <OccurrenceCreateModal
          open={occurrenceOpen}
          series={selected}
          preview={nextPreview}
          draft={occurrenceDraft}
          setDraft={setOccurrenceDraft}
          users={users}
          departments={departments}
          processTemplates={processTemplates}
          busy={nextMutation.isPending}
          onClose={() => { setOccurrenceOpen(false); setOccurrenceDraft(null); }}
          onCreate={overrides => nextMutation.mutate({ series: selected, overrides })}
        />
        <ConfirmDialog open={archiveConfirmationOpen} onClose={() => setArchiveConfirmationOpen(false)} onConfirm={() => transition.mutate({ series: selected, command: 'archive' })} busy={transition.isPending} title={`مجموعه «${selected.name}» بایگانی شود؟ پرونده‌های محتوا، انتشارها، روابط و تاریخچه حذف نمی‌شوند.`} />
        <ConfirmDialog open={batchConfirmationOpen} onClose={() => setBatchConfirmationOpen(false)} onConfirm={() => batchMutation.mutate(selected)} busy={batchMutation.isPending || schedule.isLoading} confirmAction="create" title={`${(schedule.data?.data.length || batchCount).toLocaleString('fa-IR')} پروندهٔ محتوای مستقل از ${formatPersianDate(schedule.data?.data[0]?.startDate)} تا ${formatPersianDate(schedule.data?.data.at(-1)?.startDate)} ثبت شود؟`} />
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
        <div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-600 text-white"><Layers3 className="h-5 w-5" /></div><div><h1 className="text-xl font-black text-slate-900 sm:text-2xl">مجموعه‌های محتوا</h1><p className="mt-1 text-xs text-slate-600">برنامه‌ریزی تکرارشونده با پرونده‌های محتوای مستقل و نسخه‌های آینده</p></div></div>
        {hasPermission('content.create') && <Button action="create" onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="h-4 w-4" />مجموعه جدید</Button>}
      </header>
      <div className="grid gap-2 sm:grid-cols-3">
        <Metric label="کل مجموعه‌ها" value={totals?.total || 0} />
        <Metric label="مجموعه فعال" value={totals?.active || 0} />
        <Metric label="پرونده‌های محتوا" value={totals?.occurrences || 0} />
      </div>
      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-2xs" role="search" aria-label="جست‌وجو و فیلتر مجموعه‌های محتوا">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-52 flex-1 sm:max-w-sm"><Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input id="series-search" value={search} onChange={event => { setSearch(event.target.value); setListPage(1); }} placeholder="جست‌وجوی مجموعه…" className="w-full pr-9" /></div>
          <Button variant="secondary" aria-expanded={filtersOpen} aria-controls="series-filters" onClick={() => setFiltersOpen(value => !value)}><SlidersHorizontal className="h-4 w-4" />فیلترها{activeFilterCount > 0 && <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-[9px] text-indigo-700">{activeFilterCount.toLocaleString('fa-IR')}</span>}</Button>
          <div className="mr-auto flex rounded-xl border border-slate-200 bg-slate-50 p-1" role="group" aria-label="نمای فهرست مجموعه‌ها">
            <button type="button" aria-label="نمای فهرستی" aria-pressed={viewMode === 'list'} onClick={() => setViewMode('list')} className={`rounded-lg p-2 ${viewMode === 'list' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-500'}`}><List className="h-4 w-4" /></button>
            <button type="button" aria-label="نمای کارتی" aria-pressed={viewMode === 'grid'} onClick={() => setViewMode('grid')} className={`rounded-lg p-2 ${viewMode === 'grid' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-500'}`}><Grid3X3 className="h-4 w-4" /></button>
          </div>
        </div>
        {filtersOpen && <div id="series-filters" className="mt-3 border-t border-slate-100 pt-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <CompactFilter label="پروژه" htmlFor="series-project-filter"><Select id="series-project-filter" value={projectFilter} onChange={event => { const next = new URLSearchParams(params); event.target.value ? next.set('project', event.target.value) : next.delete('project'); setParams(next); setListPage(1); }}><option value="">همه پروژه‌ها</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</Select></CompactFilter>
            <CompactFilter label="مالک" htmlFor="series-owner-filter"><Select id="series-owner-filter" value={ownerFilter} onChange={event => { setOwnerFilter(event.target.value); setListPage(1); }}><option value="">همه مالکان</option>{users.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}</Select></CompactFilter>
            <CompactFilter label="وضعیت" htmlFor="series-status-filter"><Select id="series-status-filter" value={status} onChange={event => { setStatus(event.target.value); setListPage(1); }}><option value="">همه وضعیت‌ها</option><option value="active">فعال</option><option value="paused">متوقف</option><option value="archived">بایگانی</option></Select></CompactFilter>
            <CompactFilter label="تناوب" htmlFor="series-recurrence-filter"><Select id="series-recurrence-filter" value={recurrenceFilter} onChange={event => { setRecurrenceFilter(event.target.value); setListPage(1); }}><option value="">همه تناوب‌ها</option>{Object.entries(recurrenceLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</Select></CompactFilter>
            <CompactFilter label="نوع محتوا" htmlFor="series-type-filter"><Select id="series-type-filter" value={typeFilter} onChange={event => { setTypeFilter(event.target.value); setListPage(1); }}><option value="">همه انواع محتوا</option>{contentTypes.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}</Select></CompactFilter>
          </div>
          {activeFilterCount > 0 && <div className="mt-3 flex justify-end"><Button variant="ghost" className="text-[11px] text-slate-600" onClick={clearFilters}><X className="h-3.5 w-3.5" />پاک‌کردن همه</Button></div>}
        </div>}
      </section>
      {list.isLoading && <LoadingState label="در حال دریافت مجموعه‌ها…" />}
      {list.isError && <ErrorState error={list.error} onRetry={() => list.refetch()} title="فهرست مجموعه‌ها دریافت نشد." />}
      {!list.isLoading && !list.isError && viewMode === 'list' && <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="hidden grid-cols-[minmax(14rem,2fr)_1fr_8rem_6rem_7rem_16rem] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 text-[10px] font-bold text-slate-500 lg:grid"><span>مجموعه</span><span>دامنه</span><span>تناوب</span><span>پرونده</span><span>وضعیت</span><span>عملیات</span></div>
        {rows.map(row => <div key={row.id} className="grid gap-3 border-b border-slate-100 p-4 last:border-0 lg:grid-cols-[minmax(14rem,2fr)_1fr_8rem_6rem_7rem_16rem] lg:items-center">
          <button type="button" onClick={() => openDetail(row.id)} className="min-w-0 text-right"><p className="truncate text-xs font-black text-slate-900 hover:text-indigo-700">{row.name}</p><p className="mt-1 truncate text-[10px] text-slate-500">{row.codePrefix} · {row.description || 'بدون توضیح'}</p></button>
          <div className="text-[11px] text-slate-600"><p>{row.project?.name || projects.find(project => project.id === row.projectId)?.name || 'بدون پروژه'}</p><p className="mt-1 text-[10px] text-slate-400">{row.owner?.name || users.find(user => user.id === row.ownerId)?.name || '—'}</p></div>
          <div className="text-[11px] text-slate-600">{recurrenceLabels[row.recurrenceType]}<p className="mt-1 text-[10px] text-slate-400">نسخه {row.currentRevisionVersion || 1}</p></div>
          <span className="text-xs font-black text-slate-700">{row.occurrenceCount.toLocaleString('fa-IR')}</span><SeriesStatus status={row.status} />
          <SeriesRowActions row={row} busy={transition.isPending} onOpen={() => openDetail(row.id)} onEdit={() => { setEditing(row); setFormOpen(true); }} onArchive={() => setListArchiveTarget(row)} onTransition={command => transition.mutate({ series: row, command })} />
        </div>)}
        {!rows.length && <EmptyState title="مجموعه‌ای مطابق فیلترها پیدا نشد." />}
      </div>}
      {!list.isLoading && !list.isError && viewMode === 'grid' && <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map(row => <article key={row.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><button type="button" onClick={() => openDetail(row.id)} className="truncate text-right text-sm font-black text-slate-900 hover:text-indigo-700">{row.name}</button><p className="mt-1 truncate text-[10px] text-slate-500">{row.codePrefix} · {contentTypes.find(type => type.id === row.contentType)?.name || row.contentType}</p></div><SeriesStatus status={row.status} /></div>
          <p className="mt-3 line-clamp-2 min-h-10 text-[11px] leading-5 text-slate-600">{row.description || 'توضیحی برای این مجموعه ثبت نشده است.'}</p>
          <dl className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-[10px]"><div><dt className="text-slate-400">تناوب</dt><dd className="mt-1 font-bold text-slate-700">{recurrenceLabels[row.recurrenceType]}</dd></div><div><dt className="text-slate-400">پرونده‌های محتوا</dt><dd className="mt-1 font-black text-slate-800">{row.occurrenceCount.toLocaleString('fa-IR')}</dd></div></dl>
          <div className="mt-3"><SeriesRowActions row={row} busy={transition.isPending} onOpen={() => openDetail(row.id)} onEdit={() => { setEditing(row); setFormOpen(true); }} onArchive={() => setListArchiveTarget(row)} onTransition={command => transition.mutate({ series: row, command })} /></div>
        </article>)}
        {!rows.length && <div className="md:col-span-2 xl:col-span-3"><EmptyState title="مجموعه‌ای مطابق فیلترها پیدا نشد." /></div>}
      </div>}
      <Pagination meta={list.data?.meta} busy={list.isFetching} onPage={setListPage} />
      <SeriesForm open={formOpen} initial={editing} projectDefault={projectFilter} onClose={closeForm} onSaved={async series => { await invalidate(); openDetail(series.id); }} />
      <ConfirmDialog
        open={Boolean(listArchiveTarget)}
        onClose={() => setListArchiveTarget(null)}
        onConfirm={() => listArchiveTarget && transition.mutate({ series: listArchiveTarget, command: 'archive' })}
        busy={transition.isPending}
        title={listArchiveTarget ? `مجموعه «${listArchiveTarget.name}» بایگانی شود؟ پرونده‌های محتوا، روابط و تاریخچه حفظ می‌شوند.` : ''}
      />
    </PageShell>
  );
};

function SeriesRowActions({ row, busy, onOpen, onEdit, onArchive, onTransition }: {
  row: ContentSeries;
  busy: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onTransition: (command: 'pause' | 'resume' | 'restore') => void;
}) {
  return <div className="flex flex-wrap items-center gap-1.5">
    <Button variant="ghost" className="!min-h-8 !px-2.5 !py-1 text-[10px]" onClick={onOpen}><Eye className="h-3.5 w-3.5" />مشاهده</Button>
    {row.access?.edit && row.status !== 'archived' && <Button variant="secondary" className="!min-h-8 !px-2.5 !py-1 text-[10px]" onClick={onEdit}><Pencil className="h-3.5 w-3.5" />ویرایش</Button>}
    {row.access?.edit && row.status === 'active' && <Button variant="warning" className="!min-h-8 !px-2.5 !py-1 text-[10px]" loading={busy} onClick={() => onTransition('pause')}><Pause className="h-3.5 w-3.5" />توقف</Button>}
    {row.access?.edit && row.status === 'paused' && <Button className="!min-h-8 !px-2.5 !py-1 text-[10px]" loading={busy} onClick={() => onTransition('resume')}><Play className="h-3.5 w-3.5" />ادامه</Button>}
    {row.access?.archive && row.status !== 'archived' && <Button variant="danger" className="!min-h-8 !px-2.5 !py-1 text-[10px]" disabled={busy} onClick={onArchive}><Archive className="h-3.5 w-3.5" />بایگانی</Button>}
    {row.access?.edit && row.status === 'archived' && <Button variant="secondary" className="!min-h-8 !px-2.5 !py-1 text-[10px]" loading={busy} onClick={() => onTransition('restore')}><RotateCcw className="h-3.5 w-3.5" />بازگردانی</Button>}
  </div>;
}

function OccurrenceCreateModal({
  open, series, preview, draft, setDraft, users, departments, processTemplates, busy, onClose, onCreate,
}: {
  open: boolean;
  series: ContentSeries;
  preview?: SeriesPeriodPreview;
  draft: OccurrenceDraft | null;
  setDraft: React.Dispatch<React.SetStateAction<OccurrenceDraft | null>>;
  users: User[];
  departments: Department[];
  processTemplates: ContentProcessTemplate[];
  busy: boolean;
  onClose: () => void;
  onCreate: (overrides: Omit<NextOccurrenceInput, 'periodKey' | 'requestKey' | 'lockVersion'>) => void;
}) {
  if (!draft) return null;
  const templates = processTemplates.filter(template => template.type === series.contentType);
  const selectedTemplate = templates.find(template => template.id === draft.processTemplateId);
  const stages = (draft.processTemplateId === (series.processTemplateId || '')
    ? series.defaultContentPayload?.stages || []
    : selectedTemplate?.stages || []).map((stage, index) => ({
      ...stage,
      id: 'id' in stage ? stage.id : `template-${stage.stageKey}-${index}`,
      assigneeId: 'assigneeId' in stage ? stage.assigneeId : undefined,
      reviewerId: 'reviewerId' in stage ? stage.reviewerId : undefined,
    }));
  const membersForDepartment = (departmentId: string) => {
    const department = departments.find(item => item.id === departmentId);
    const memberIds = new Set([
      ...(department?.members || []).map(member => member.userId),
      ...(department?.managerId ? [department.managerId] : []),
    ]);
    return users.filter(user => user.status === 'active'
      && (user.departmentId === departmentId || memberIds.has(user.id)));
  };
  const selectTemplate = (processTemplateId: string) => {
    const nextTemplate = templates.find(template => template.id === processTemplateId);
    const nextStages = processTemplateId === (series.processTemplateId || '')
      ? series.defaultContentPayload?.stages || []
      : nextTemplate?.stages || [];
    setDraft(previous => previous ? {
      ...previous,
      processTemplateId,
      assignments: Object.fromEntries(nextStages.map(stage => [
        stage.stageKey || ('id' in stage ? stage.id : ''),
        {
          assigneeId: 'assigneeId' in stage ? stage.assigneeId || '' : '',
          reviewerId: 'reviewerId' in stage ? stage.reviewerId || '' : '',
        },
      ])),
    } : previous);
  };
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!preview || !draft.publicationDate || !draft.publicationTime) return;
    if (series.recurrenceType === 'manual' && (!draft.title.trim() || !draft.startDate || !draft.deadline)) return;
    const stageAssignments = stages.map(stage => {
      const key = stage.stageKey || stage.id;
      const assignment = draft.assignments[key] || { assigneeId: '', reviewerId: '' };
      return {
        stageKey: key,
        assigneeId: assignment.assigneeId || null,
        reviewerId: stage.reviewRequired === false ? null : assignment.reviewerId || null,
      };
    });
    onCreate({
      ...(series.recurrenceType === 'manual' ? {
        title: draft.title.trim(), startDate: draft.startDate, deadline: draft.deadline,
      } : {}),
      ...(draft.processTemplateId !== (series.processTemplateId || '')
        ? { processTemplateId: draft.processTemplateId || null }
        : {}),
      stageAssignments,
      publicationDate: draft.publicationDate,
      publicationTime: draft.publicationTime,
      caption: draft.caption,
    });
  };

  return <Modal open={open} onClose={onClose} title="ایجاد پروندهٔ محتوای مستقل مجموعه" description={`این Content به «${series.name}» پیوند می‌خورد، اما جریان کار، مسئولیت‌ها و انتشار مستقل دارد.`} icon={<Clock3 className="h-5 w-5" />} busy={busy} size="lg">
    <form onSubmit={submit} className="space-y-5 p-5 sm:p-6">
      <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4 text-[11px] leading-6 text-indigo-800">
        پروندهٔ محتوا شماره {preview?.sequence.toLocaleString('fa-IR') || '—'} · کد پیشنهادی {preview?.proposedCode || 'خودکار'} · نسخه مجموعه {preview?.revisionVersion.toLocaleString('fa-IR') || '—'}
      </div>
      {series.recurrenceType === 'manual' && <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><FormField required label="عنوان پروندهٔ محتوا" htmlFor="occurrence-title"><Input id="occurrence-title" required value={draft.title} onChange={event => setDraft(previous => previous ? { ...previous, title: event.target.value } : previous)} /></FormField></div>
        <PersianDatePicker label="تاریخ پروندهٔ محتوا" required value={draft.startDate} onChange={startDate => setDraft(previous => previous ? { ...previous, startDate, publicationDate: previous.publicationDate === previous.startDate ? startDate : previous.publicationDate } : previous)} portal />
        <PersianDatePicker label="مهلت پروندهٔ محتوا" required value={draft.deadline} onChange={deadline => setDraft(previous => previous ? { ...previous, deadline } : previous)} portal />
      </div>}
      <section className="space-y-3 rounded-2xl border border-slate-200 p-4">
        <div><h3 className="text-sm font-black text-slate-900">جریان کار این پروندهٔ محتوا</h3><p className="mt-1 text-[10px] text-slate-500">قالب مجموعه حفظ می‌شود مگر آن‌که فقط برای این پروندهٔ محتوا قالب دیگری انتخاب کنید.</p></div>
        <FormField label="قالب جریان محتوا" htmlFor="occurrence-template"><Select id="occurrence-template" value={draft.processTemplateId} onChange={event => selectTemplate(event.target.value)}><option value="">بدون قالب جریان</option>{templates.map(template => <option key={template.id} value={template.id}>{template.name}{template.id === series.processTemplateId ? ' (پیش‌فرض مجموعه)' : ''}</option>)}</Select></FormField>
        <ol className="space-y-2">{stages.map((stage, index) => {
          const key = stage.stageKey || stage.id;
          const assignment = draft.assignments[key] || { assigneeId: '', reviewerId: '' };
          const candidates = membersForDepartment(stage.departmentId || '');
          return <li key={`${key}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="mb-3 flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-[10px] font-black text-white">{(index + 1).toLocaleString('fa-IR')}</span><div><p className="text-xs font-black text-slate-900">{stage.title}</p><p className="mt-0.5 text-[10px] text-slate-500">{departments.find(item => item.id === stage.departmentId)?.name || stage.departmentName || 'بدون دپارتمان'}</p></div></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-[10px] font-bold text-slate-600">مسئول اجرا<Select className="mt-1.5" value={assignment.assigneeId} onChange={event => setDraft(previous => previous ? { ...previous, assignments: { ...previous.assignments, [key]: { ...assignment, assigneeId: event.target.value } } } : previous)}><option value="">بدون مسئول مستقیم</option>{candidates.map(user => <option key={user.id} value={user.id}>{user.name}{user.title ? ` — ${user.title}` : ''}</option>)}</Select></label>
              <label className="text-[10px] font-bold text-slate-600">ارزیاب<Select className="mt-1.5" disabled={stage.reviewRequired === false} value={stage.reviewRequired === false ? '' : assignment.reviewerId} onChange={event => setDraft(previous => previous ? { ...previous, assignments: { ...previous.assignments, [key]: { ...assignment, reviewerId: event.target.value } } } : previous)}><option value="">{stage.reviewRequired === false ? 'این مرحله ارزیابی ندارد' : 'بر پایه سیاست قالب'}</option>{candidates.map(user => <option key={user.id} value={user.id}>{user.name}{user.title ? ` — ${user.title}` : ''}</option>)}</Select></label>
            </div>
          </li>;
        })}</ol>
        {!stages.length && <p className="rounded-xl border border-dashed border-slate-300 p-3 text-center text-[11px] text-slate-500">این پروندهٔ محتوا بدون مراحل قالب ساخته می‌شود.</p>}
      </section>
      <section className="space-y-4 rounded-2xl border border-slate-200 p-4">
        <div><h3 className="text-sm font-black text-slate-900">انتشار این پروندهٔ محتوا</h3><p className="mt-1 text-[10px] text-slate-500">تاریخ به‌طور خودکار از تاریخ پروندهٔ محتوا و ساعت از پیش‌فرض مجموعه آمده و هر دو قابل تغییرند.</p></div>
        <div className="grid gap-4 sm:grid-cols-2"><PersianDatePicker label="تاریخ انتشار" required value={draft.publicationDate} onChange={publicationDate => setDraft(previous => previous ? { ...previous, publicationDate } : previous)} portal /><FormField required label="ساعت انتشار" htmlFor="occurrence-publication-time"><Input id="occurrence-publication-time" required type="time" value={draft.publicationTime} onChange={event => setDraft(previous => previous ? { ...previous, publicationTime: event.target.value } : previous)} /></FormField></div>
        <FormField label="کپشن این پروندهٔ محتوا" htmlFor="occurrence-caption"><Textarea id="occurrence-caption" rows={4} maxLength={5000} value={draft.caption} onChange={event => setDraft(previous => previous ? { ...previous, caption: event.target.value } : previous)} /></FormField>
      </section>
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><Button action="cancel" type="button" variant="secondary" onClick={onClose}>انصراف</Button><Button action="create" type="submit" loading={busy} disabled={!preview?.canCreate}>ایجاد پروندهٔ محتوای مستقل</Button></div>
    </form>
  </Modal>;
}

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
