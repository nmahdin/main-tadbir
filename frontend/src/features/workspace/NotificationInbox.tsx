import React, { useState } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, ArrowRight, Bell, BellOff, CalendarDays, CheckCheck, Settings2, CheckCircle2,
  Clock, ExternalLink, FileText, Inbox, MessageSquare, Trash2, UserCheck,
} from 'lucide-react';
import { useApp } from '../../app/providers/AppContext';
import { useEnvironment } from '../../app/providers/EnvironmentContext';
import { useNotificationRead, useWorkspacePage } from '../../shared/queries/workspacePages';
import { notificationsApi } from '../../shared/api/notifications';
import {
  MUTABLE_NOTIFICATION_CATEGORIES, readNotificationMutes, writeNotificationMutes,
} from '../../shared/api/preferences';
import { PageSurface } from '../../shared/ui/PageSurface';
import { EmptyState, ErrorState, TableSkeleton } from '../../shared/ui/Primitives';
import { Pagination } from '../../shared/ui/WorkspacePatterns';
import { toast } from '../../shared/ui/Notifications';
import { notificationHasDetail } from '../../app/router/listQuery';
import { anyDirtySource } from '../../shared/lib/dirtyRegistry';
import { formatPersianDateTime } from '../../shared/lib/date';
import type { AppNotification } from '../../shared/types';
import { resolveNotificationTarget } from '../../shared/notifications/notificationTarget';
import { NotificationDetailModal } from '../../shared/notifications/NotificationDetailModal';

type StatusFilter = 'all' | 'unread' | 'read';
type CategoryFilter = 'all' | 'tasks' | 'meetings' | 'comments' | 'content' | 'secretariat' | 'system';

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'همه' },
  { key: 'unread', label: 'خوانده‌نشده' },
  { key: 'read', label: 'خوانده‌شده' },
];

const CATEGORIES: { key: Exclude<CategoryFilter, 'all'>; label: string; icon: React.ElementType }[] = [
  { key: 'tasks', label: 'وظایف', icon: UserCheck },
  { key: 'meetings', label: 'جلسه‌ها', icon: CalendarDays },
  { key: 'comments', label: 'دیدگاه‌ها', icon: MessageSquare },
  { key: 'content', label: 'محتوا', icon: FileText },
  { key: 'secretariat', label: 'دبیرخانه', icon: Inbox },
  { key: 'system', label: 'سامانه', icon: Bell },
];

const categoryOf = (notification: AppNotification): Exclude<CategoryFilter, 'all'> => {
  const explicit = (notification as { categoryKey?: string | null }).categoryKey || notification.notificationCategory;
  if (explicit === 'tasks') return 'tasks';
  if (explicit === 'meetings') return 'meetings';
  if (explicit === 'collaboration') return 'comments';
  if (explicit === 'content') return 'content';
  if (explicit === 'secretariat') return 'secretariat';
  if (notification.type === 'comment' || notification.type === 'mention' || notification.type === 'reply') return 'comments';
  if (notification.linkMeetingId) return 'meetings';
  if (notification.linkTaskId) return 'tasks';
  if (notification.linkContentId) return 'content';
  return 'system';
};

const notificationIcon = (notification: AppNotification) => {
  const category = categoryOf(notification);
  if (notification.type === 'overdue') return <AlertTriangle className="h-5 w-5 text-rose-600" />;
  if (notification.type === 'deadline') return <Clock className="h-5 w-5 text-[var(--color-primary)]" />;
  if (category === 'tasks') return <UserCheck className="h-5 w-5 text-[var(--color-primary)]" />;
  if (category === 'meetings') return <CalendarDays className="h-5 w-5 text-sky-600" />;
  if (category === 'comments') return <MessageSquare className="h-5 w-5 text-amber-600" />;
  if (category === 'content') return <FileText className="h-5 w-5 text-[var(--color-primary)]" />;
  if (notification.type === 'status_change') return <CheckCircle2 className="h-5 w-5 text-emerald-600" />;
  return <Bell className="h-5 w-5 text-slate-600" />;
};

