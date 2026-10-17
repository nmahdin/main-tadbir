import React from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, ArrowLeft, Bell, CalendarClock, CheckCircle2, CheckSquare2, Clock3,
  FolderKanban, LayoutDashboard, Mail, PenTool, RefreshCw, ShieldCheck, Sparkles, UserRound,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { canUsePermission } from '../../utils/permissions';
import { useNotificationRead, useWorkspacePage, type WorkspaceModule } from '../../queries/workspacePages';
import { EmptyState, ErrorState } from '../common/Primitives';
import { PriorityPill } from '../common/PriorityPill';
import { listStatuses, notificationDestination } from '../../routing/listQuery';
import { formatPersianDate, formatPersianDateLong, formatPersianNumber, formatPersianTime } from '../../utils/date';
import type { Priority } from '../../types';
import { useQueryClient } from '@tanstack/react-query';

type Tone = 'indigo' | 'rose' | 'amber' | 'emerald' | 'violet' | 'sky';
const tones: Record<Tone, { icon: string; edge: string; link: string; chip: string; bar: string }> = {
  indigo: { icon: 'bg-indigo-50 text-indigo-600', edge: 'border-indigo-100', link: 'text-indigo-700', chip: 'bg-indigo-50 text-indigo-700', bar: 'bg-indigo-500' },
  rose: { icon: 'bg-rose-50 text-rose-600', edge: 'border-rose-100', link: 'text-rose-700', chip: 'bg-rose-50 text-rose-700', bar: 'bg-rose-500' },
  amber: { icon: 'bg-amber-50 text-amber-600', edge: 'border-amber-100', link: 'text-amber-700', chip: 'bg-amber-50 text-amber-700', bar: 'bg-amber-500' },
  emerald: { icon: 'bg-emerald-50 text-emerald-600', edge: 'border-emerald-100', link: 'text-emerald-700', chip: 'bg-emerald-50 text-emerald-700', bar: 'bg-emerald-500' },
  violet: { icon: 'bg-violet-50 text-violet-600', edge: 'border-violet-100', link: 'text-violet-700', chip: 'bg-violet-50 text-violet-700', bar: 'bg-violet-500' },
  sky: { icon: 'bg-sky-50 text-sky-600', edge: 'border-sky-100', link: 'text-sky-700', chip: 'bg-sky-50 text-sky-700', bar: 'bg-sky-500' },
};

type Row = Record<string, any>;

interface SectionConfig {
  id: string;
  module: WorkspaceModule;
  title: string;
  description: string;
  params: Record<string, string | number>;
  destination: string;
  icon: React.ElementType;
  tone: Tone;
  /** مجوز لازم؛ `null` یعنی این بخش برای هر کاربر واردشده معنا دارد. */
  permission: string | null;
  group: 'urgent' | 'due' | 'flow';
  emptyTitle: string;
  emptyHint: string;
}

const groups: Array<{ id: SectionConfig['group']; title: string; description: string }> = [
  { id: 'urgent', title: 'نیازمند اقدام فوری', description: 'کارهایی که از موعد گذشته‌اند یا منتظر تصمیم شما هستند' },
  { id: 'due', title: 'برنامهٔ امروز', description: 'کارهای امروز و متعهد‌شده‌های نزدیک' },
  { id: 'flow', title: 'در جریان و در دست پیگیری', description: 'پرونده‌ها، نامه‌ها و پروژه‌هایی که شما مسئولشان هستید' },
];

/** اختلاف روز نسبت به امروز؛ فقط برای نمایش تأخیر و بر پایهٔ مقدار ذخیره‌شدهٔ مهلت. */
const daysOverdue = (deadline?: string | null): number => {
  if (!deadline) return 0;
  const today = new Date();
  const todayStamp = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const parts = String(deadline).slice(0, 10).split('-').map(Number);
  if (parts.length !== 3 || parts.some(part => !Number.isFinite(part))) return 0;
  const target = new Date(parts[0], parts[1] - 1, parts[2]).getTime();
  return Math.floor((todayStamp - target) / 86_400_000);
};

const isDone = (row: Row) => ['completed', 'archived', 'published', 'cancelled'].includes(String(row.status || ''));

