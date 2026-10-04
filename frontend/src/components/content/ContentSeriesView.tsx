import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  Archive,
  Building2,
  CalendarClock,
  Hash,
  Layers3,
  ListChecks,
  Pause,
  Pencil,
  Play,
  Plus,
  Search,
  UserRound,
} from 'lucide-react';
import { seriesApi, type SeriesInput } from '../../api/series';
import { parseApiError } from '../../api/errors';
import { useApp } from '../../context/AppContext';
import type {
  ContentProcessTemplate,
  ContentSeries,
  Department,
  Project,
  SeriesRecurrenceType,
  User,
} from '../../types';
import { formatPersianDate } from '../../utils/date';
import {
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  FormField,
  Input,
  LoadingState,
  Modal,
  Select,
  Textarea,
} from '../common/Primitives';
import { FilterBar, Pagination } from '../common/WorkspacePatterns';
import { PersianDatePicker } from '../common/PersianDatePicker';

const recurrenceLabels: Record<SeriesRecurrenceType, string> = {
  weekly: 'هفتگی',
  monthly: 'ماهانه',
  project_based: 'بر پایه پروژه',
  manual: 'دستی',
};

const statusLabels: Record<string, string> = {
  active: 'فعال',
  paused: 'متوقف',
  archived: 'بایگانی',
};

const statusClasses: Record<string, string> = {
  active: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  paused: 'border-amber-200 bg-amber-50 text-amber-700',
  archived: 'border-slate-200 bg-slate-100 text-slate-600',
};

type SeriesFormProps = {
  open: boolean;
  initial: ContentSeries | null;
  projectDefault: string;
  projects: Project[];
  departments: Department[];
  users: User[];
  contentTypes: Array<{ id: string; name: string }>;
  processTemplates: ContentProcessTemplate[];
  onClose: () => void;
  onSaved: () => Promise<void>;
  notify: ReturnType<typeof useApp>['notify'];
};