interface NotificationGroup {
  group_key: string;
  category: string;
  type: string;
  title: string;
  message: string;
  count: number;
  unread_count: number;
  latest_id: string;
  latest_at: string;
  linkTaskId?: string | null;
  linkProjectId?: string | null;
  linkContentId?: string | null;
  linkMeetingId?: string | null;
  linkIdeaId?: string | null;
}

export const NotificationInbox: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { currentUser } = useApp();
  const { payload: envPayload, selection, switchEnvironment } = useEnvironment();
  const readMutation = useNotificationRead();
  const [detail, setDetail] = useState<AppNotification | null>(null);
  const [mutes, setMutes] = useState<string[]>([]);
  const [mutesVersion, setMutesVersion] = useState<number | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(() => new URLSearchParams(window.location.search).get('settings') === '1');

  const statusParam = searchParams.get('read');
  const status: StatusFilter = statusParam === 'unread' || statusParam === 'read' ? statusParam : 'all';
  const categoryParam = searchParams.get('category') || 'all';
  const category: CategoryFilter = (['tasks', 'meetings', 'comments', 'content', 'secretariat', 'system'] as const).includes(categoryParam as never) ? (categoryParam as CategoryFilter) : 'all';
  const groupKey = searchParams.get('group_key') || '';
  const grouped = !groupKey;
  const page = Math.max(1, Number(searchParams.get('page') || 1) || 1);

  const perPageParam = Number(searchParams.get('per_page') || 20);
  const queryParams: Record<string, string | number> = {
    per_page: [10, 20, 50, 100].includes(perPageParam) ? perPageParam : 20,
    page,
    ...(status !== 'all' ? { read: status } : {}),
    ...(category !== 'all' ? { category: category === 'comments' ? 'collaboration' : category } : {}),
    ...(groupKey ? { group_key: groupKey } : grouped ? { grouped: 1 } : {}),
  };
  const query = useWorkspacePage('notifications', queryParams);
  const rows = (query.data?.data ?? []) as (AppNotification & NotificationGroup)[];
  const meta = query.data?.meta as { unread_count?: number; unread_count_all?: number; total?: number; last_page?: number; muted_categories?: string[] } | undefined;
  const unreadCount = meta?.unread_count ?? 0;
  const unreadAll = meta?.unread_count_all ?? unreadCount;

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value); else next.delete(key);
    if (key !== 'page') next.delete('page');
    setSearchParams(next);
  };

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['pages', currentUser.id, 'notifications'] });

  React.useEffect(() => {
    let cancelled = false;
    readNotificationMutes()
      .then(({ value, version }) => { if (!cancelled) { setMutes(value); setMutesVersion(version); } })
      .catch(() => { /* defaults: nothing muted */ });
    return () => { cancelled = true; };
  }, []);

  const toggleMute = (key: string) => {
    const next = mutes.includes(key) ? mutes.filter(item => item !== key) : [...mutes, key];
    setMutes(next);
    writeNotificationMutes(next, mutesVersion)
      .then(response => { setMutesVersion(response.data.explicit.version); void query.refetch(); })
      .catch(() => { setMutes(mutes); toast.error('ذخیرهٔ تنظیم اعلان ناموفق بود'); });
  };

  const markReadWithUndo = async (notification: AppNotification) => {
    try {
      await readMutation.mutateAsync(notification.id);
      void invalidate();
      toast.info('اعلان خوانده‌شده علامت خورد', {
        dedupeKey: `read-${notification.id}`,
        action: {
          label: 'بازگردانی',
          onClick: () => {
            void notificationsApi.update(notification.id, { read: false }).then(() => invalidate()).catch(() => undefined);
          },
        },
      });
    } catch {
      toast.error('ثبت خوانده‌شدن ناموفق بود');
    }
  };

  const go = (notification: AppNotification) => {
    const target = resolveNotificationTarget(notification, envPayload, selection);
    if (target.kind === 'unavailable') {
      toast.error('مورد مرتبط یافت نشد', { description: 'این مورد حذف شده یا در محیط فعلی در دسترس نیست.' });
      return;
    }
    if (target.kind === 'switch') {
      if (anyDirtySource()) {
        toast.warning('فرم ذخیره‌نشده دارید', { description: 'برای جابه‌جایی محیط، ابتدا از صفحهٔ انتخاب محیط اقدام کنید تا از تغییرات شما محافظت شود.' });
        return;
      }
      switchEnvironment(target.selection);
    }
    navigate(`${target.path}?${new URLSearchParams({ returnTo: location.pathname + location.search })}`);
  };

  const activate = async (notification: AppNotification) => {
    if (!notification.read) {
      try {
        await readMutation.mutateAsync(notification.id);
        void invalidate();
      } catch {
        toast.error('ثبت خوانده‌شدن ناموفق بود');
        return;
      }
    }
    if (notificationHasDetail(notification)) {
      setDetail(notification);
      return;
    }
    go(notification);
  };

  const activateGroup = (group: NotificationGroup) => {
    if (group.count > 1) {
      setParam('group_key', group.group_key);
      return;
    }
    void activate({
      id: group.latest_id,
      userId: String(currentUser.id),
      title: group.title,
      message: group.message,
      type: (group.type || 'info') as AppNotification['type'],
      read: group.unread_count === 0,
      timestamp: group.latest_at,
      linkTaskId: group.linkTaskId || undefined,
      linkProjectId: group.linkProjectId || undefined,
      linkContentId: group.linkContentId || undefined,
      linkMeetingId: group.linkMeetingId || undefined,
      linkIdeaId: group.linkIdeaId || undefined,
    });
  };

  const markAll = async () => {
    try {
      await notificationsApi.readAll(groupKey ? { group_key: groupKey } : category !== 'all' ? { category: category === 'comments' ? 'collaboration' : category } : undefined);
      void invalidate();
      toast.success('اعلان‌ها خوانده شدند');
    } catch {
      toast.error('خواندن همهٔ اعلان‌ها ناموفق بود');
    }
  };

  const removeOne = async (notification: AppNotification) => {
    try {
      await notificationsApi.remove(notification.id);
      void invalidate();
    } catch {
      toast.error('حذف اعلان ناموفق بود');
    }
  };

  return (
    <div dir="rtl" className="text-right">
      <PageSurface className="space-y-5">
        <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--color-surface-muted)] text-[var(--color-primary)]"><Bell className="h-5 w-5" /></span>
            <div>
              <h1 className="text-xl font-black text-slate-900">مرکز اعلان‌ها</h1>
              <p className="mt-0.5 text-xs text-slate-500">
                {unreadCount ? `${unreadCount.toLocaleString('fa-IR')} اعلان خوانده‌نشده دارید` : 'همه اعلان‌ها خوانده شده‌اند'}
                {unreadAll !== unreadCount && ` (با احتساب دسته‌های بی‌صدا: ${unreadAll.toLocaleString('fa-IR')})`}
                {' · '}اعلان‌ها تا ۹۰ روز نگه داشته می‌شوند.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && <button type="button" onClick={() => void markAll()} className="ui-button ui-button-secondary w-fit text-xs"><CheckCheck className="h-4 w-4" />خواندن همه</button>}
            <button type="button" data-notification-settings aria-expanded={settingsOpen} aria-controls="notification-settings-panel" title="تنظیمات اعلان‌ها؛ بی‌صدا کردن دسته‌های معمولی" onClick={() => setSettingsOpen(open => !open)} className="ui-button ui-button-primary w-fit text-xs shadow-none"><Settings2 className="h-4 w-4" />تنظیمات اعلان‌ها</button>
          </div>
        </header>

        {settingsOpen && (
          <section id="notification-settings-panel" aria-label="تنظیمات بی‌صدا کردن دسته‌ها" className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
            <p className="text-xs font-black text-slate-800">بی‌صدا کردن دسته‌های معمولی</p>
            <p className="text-[11px] leading-5 text-slate-500">دستهٔ بی‌صدا در نشان خوانده‌نشده حساب نمی‌شود، اما اعلان‌هایش در مرکز باقی می‌ماند. اعلان‌های سامانه و امنیتی هرگز قابل بی‌صدا کردن نیستند و این تنظیمات روی ارسال ربات بله اثری ندارد.</p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {CATEGORIES.filter(item => (MUTABLE_NOTIFICATION_CATEGORIES as readonly string[]).includes(item.key === 'comments' ? 'collaboration' : item.key)).map(item => {
                const key = item.key === 'comments' ? 'collaboration' : item.key;
                const muted = mutes.includes(key);
                return (
                  <label key={item.key} className="flex cursor-pointer items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700">
                    <span>{item.label}</span>
                    <input type="checkbox" checked={muted} onChange={() => toggleMute(key)} aria-label={`بی‌صدا کردن ${item.label}`} />
                  </label>
                );
              })}
              <p className="flex items-center rounded-xl border border-dashed border-slate-200 px-3 py-2 text-[11px] font-bold text-slate-400">سامانه و امنیتی — همیشه فعال</p>
            </div>
          </section>
        )}

        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10px] font-black text-slate-500">وضعیت اعلان‌ها</span>
            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1" role="tablist" aria-label="وضعیت اعلان‌ها">
              {STATUS_FILTERS.map(item => <button key={item.key} type="button" role="tab" aria-selected={status === item.key} onClick={() => setParam('read', item.key === 'all' ? '' : item.key)} className={`rounded-lg px-2.5 py-1.5 text-[10px] font-bold transition ${status === item.key ? 'bg-white text-[var(--color-primary)]' : 'text-slate-500 hover:text-slate-800'}`}>{item.label}{item.key === 'unread' && unreadCount > 0 ? ` (${unreadCount.toLocaleString('fa-IR')})` : ''}</button>)}
            </div>
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="دسته‌بندی اعلان‌ها">
            <button type="button" onClick={() => setParam('category', '')} className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[10px] font-bold transition ${category === 'all' ? 'border-[var(--color-border)] bg-[var(--color-surface-muted)] text-[var(--color-primary)]' : 'border-transparent bg-slate-50 text-slate-600 hover:border-slate-200'}`}><Bell className="h-3.5 w-3.5" />همه اعلان‌ها</button>
            {CATEGORIES.map(item => {
              const Icon = item.icon;
              const key = item.key === 'comments' ? 'collaboration' : item.key;
              const isMuted = mutes.includes(key) || (item.key === 'system' && false);
              return <button key={item.key} type="button" onClick={() => setParam('category', item.key)} className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[10px] font-bold transition ${category === item.key ? 'border-[var(--color-border)] bg-[var(--color-surface-muted)] text-[var(--color-primary)]' : 'border-transparent bg-slate-50 text-slate-600 hover:border-slate-200'}`}><Icon className="h-3.5 w-3.5" />{item.label}{isMuted && <span className="text-[9px] text-slate-400">(بی‌صدا)</span>}</button>;
            })}
          </div>
          {groupKey && (
            <button type="button" onClick={() => setParam('group_key', '')} className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--color-surface-muted)] px-3 py-1.5 text-[11px] font-black text-[var(--color-primary)]">
              <ArrowRight className="h-3.5 w-3.5" />بازگشت به گروه‌ها
            </button>
          )}
        </section>

        {query.isPending ? (
          <TableSkeleton rows={6} columns={1} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : !rows.length ? (
          <div className="rounded-2xl border border-slate-200 bg-white">
            <EmptyState title="اعلانی در این دسته وجود ندارد." />
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
            {grouped
              ? (rows as NotificationGroup[]).map(group => {
                  const sample = { type: group.type, linkTaskId: group.linkTaskId || undefined } as AppNotification;
                  void sample;
                  return (
                    <article key={group.group_key} className={`flex items-start gap-3.5 p-4 transition-colors ${group.unread_count ? 'bg-[var(--color-surface-muted)]/60' : 'hover:bg-slate-50'}`}>
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100">{notificationIcon({ type: group.type, linkTaskId: group.linkTaskId || undefined, linkContentId: group.linkContentId || undefined, linkMeetingId: group.linkMeetingId || undefined } as AppNotification)}</span>
                      <button type="button" onClick={() => activateGroup(group)} className="min-w-0 flex-1 text-right">
                        <span className="mb-1 flex flex-wrap items-center gap-2">
                          <span className="text-sm font-bold text-slate-900">{group.title}</span>
                          {group.unread_count > 0 && <span className="h-2 w-2 rounded-full bg-[var(--color-primary)]" />}
                          {group.count > 1 && <span className="rounded-lg bg-[var(--color-surface-muted)] px-2 py-0.5 text-[9px] font-black text-[var(--color-primary)]">{group.count.toLocaleString('fa-IR')} مورد مشابه</span>}
                        </span>
                        <span className="block truncate text-xs leading-6 text-slate-600">{group.message}</span>
                        <time className="mt-1.5 block text-[10px] text-slate-400">{formatPersianDateTime(group.latest_at)}</time>
                      </button>
                      {group.unread_count > 0 && (
                        <button type="button" onClick={() => { void notificationsApi.readAll({ group_key: group.group_key }).then(() => invalidate()); }} className="ui-button ui-button-ghost !min-h-8 !px-2 text-[10px]" title="خواندن همهٔ این گروه">
                          <CheckCheck className="h-3.5 w-3.5" />خواندن گروه
                        </button>
                      )}
                    </article>
                  );
                })
              : (rows as AppNotification[]).map(notification => {
                  const categoryConfig = CATEGORIES.find(item => item.key === categoryOf(notification));
                  return (
                    <article key={notification.id} className={`flex items-start gap-3.5 p-4 transition-colors ${notification.read ? 'hover:bg-slate-50' : 'bg-[var(--color-surface-muted)]/60'}`}>
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100">{notificationIcon(notification)}</span>
                      <button type="button" onClick={() => void activate(notification)} className="min-w-0 flex-1 text-right">
                        <span className="mb-1 flex flex-wrap items-center gap-2">
                          <span className="text-sm font-bold text-slate-900">{notification.title}</span>
                          {!notification.read && <span className="h-2 w-2 rounded-full bg-[var(--color-primary)]" />}
                          {categoryConfig && <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-[9px] font-bold text-slate-500">{categoryConfig.label}</span>}
                        </span>
                        <span className="block whitespace-pre-line text-xs leading-6 text-slate-600">{notification.message}</span>
                        <time className="mt-1.5 block text-[10px] text-slate-400">{formatPersianDateTime(notification.timestamp)}</time>
                      </button>
                      <span className="flex shrink-0 items-center gap-1">
                        {(notification.linkTaskId || notification.linkProjectId || notification.linkContentId) && <span className="ui-button ui-button-ghost !min-h-8 !px-2 text-[10px]" aria-hidden><ExternalLink className="h-3.5 w-3.5" /><span className="hidden sm:inline">مشاهده</span></span>}
                        {!notification.read && <button type="button" onClick={() => void markReadWithUndo(notification)} className="ui-button ui-button-ghost ui-icon-button text-emerald-600" title="خوانده‌شده" aria-label="علامت‌گذاری به‌عنوان خوانده‌شده"><CheckCircle2 className="h-4 w-4" /></button>}
                        <button type="button" onClick={() => void removeOne(notification)} className="ui-button ui-button-ghost ui-icon-button text-slate-400 hover:text-rose-600" title="حذف اعلان" aria-label="حذف اعلان"><Trash2 className="h-4 w-4" /></button>
                      </span>
                    </article>
                  );
                })}
          </div>
        )}

        {!query.isPending && !query.isError && rows.length > 0 && (
          <Pagination meta={{ current_page: page, last_page: meta?.last_page ?? 1, per_page: [10, 20, 50, 100].includes(perPageParam) ? perPageParam : 20, total: grouped ? (meta?.total ?? rows.length) : (meta as { total?: number } | undefined)?.total }} busy={query.isFetching} onPage={next => setParam('page', String(next))} onPerPage={size => { const next = new URLSearchParams(searchParams); next.set('per_page', String(size)); next.delete('page'); setSearchParams(next); }} />
        )}
      </PageSurface>

      <NotificationDetailModal
        notification={detail}
        canNavigate={detail ? resolveNotificationTarget(detail, envPayload, selection).kind !== 'unavailable' : false}
        onNavigate={() => { if (detail) { const current = detail; setDetail(null); go(current); } }}
        onClose={() => setDetail(null)}
      />
    </div>
  );
};