export function ActionDashboard() {
  const { currentUser } = useAuth();
  const { generalSettings, projects, users, contentTypes } = useApp();
  const queryClient = useQueryClient();
  const readMutation = useNotificationRead();
  const [refreshing, setRefreshing] = React.useState(false);
  const can = (permission: string) => canUsePermission(currentUser, [], permission);

  const configs = React.useMemo<SectionConfig[]>(() => [
    {
      // «موعد نزدیک» یعنی تسک‌های عقب‌افتاده به‌همراه موعدهای هفت روز آینده؛
      // همان معنایی که در «وظایف من» و فهرست تسک‌ها هم استفاده می‌شود.
      id: 'near-due-tasks', module: 'tasks', title: 'تسک‌های موعد نزدیک', description: 'تسک‌های عقب‌افتاده و موعدهای هفت روز آینده، بر پایهٔ نزدیک‌ترین موعد',
      params: { assignee: 'me', due: 'near', sort: 'deadline', direction: 'asc' }, destination: '/tasks?assignee=me&due=near',
      icon: CalendarClock, tone: 'rose', permission: 'tasks.view', group: 'urgent',
      emptyTitle: 'تسکی با موعد نزدیک ندارید.', emptyHint: 'هیچ تسکی از شما عقب نیفتاده و تا هفت روز آینده هم موعدی ندارد.',
    },
    {
      id: 'approvals', module: 'approvals', title: 'منتظر بررسی من', description: 'مراحل محتوایی که به تصمیم شما نیاز دارند',
      params: {}, destination: '/approvals', icon: ShieldCheck, tone: 'amber', permission: 'content.approve', group: 'urgent',
      emptyTitle: 'بررسی در انتظاری ندارید.', emptyHint: 'صف تأیید محتوا برای شما خالی است.',
    },
    {
      id: 'unread-notifications', module: 'notifications', title: 'اعلان‌های نخوانده', description: 'رویدادهای تازه‌ای که هنوز ندیده‌اید',
      params: { read: 'unread' }, destination: '/notifications?read=unread', icon: Bell, tone: 'emerald', permission: null, group: 'urgent',
      emptyTitle: 'اعلان نخوانده‌ای ندارید.', emptyHint: 'همهٔ اعلان‌ها را دیده‌اید.',
    },
    {
      id: 'today-tasks', module: 'tasks', title: 'کارهای امروز من', description: 'تسک‌هایی که مهلتشان امروز است',
      params: { assignee: 'me', due: 'today', sort: 'deadline', direction: 'asc' }, destination: '/tasks?assignee=me&due=today',
      icon: CheckSquare2, tone: 'indigo', permission: 'tasks.view', group: 'due',
      emptyTitle: 'برای امروز کاری ثبت نشده است.', emptyHint: 'می‌توانید از فهرست تسک‌ها کار جدیدی به امروز اختصاص دهید.',
    },
    {
      id: 'my-contents', module: 'contents', title: 'محتواهای جاری من', description: 'پرونده‌های محتوایی باز که مسئول آن‌ها هستید',
      params: { owner: 'me', status: 'open', sort: 'deadline', direction: 'asc' }, destination: '/contents?owner=me&status=open',
      icon: PenTool, tone: 'violet', permission: 'content.view', group: 'flow',
      emptyTitle: 'پروندهٔ محتوایی باز ندارید.', emptyHint: 'محتوایی که مالک آن باشید و هنوز بسته نشده باشد وجود ندارد.',
    },
    {
      id: 'my-letters', module: 'secretariat-letters', title: 'کارتابل نامه‌های من', description: 'نامه‌های ثبت‌شده یا ارجاع‌شده به شما',
      params: { inbox: 'me' }, destination: '/secretariat', icon: Mail, tone: 'sky', permission: 'secretariat.view', group: 'flow',
      emptyTitle: 'نامه‌ای در کارتابل شما نیست.', emptyHint: 'نامهٔ ارجاع‌شده یا ثبت‌شده به نام شما وجود ندارد.',
    },
    {
      id: 'my-projects', module: 'projects', title: 'پروژه‌های تأخیردار من', description: 'پروژه‌های تحت مدیریت شما با سررسید گذشته',
      params: { project_manager_id: currentUser.id, due: 'overdue', sort: 'deadline', direction: 'asc' },
      destination: `/projects?project_manager_id=${currentUser.id}&due=overdue`, icon: FolderKanban, tone: 'indigo', permission: 'projects.view', group: 'flow',
      emptyTitle: 'پروژهٔ تأخیرداری ندارید.', emptyHint: 'هیچ پروژه‌ای که مدیریتش با شما باشد از سررسید عبور نکرده است.',
    },
  ], [currentUser.id]);

  const allowed = (config: SectionConfig) => (!config.permission || can(config.permission))
    && !(config.id === 'my-letters' && generalSettings.secretariatEnabled === false);

  // تعداد فراخوانی قلاب ثابت است (همیشه هفت بخش) و بخش‌های بدون مجوز فقط درخواست نمی‌فرستند.
  const pages = configs.map(config => useWorkspacePage(config.module, { ...config.params, per_page: 5 }, allowed(config)));

  const totalOf = (index: number) => pages[index].data?.meta?.total ?? pages[index].data?.data?.length ?? 0;
  const visible = configs.map((config, index) => ({ config, allowed: allowed(config), index })).filter(item => item.allowed);

  const stats = visible.map(item => {
    const page = pages[item.index];
    const unread = item.config.id === 'unread-notifications' ? page.data?.meta?.unread_count : undefined;
    return { ...item, total: unread ?? totalOf(item.index), pending: page.isPending, unread: unread ?? 0 };
  });
  const urgentStats = stats.filter(item => item.config.group === 'urgent' && item.total > 0);
  const lastUpdated = Math.max(0, ...pages.map(page => page.dataUpdatedAt));

  const headline = urgentStats.length
    ? `${urgentStats.map(item => `${formatPersianNumber(item.total)} ${item.config.title}`).join(' و ')} نیاز به رسیدگی دارند.`
    : 'در این لحظه موردی در وضعیت فوری نیست؛ برنامهٔ امروز و پرونده‌های در جریان پایین فهرست شده‌اند.';

  const refreshAll = async () => {
    setRefreshing(true);
    try {
      await Promise.all(pages.map(page => page.refetch()));
    } finally {
      setRefreshing(false);
    }
  };

  const subtitleOf = (config: SectionConfig, row: Row) => {
    if (config.module === 'notifications') return row.message || row.title;
    if (config.module === 'approvals') return row.stageTitle ? `مرحلهٔ «${row.stageTitle}»` : 'مرحلهٔ محتوایی';
    if (config.module === 'secretariat-letters') return row.sender || row.recipient || 'نامهٔ دبیرخانه';
    if (config.module === 'contents') return contentTypes.find(type => type.id === row.type)?.name || row.type || 'محتوا';
    if (config.module === 'tasks') return projects.find(project => project.id === row.projectId)?.name || 'بدون پروژه';
    return row.category || 'پروژهٔ سازمانی';
  };

  const ownerOf = (config: SectionConfig, row: Row) => {
    const id = config.module === 'tasks' ? row.assigneeId : config.module === 'contents' ? row.ownerId : config.module === 'projects' ? row.projectManagerId : undefined;
    return users.find(user => user.id === id)?.name;
  };

  const targetOf = (config: SectionConfig, row: Row) => config.module === 'notifications'
    ? notificationDestination(row)
    : config.module === 'approvals'
      ? `/approvals?item=${encodeURIComponent(String(row.id))}`
      : config.module === 'secretariat-letters'
        ? `/secretariat?letter=${encodeURIComponent(String(row.id))}`
        : `/${config.module}/${row.id}`;

  const renderRow = (config: SectionConfig, row: Row) => {
    const palette = tones[config.tone];
    const target = targetOf(config, row);
    const title = row.name || row.title || 'بدون عنوان';
    const deadlineValue = row.deadline || (config.module === 'notifications' ? row.timestamp || row.createdAt : null);
    const late = daysOverdue(row.deadline);
    const showLate = late > 0 && !isDone(row);
    const statusLabel = listStatuses[config.module]?.[String(row.status)] || null;
    const owner = ownerOf(config, row);
    const unread = config.module === 'notifications' && !row.read;

    return (
      <li key={row.id} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-3 transition-colors hover:border-indigo-200 hover:bg-white">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {target
                ? <Link className={`truncate text-xs font-black hover:underline ${palette.link}`} to={target}>{title}</Link>
                : <strong className="truncate text-xs font-black text-slate-800">{title}</strong>}
              {unread && <span className="h-2 w-2 shrink-0 rounded-full bg-indigo-600" aria-label="خوانده‌نشده" />}
              {config.module === 'tasks' && row.priority && <PriorityPill priority={row.priority as Priority} size="sm" />}
              {statusLabel && <span className={`rounded-lg px-2 py-0.5 text-[9px] font-black ${palette.chip}`}>{statusLabel}</span>}
              {showLate && <span className="rounded-lg bg-rose-50 px-2 py-0.5 text-[9px] font-black text-rose-700">{formatPersianNumber(late)} روز تأخیر</span>}
            </div>
            <p className="mt-1.5 line-clamp-2 text-[11px] leading-5 text-slate-500">{subtitleOf(config, row)}</p>
          </div>
          {deadlineValue && <time className={`shrink-0 text-[10px] font-bold ${showLate ? 'text-rose-600' : 'text-slate-400'}`} dateTime={String(deadlineValue)}>{formatPersianDate(deadlineValue)}</time>}
        </div>
        {(owner || unread) && <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/70 pt-2">
          {owner ? <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500"><UserRound className="h-3.5 w-3.5" />{owner}</span> : <span />}
          {unread && <button
            type="button"
            disabled={readMutation.isPending}
            onClick={() => readMutation.mutate(String(row.id), { onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['pages', currentUser.id] }) })}
            className="ui-button ui-button-ghost !min-h-7 !rounded-lg !px-2 !py-1 text-[10px] text-emerald-700"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />خوانده شد
          </button>}
        </div>}
      </li>
    );
  };

  const renderSection = (config: SectionConfig, index: number) => {
    const query = pages[index];
    const palette = tones[config.tone];
    const total = totalOf(index);
    return (
      <article key={config.id} aria-label={config.title} className={`flex h-full min-w-0 flex-col overflow-hidden rounded-3xl border bg-white shadow-2xs transition-shadow hover:shadow-md ${palette.edge}`}>
        <header className="flex items-start justify-between gap-3 border-b border-slate-100 p-4 sm:p-5">
          <div className="flex min-w-0 items-start gap-3">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${palette.icon}`}><config.icon className="h-5 w-5" /></span>
            <div className="min-w-0">
              <h2 className="text-sm font-black text-slate-900">{config.title}</h2>
              <p className="mt-1 text-[11px] leading-5 text-slate-500">{config.description}</p>
            </div>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ${total > 0 ? palette.chip : 'bg-slate-100 text-slate-500'}`}>
            {query.isPending ? '…' : `${formatPersianNumber(total)} مورد`}
          </span>
        </header>

        <div className="flex-1 p-3 sm:p-4">
          {query.isPending ? (
            <div className="space-y-2" role="status" aria-live="polite" aria-label="در حال دریافت">
              {[0, 1, 2].map(item => <div key={item} className="h-20 animate-pulse rounded-2xl bg-slate-100" />)}
            </div>
          ) : query.isError ? (
            <ErrorState error={query.error} onRetry={() => void query.refetch()} />
          ) : !query.data?.data?.length ? (
            <EmptyState title={config.emptyTitle}><p className="mt-1 text-[11px] text-slate-400">{config.emptyHint}</p></EmptyState>
          ) : (
            <ul className="space-y-2">{query.data.data.map((row: Row) => renderRow(config, row))}</ul>
          )}
        </div>

        <Link className={`flex items-center justify-center gap-1.5 border-t border-slate-100 px-4 py-3 text-xs font-black hover:bg-slate-50 ${palette.link}`} to={config.destination}>
          مشاهدهٔ فهرست کامل<ArrowLeft className="h-3.5 w-3.5" />
        </Link>
      </article>
    );
  };

  return (
    <section className="mx-auto max-w-7xl space-y-5 p-3 sm:p-6 lg:p-8" dir="rtl">
      <header className="relative overflow-hidden rounded-3xl bg-gradient-to-l from-slate-950 via-indigo-950 to-indigo-800 p-5 text-white shadow-lg sm:p-7">
        <div className="absolute -left-16 -top-20 h-64 w-64 rounded-full bg-violet-500/20 blur-3xl" />
        <div className="absolute -right-10 bottom-[-6rem] h-56 w-56 rounded-full bg-sky-400/10 blur-3xl" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10 backdrop-blur-sm">
              <LayoutDashboard className="h-7 w-7" />
            </span>
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-bold text-indigo-200">
                <span>کارتابل شخصی</span>
                <span className="text-indigo-300/60">·</span>
                <span className="inline-flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" />{formatPersianDateLong(new Date())}</span>
              </p>
              <h1 className="mt-1 break-words text-xl font-black sm:text-3xl">{currentUser.name}</h1>
              <p className="mt-2 max-w-3xl text-xs leading-6 text-indigo-100/85 sm:text-sm">{headline}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-2xl border border-white/15 bg-white/10 px-3 py-2 text-[10px] font-bold text-indigo-100">
              <Clock3 className="h-3.5 w-3.5" />
              آخرین به‌روزرسانی: {lastUpdated ? formatPersianTime(new Date(lastUpdated).toTimeString().slice(0, 5)) : '—'}
            </span>
            <button
              type="button"
              onClick={() => void refreshAll()}
              disabled={refreshing}
              className="inline-flex min-h-10 items-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-3.5 text-[11px] font-black text-white transition-colors hover:bg-white/20 disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'در حال به‌روزرسانی…' : 'به‌روزرسانی کارتابل'}
            </button>
          </div>
        </div>
      </header>

      {stats.length === 0 && (
        <EmptyState title="برای نقش شما بخشی در کارتابل تعریف نشده است.">
          <p className="mt-1 text-[11px] text-slate-400">با مدیر سامانه برای دسترسی به تسک‌ها، محتوا یا پروژه‌ها هماهنگ کنید.</p>
        </EmptyState>
      )}

      {stats.length > 0 && (
        <section aria-label="شاخص‌های کارتابل" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {stats.map(item => {
            const palette = tones[item.config.tone];
            const highlight = item.config.group === 'urgent' && item.total > 0;
            return (
              <Link
                key={item.config.id}
                to={item.config.destination}
                className={`group flex flex-col justify-between gap-3 rounded-2xl border bg-white p-3.5 shadow-2xs transition-all hover:-translate-y-0.5 hover:shadow-md ${highlight ? palette.edge : 'border-slate-200'}`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${palette.icon}`}><item.config.icon className="h-4 w-4" /></span>
                  {highlight && <Sparkles className="h-4 w-4 text-amber-500" />}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[11px] font-bold text-slate-500">{item.config.title}</span>
                  <span className={`mt-1 block text-2xl font-black ${highlight ? palette.link : 'text-slate-900'}`}>{item.pending ? '…' : formatPersianNumber(item.total)}</span>
                </span>
                <span className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <span className={`block h-full rounded-full ${palette.bar} transition-all`} style={{ width: item.total > 0 ? '100%' : '0%' }} />
                </span>
              </Link>
            );
          })}
        </section>
      )}

      {groups.map(group => {
        const sections = configs.map((config, index) => ({ config, index })).filter(item => item.config.group === group.id && allowed(item.config));
        if (sections.length === 0) return null;
        const groupTotal = sections.reduce((sum, item) => sum + totalOf(item.index), 0);
        return (
          <section key={group.id} className="space-y-3" aria-label={group.title}>
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-sm font-black text-slate-900">{group.title}</h2>
                <p className="mt-1 text-[11px] text-slate-500">{group.description}</p>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-600">{formatPersianNumber(groupTotal)} مورد</span>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">{sections.map(item => renderSection(item.config, item.index))}</div>
          </section>
        );
      })}
    </section>
  );
}