export const ContentSeriesView: React.FC = () => {
  const {
    projects,
    departments,
    users,
    contentTypes,
    processTemplates,
    hasPermission,
    notify,
    setSelectedContentId,
    setActiveView,
  } = useApp();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('series');
  const projectFilter = params.get('project') || '';
  const [search, setSearch] = useState('');
  const [listPage, setListPage] = useState(1);
  const [status, setStatus] = useState('');
  const [occurrencePage, setOccurrencePage] = useState(1);
  const [editing, setEditing] = useState<ContentSeries | null>(null);
  const [formOpen, setFormOpen] = useState(params.get('create') === '1');
  const [nextConfirmationOpen, setNextConfirmationOpen] = useState(false);
  const [archiveConfirmationOpen, setArchiveConfirmationOpen] = useState(false);
  const [batchCount, setBatchCount] = useState(3);
  const queryClient = useQueryClient();

  const list = useQuery({
    queryKey: ['content-series', projectFilter, search, status, listPage],
    queryFn: () => seriesApi.list({ project_id: projectFilter, search, status, page: listPage, per_page: 20 }),
  });
  const detail = useQuery({
    queryKey: ['content-series', selectedId],
    queryFn: () => seriesApi.get(selectedId!),
    enabled: Boolean(selectedId),
  });
  const occurrences = useQuery({
    queryKey: ['content-series', selectedId, 'occurrences', occurrencePage],
    queryFn: () => seriesApi.occurrences(selectedId!, { page: occurrencePage, per_page: 20 }),
    enabled: Boolean(selectedId),
  });
  const summary = useQuery({
    queryKey: ['content-series', selectedId, 'summary'],
    queryFn: () => seriesApi.summary(selectedId!),
    enabled: Boolean(selectedId),
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['content-series'] });
  };
  const archiveMutation = useMutation({
    mutationFn: (id: string) => seriesApi.archive(id),
    onSuccess: async () => {
      notify({ type: 'success', title: 'مجموعه بایگانی شد', message: 'رخدادها و تاریخچه مجموعه حفظ شدند.' });
      const next = new URLSearchParams(params);
      next.delete('series');
      setParams(next);
      setArchiveConfirmationOpen(false);
      await invalidate();
    },
    onError: error => notify({ type: 'error', title: parseApiError(error).message }),
  });
  const statusMutation = useMutation({
    mutationFn: ({ id, status: nextStatus }: { id: string; status: 'active' | 'paused' }) => seriesApi.update(id, { status: nextStatus }),
    onSuccess: async () => {
      notify({ type: 'success', title: 'وضعیت مجموعه تغییر کرد' });
      await invalidate();
    },
    onError: error => notify({ type: 'error', title: parseApiError(error).message }),
  });
  const nextMutation = useMutation({
    mutationFn: async () => {
      const preview = await seriesApi.preview(selectedId!);
      return seriesApi.createNext(selectedId!, preview.data.periodKey);
    },
    onSuccess: async result => {
      notify({ type: 'success', title: 'رخداد جدید ساخته شد', message: `«${result.data.title}» به‌صورت یک Content مستقل ایجاد شد.` });
      setNextConfirmationOpen(false);
      await invalidate();
    },
    onError: error => notify({ type: 'error', title: parseApiError(error).message }),
  });
  const batchMutation = useMutation({
    mutationFn: () => seriesApi.batch(selectedId!, batchCount, crypto.randomUUID()),
    onSuccess: async result => {
      notify({ type: 'success', title: 'برنامه‌ریزی دسته‌ای انجام شد', message: `${result.data.length.toLocaleString('fa-IR')} دوره مستقل ثبت شد.` });
      await invalidate();
    },
    onError: error => notify({ type: 'error', title: parseApiError(error).message }),
  });

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
    const next = new URLSearchParams(params);
    next.delete('create');
    setParams(next);
  };

  const openDetail = (id: string) => {
    setOccurrencePage(1);
    const next = new URLSearchParams(params);
    next.set('series', id);
    setParams(next);
  };

  const selected = detail.data?.data;
  if (selectedId) {
    if (detail.isLoading) {
      return <PageShell><LoadingState label="در حال دریافت جزئیات مجموعه…" /></PageShell>;
    }
    if (detail.isError || !selected) {
      return <PageShell><ErrorState error={detail.error} onRetry={() => detail.refetch()} title="جزئیات مجموعه دریافت نشد." /></PageShell>;
    }

    const preview = summary.data?.data.next;
    return (
      <PageShell>
        <Button
          variant="ghost"
          onClick={() => {
            const next = new URLSearchParams(params);
            next.delete('series');
            setParams(next);
          }}
          className="w-fit text-slate-600"
        >
          بازگشت به مجموعه‌ها
        </Button>

        <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-2xs">
          <div className="h-1.5 bg-gradient-to-l from-indigo-600 via-violet-500 to-purple-400" />
          <div className="p-5 sm:p-7">
            <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <SeriesStatus status={selected.status} />
                  <span className="rounded-lg border border-indigo-100 bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-700">
                    {recurrenceLabels[selected.recurrenceType]}
                  </span>
                  <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">
                    {selected.contentType}
                  </span>
                </div>
                <h1 className="mt-3 text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">{selected.name}</h1>
                <p className="mt-2 max-w-3xl text-xs leading-6 text-slate-600">{selected.description || 'برای این مجموعه توضیحی ثبت نشده است.'}</p>
                <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[11px] font-semibold text-slate-500">
                  <Meta icon={<Layers3 />} label="پروژه" value={projects.find(project => project.id === selected.projectId)?.name || 'بدون پروژه'} />
                  <Meta icon={<UserRound />} label="مالک" value={users.find(user => user.id === selected.ownerId)?.name || 'تعیین نشده'} />
                  <Meta icon={<Building2 />} label="دپارتمان" value={departments.find(department => department.id === selected.departmentId)?.name || 'تعیین نشده'} />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {selected.access?.edit && selected.status !== 'archived' && (
                  <Button
                    variant="warning"
                    loading={statusMutation.isPending}
                    onClick={() => statusMutation.mutate({ id: selected.id, status: selected.status === 'active' ? 'paused' : 'active' })}
                  >
                    {selected.status === 'active' ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    {selected.status === 'active' ? 'توقف مجموعه' : 'فعال‌سازی'}
                  </Button>
                )}
                {selected.access?.edit && (
                  <Button variant="secondary" onClick={() => { setEditing(selected); setFormOpen(true); }}>
                    <Pencil className="h-4 w-4" />ویرایش
                  </Button>
                )}
                {selected.access?.archive && selected.status !== 'archived' && (
                  <Button variant="danger" onClick={() => setArchiveConfirmationOpen(true)}>
                    <Archive className="h-4 w-4" />بایگانی
                  </Button>
                )}
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3 border-t border-slate-100 pt-5 sm:grid-cols-3 lg:grid-cols-6">
              <Metric label="آخرین کد" value={summary.data?.data.latestCode || '—'} icon={<Hash />} />
              <Metric label="شماره بعدی" value={selected.nextSequenceNumber} icon={<ListChecks />} />
              <Metric label="منتشرشده" value={summary.data?.data.published || 0} />
              <Metric label="منتظر بررسی" value={summary.data?.data.waitingReview || 0} />
              <Metric label="عقب‌افتاده" value={summary.data?.data.overdue || 0} tone="danger" />
              <Metric label="برنامه‌ریزی‌شده" value={summary.data?.data.planned || 0} />
            </div>
          </div>
        </section>

        {summary.isError && <ErrorState error={summary.error} onRetry={() => summary.refetch()} title="خلاصه عملیاتی مجموعه دریافت نشد." />}

        {selected.status === 'active' && selected.access?.edit && preview && (
          <section className="rounded-3xl border border-indigo-200 bg-indigo-50/60 p-5 shadow-2xs">
            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-indigo-700">
                  <CalendarClock className="h-5 w-5" />
                  <h2 className="text-sm font-extrabold">رخداد بعدی</h2>
                </div>
                <p className="mt-2 text-sm font-bold text-slate-800">{preview.title}</p>
                <p className="mt-1 text-[11px] leading-5 text-slate-600">
                  شروع {formatPersianDate(preview.startDate)} · مهلت {formatPersianDate(preview.deadline)} · دوره {preview.periodKey}
                </p>
                <p className="mt-1 text-[11px] text-indigo-700">
                  کد قبلی: {preview.previous?.code || '—'} · کد پیشنهادی: {preview.proposedCode || 'تخصیص خودکار هنگام ثبت'}
                </p>
              </div>
              <div className="flex flex-wrap items-stretch gap-2">
                <Button loading={nextMutation.isPending} onClick={() => setNextConfirmationOpen(true)}>
                  <Play className="h-4 w-4" />ایجاد رخداد بعدی
                </Button>
                <div className="flex overflow-hidden rounded-xl border border-indigo-200 bg-white">
                  <Input
                    aria-label="تعداد دوره برای برنامه‌ریزی دسته‌ای"
                    type="number"
                    min={1}
                    max={52}
                    value={batchCount}
                    onChange={event => setBatchCount(Math.max(1, Math.min(52, Number(event.target.value) || 1)))}
                    className="w-20 rounded-none border-0 text-center"
                  />
                  <Button
                    variant="secondary"
                    loading={batchMutation.isPending}
                    onClick={() => batchMutation.mutate()}
                    className="rounded-none border-0 border-r border-indigo-100"
                  >
                    برنامه‌ریزی دسته‌ای
                  </Button>
                </div>
              </div>
            </div>
            <p className="mt-3 border-t border-indigo-100 pt-3 text-[11px] leading-5 text-slate-500">
              هر دوره یک Content مستقل است؛ تسک‌های دوره‌های آینده تا تاریخ فعال‌سازی ساخته نمی‌شوند.
            </p>
          </section>
        )}

        <section className="rounded-3xl border border-slate-200/80 bg-white p-4 shadow-2xs sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-extrabold text-slate-900">خط زمانی رخدادها</h2>
              <p className="mt-1 text-[11px] text-slate-500">جریان کار و دارایی هر ردیف مستقل از دوره‌های دیگر است.</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-600">
              {(summary.data?.data.total || 0).toLocaleString('fa-IR')} رخداد
            </span>
          </div>
          {occurrences.isLoading && <LoadingState label="در حال دریافت رخدادها…" />}
          {occurrences.isError && <ErrorState error={occurrences.error} onRetry={() => occurrences.refetch()} />}
          {!occurrences.isLoading && !occurrences.isError && (
            <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-100">
              {(occurrences.data?.data || []).map(content => (
                <button
                  key={content.id}
                  onClick={() => { setSelectedContentId(content.id); setActiveView('content-detail'); }}
                  className="flex w-full flex-col gap-3 bg-white p-4 text-right transition-colors hover:bg-indigo-50/40 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-xs font-extrabold text-slate-900">{content.title}</p>
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[10px] text-slate-600">{content.code || 'بدون کد'}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">
                      دوره {content.periodKey} · مهلت {formatPersianDate(content.deadline)} · انتشار {formatPersianDate(content.publishInfo?.date)}
                    </p>
                    <p className="mt-1 text-[10px] text-slate-400">
                      مالک: {users.find(user => user.id === content.ownerId)?.name || '—'} · مرحله جاری: {content.stages?.find(stage => !['approved', 'completed', 'skipped'].includes(stage.status))?.title || 'پایان جریان'}
                    </p>
                  </div>
                  <span className="w-fit rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold text-slate-600">{content.status}</span>
                </button>
              ))}
              {!occurrences.data?.data.length && <EmptyState title="هنوز رخدادی برای این مجموعه ساخته نشده است." />}
            </div>
          )}
          <Pagination meta={occurrences.data?.meta} busy={occurrences.isFetching} onPage={setOccurrencePage} />
        </section>

        <SeriesForm
          open={formOpen}
          initial={editing}
          projectDefault={projectFilter}
          projects={projects}
          departments={departments}
          users={users}
          contentTypes={contentTypes}
          processTemplates={processTemplates}
          onClose={closeForm}
          onSaved={invalidate}
          notify={notify}
        />
        <ConfirmDialog
          open={nextConfirmationOpen}
          onClose={() => setNextConfirmationOpen(false)}
          onConfirm={() => nextMutation.mutate()}
          busy={nextMutation.isPending}
          title={`رخداد «${preview?.title || 'بعدی'}» با دوره ${preview?.periodKey || 'جدید'} ایجاد شود؟`}
        />
        <ConfirmDialog
          open={archiveConfirmationOpen}
          onClose={() => setArchiveConfirmationOpen(false)}
          onConfirm={() => archiveMutation.mutate(selected.id)}
          busy={archiveMutation.isPending}
          title={`مجموعه «${selected.name}» بایگانی شود؟ رخدادها و تاریخچه حذف نمی‌شوند.`}
        />
      </PageShell>
    );
  }

  const rows = list.data?.data || [];
  return (
    <PageShell>
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-md shadow-indigo-200">
            <Layers3 className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">مجموعه‌های محتوا</h1>
            <p className="mt-1 text-xs text-slate-600 sm:text-sm">مدیریت تولیدات تکرارشونده با پرونده، فرایند و مهلت مستقل برای هر دوره</p>
          </div>
        </div>
        {hasPermission('content.create') && (
          <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus className="h-4 w-4" />ایجاد مجموعه جدید
          </Button>
        )}
      </header>

      <FilterBar>
        <div className="min-w-52 flex-1">
          <label htmlFor="series-search" className="sr-only">جستجوی مجموعه</label>
          <div className="relative">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              id="series-search"
              value={search}
              onChange={event => { setSearch(event.target.value); setListPage(1); }}
              placeholder="جستجو در نام یا توضیحات…"
              className="pr-9"
            />
          </div>
        </div>
        <Select
          aria-label="فیلتر پروژه مجموعه"
          value={projectFilter}
          onChange={event => {
            const next = new URLSearchParams(params);
            event.target.value ? next.set('project', event.target.value) : next.delete('project');
            setListPage(1);
            setParams(next);
          }}
          className="min-w-44"
        >
          <option value="">همه پروژه‌ها</option>
          {projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
        </Select>
        <Select
          aria-label="فیلتر وضعیت مجموعه"
          value={status}
          onChange={event => { setStatus(event.target.value); setListPage(1); }}
          className="min-w-40"
        >
          <option value="">فعال و متوقف</option>
          <option value="active">فعال</option>
          <option value="paused">متوقف</option>
          <option value="archived">بایگانی</option>
        </Select>
      </FilterBar>

      {list.isLoading && <LoadingState label="در حال دریافت مجموعه‌ها…" />}
      {list.isError && <ErrorState error={list.error} onRetry={() => list.refetch()} title="فهرست مجموعه‌ها دریافت نشد." />}
      {!list.isLoading && !list.isError && (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {rows.map(row => (
            <button
              key={row.id}
              onClick={() => openDetail(row.id)}
              className="group relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-5 text-right shadow-2xs transition-all hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-lg"
            >
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-indigo-600 to-violet-400 opacity-80" />
              <div className="flex items-start justify-between gap-3">
                <SeriesStatus status={row.status} />
                <Layers3 className="h-5 w-5 text-indigo-400 transition-transform group-hover:scale-110" />
              </div>
              <h2 className="mt-4 line-clamp-1 text-sm font-extrabold text-slate-900">{row.name}</h2>
              <p className="mt-2 line-clamp-2 min-h-10 text-xs leading-5 text-slate-500">{row.description || 'برای این مجموعه توضیحی ثبت نشده است.'}</p>
              <div className="mt-4 space-y-1.5 text-[10px] text-slate-500">
                <p>پروژه: <b className="text-slate-700">{projects.find(project => project.id === row.projectId)?.name || 'بدون پروژه'}</b></p>
                <p>مالک: {users.find(user => user.id === row.ownerId)?.name || '—'} · دپارتمان: {departments.find(department => department.id === row.departmentId)?.name || '—'}</p>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-[11px] font-semibold text-slate-500">
                <span>{recurrenceLabels[row.recurrenceType]} · {row.latestOccurrence?.code || 'بدون رخداد'}</span>
                <span>{(row.occurrenceCount || 0).toLocaleString('fa-IR')} رخداد</span>
              </div>
            </button>
          ))}
          {!rows.length && (
            <div className="col-span-full rounded-3xl border border-dashed border-slate-300 bg-white py-14">
              <EmptyState title="مجموعه‌ای مطابق با فیلترها پیدا نشد." />
            </div>
          )}
        </div>
      )}
      <Pagination meta={list.data?.meta} busy={list.isFetching} onPage={setListPage} />

      <SeriesForm
        open={formOpen}
        initial={editing}
        projectDefault={projectFilter}
        projects={projects}
        departments={departments}
        users={users}
        contentTypes={contentTypes}
        processTemplates={processTemplates}
        onClose={closeForm}
        onSaved={invalidate}
        notify={notify}
      />
    </PageShell>
  );
};

function SeriesForm({
  open,
  initial,
  projectDefault,
  projects,
  departments,
  users,
  contentTypes,
  processTemplates,
  onClose,
  onSaved,
  notify,
}: SeriesFormProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [contentType, setContentType] = useState('');
  const [projectId, setProjectId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [recurrence, setRecurrence] = useState<SeriesRecurrenceType>('weekly');
  const [startDate, setStartDate] = useState('');
  const [interval, setInterval] = useState(1);
  const [offset, setOffset] = useState(7);
  const [codePrefix, setCodePrefix] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(initial?.name || '');
    setDescription(initial?.description || '');
    setContentType(initial?.contentType || contentTypes[0]?.id || '');
    setProjectId(initial?.projectId || projectDefault);
    setDepartmentId(initial?.departmentId || '');
    setOwnerId(initial?.ownerId || '');
    setTemplateId(initial?.processTemplateId || processTemplates[0]?.id || '');
    setRecurrence(initial?.recurrenceType || 'weekly');
    setStartDate(initial?.recurrenceConfig.startDate || new Date().toISOString().slice(0, 10));
    setInterval(initial?.recurrenceConfig.interval || 1);
    setOffset(initial?.recurrenceConfig.deadlineOffsetDays || 7);
    setCodePrefix(initial?.codePrefix || '');
  }, [open, initial, projectDefault, contentTypes, processTemplates]);

  useEffect(() => {
    if (recurrence === 'project_based' && !projectId) setRecurrence('manual');
  }, [projectId, recurrence]);

  const mutation = useMutation({
    mutationFn: async () => {
      const template = processTemplates.find(item => item.id === templateId);
      const stages = template?.stages.map((stage, index) => ({
        id: `series-${stage.stageKey}-${index}`,
        stageKey: stage.stageKey,
        title: stage.title,
        description: stage.description,
        departmentId: stage.departmentId,
        departmentName: stage.departmentName,
        assigneeRole: stage.defaultRole,
        order: stage.order,
        status: index === 0 ? 'not_started' : 'pending_dependency',
        reviewRequired: stage.reviewRequired,
        advanceMode: stage.advanceMode,
        reviewerStrategy: stage.reviewerStrategy,
        relativeDueDays: stage.relativeDueDays ?? stage.daysFromStart,
        checklist: stage.checklist || [],
        inputs: stage.inputs,
        outputs: (stage.outputs || []).map(output => ({ ...output, isDelivered: false })),
      })) || [];
      const body: SeriesInput = {
        name: name.trim(),
        description: description.trim(),
        contentType,
        projectId: projectId || null,
        departmentId: departmentId || null,
        ownerId: ownerId || null,
        processTemplateId: templateId || null,
        codePrefix: codePrefix || null,
        recurrenceType: recurrence,
        recurrenceConfig: { startDate, interval, deadlineOffsetDays: offset },
        defaultContentPayload: {
          stages: stages as never,
          tags: ['مجموعه محتوا'],
          assetIds: [],
          publishInfo: { channels: ['website'], status: 'planned' } as never,
        },
      };
      return initial ? seriesApi.update(initial.id, body) : seriesApi.create(body);
    },
    onSuccess: async () => {
      notify({ type: 'success', title: initial ? 'مجموعه ویرایش شد' : 'مجموعه ایجاد شد' });
      await onSaved();
      onClose();
    },
    onError: error => notify({ type: 'error', title: parseApiError(error).message }),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? 'ویرایش مجموعه محتوا' : 'ایجاد مجموعه محتوای جدید'}
      description="قالب فرایند در زمان ذخیره به‌عنوان snapshot مجموعه ثبت می‌شود."
      icon={<Layers3 className="h-5 w-5" />}
      busy={mutation.isPending}
      size="lg"
    >
      <form onSubmit={event => { event.preventDefault(); mutation.mutate(); }} className="space-y-5 p-5 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="نام مجموعه" htmlFor="series-name">
            <Input id="series-name" required value={name} onChange={event => setName(event.target.value)} />
          </FormField>
          <FormField label="پیشوند کد" htmlFor="series-prefix">
            <Input id="series-prefix" value={codePrefix} onChange={event => setCodePrefix(event.target.value)} dir="ltr" placeholder="مثلاً RV" />
          </FormField>
          <FormField label="نوع محتوا" htmlFor="series-content-type">
            <Select id="series-content-type" required value={contentType} onChange={event => setContentType(event.target.value)}>
              {contentTypes.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}
            </Select>
          </FormField>
          <FormField label="قالب فرایند" htmlFor="series-template">
            <Select id="series-template" value={templateId} onChange={event => setTemplateId(event.target.value)}>
              <option value="">بدون قالب</option>
              {processTemplates.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}
            </Select>
          </FormField>
          <FormField label="پروژه" htmlFor="series-project">
            <Select
              id="series-project"
              disabled={Boolean(initial?.occurrenceCount)}
              value={projectId}
              onChange={event => setProjectId(event.target.value)}
              className="disabled:bg-slate-100"
            >
              <option value="">بدون پروژه</option>
              {projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
            </Select>
          </FormField>
          <FormField label="دپارتمان" htmlFor="series-department">
            <Select id="series-department" value={departmentId} onChange={event => setDepartmentId(event.target.value)}>
              <option value="">بدون دپارتمان</option>
              {departments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}
            </Select>
          </FormField>
          <FormField label="مالک" htmlFor="series-owner">
            <Select id="series-owner" value={ownerId} onChange={event => setOwnerId(event.target.value)}>
              <option value="">کاربر جاری</option>
              {users.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}
            </Select>
          </FormField>
          <FormField label="نوع تناوب" htmlFor="series-recurrence">
            <Select id="series-recurrence" value={recurrence} onChange={event => setRecurrence(event.target.value as SeriesRecurrenceType)}>
              <option value="weekly">هفتگی</option>
              <option value="monthly">ماهانه</option>
              <option value="project_based" disabled={!projectId}>بر پایه پروژه</option>
              <option value="manual">دستی</option>
            </Select>
          </FormField>
          <div>
            <PersianDatePicker label="تاریخ شروع" required value={startDate} onChange={setStartDate} portal />
          </div>
          <FormField label="فاصله دوره" htmlFor="series-interval">
            <Input id="series-interval" type="number" min={1} value={interval} onChange={event => setInterval(Number(event.target.value))} />
          </FormField>
          <FormField label="مهلت از شروع (روز)" htmlFor="series-offset">
            <Input id="series-offset" type="number" min={0} value={offset} onChange={event => setOffset(Number(event.target.value))} />
          </FormField>
          <div className="sm:col-span-2">
            <FormField label="توضیحات" htmlFor="series-description">
              <Textarea id="series-description" value={description} onChange={event => setDescription(event.target.value)} rows={3} />
            </FormField>
          </div>
        </div>
        {initial?.occurrenceCount ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] leading-5 text-amber-800">
            پس از ساخت اولین رخداد، پروژه مجموعه برای حفظ یکپارچگی رخدادها قابل تغییر نیست.
          </p>
        ) : null}
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <Button variant="secondary" disabled={mutation.isPending} onClick={onClose}>انصراف</Button>
          <Button type="submit" loading={mutation.isPending}>ذخیره مجموعه</Button>
        </div>
      </form>
    </Modal>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return <div dir="rtl" className="mx-auto max-w-7xl space-y-5 p-4 text-right sm:p-6 lg:p-8">{children}</div>;
}

function SeriesStatus({ status }: { status: string }) {
  return (
    <span className={`rounded-lg border px-2.5 py-1 text-[10px] font-extrabold ${statusClasses[status] || statusClasses.archived}`}>
      {statusLabels[status] || status}
    </span>
  );
}

function Metric({ label, value, icon, tone = 'default' }: { label: string; value: number | string; icon?: React.ReactNode; tone?: 'default' | 'danger' }) {
  return (
    <div className={`rounded-2xl border p-3.5 ${tone === 'danger' ? 'border-rose-100 bg-rose-50/60' : 'border-slate-100 bg-slate-50/80'}`}>
      <div className="flex items-center justify-between gap-2 text-[10px] font-bold text-slate-500">
        <span>{label}</span>
        {icon && <span className="[&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>}
      </div>
      <p className={`mt-1 text-lg font-black ${tone === 'danger' ? 'text-rose-700' : 'text-slate-900'}`}>
        {typeof value === 'number' ? value.toLocaleString('fa-IR') : value}
      </p>
    </div>
  );
}

function Meta({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-indigo-500 [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>
      {label}: <b className="text-slate-700">{value}</b>
    </span>
  );
}

export default ContentSeriesView;
