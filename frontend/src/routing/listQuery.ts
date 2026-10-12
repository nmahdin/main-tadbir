export const listStatuses: Record<string, Record<string,string>> = {
  projects: { open: 'جاری', planning: 'برنامه‌ریزی', active: 'فعال', on_hold: 'متوقف', completed: 'تکمیل‌شده', cancelled: 'لغوشده', archived: 'بایگانی' },
  tasks: { open: 'جاری', backlog: 'در صف بررسی', in_progress: 'در حال انجام', review: 'در حال بررسی', completed: 'تکمیل‌شده', archived: 'بایگانی' },
  contents: { open: 'نیازمند اقدام', idea: 'ایده', draft: 'پیش‌نویس', producing: 'در حال تولید', reviewing: 'در حال بررسی', approved: 'تأییدشده', ready_to_publish: 'آماده انتشار', published: 'منتشرشده', archived: 'بایگانی' },
};
function isIsoCalendarDate(value: string | null): value is string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  if (!match) return false;
  const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return year > 0 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function parseListQuery(search: string, module: string, customStatuses: string[] = [], customTypes: string[] = [], targetAudiences: string[] = []) {
  const source = new URLSearchParams(search); const result: Record<string, string> = {};
  const page = Number(source.get('page')); if (Number.isSafeInteger(page) && page > 1 && page <= 100000) result.page = String(page);
  const perPage = source.get('per_page'); if (perPage && ['10','20','50','100'].includes(perPage)) result.per_page = perPage;
  const text = source.get('search')?.trim().slice(0,120); if (text) result.search = text;
  const status = source.get('status'); if (status && (status in (listStatuses[module] || {}) || customStatuses.includes(status))) result.status = status;
  if (module === 'tasks' && status === 'overdue') result.due = 'overdue'; // Legacy shared links.
  if (['tasks','projects'].includes(module) && ['today','overdue'].includes(source.get('due') || '')) result.due = source.get('due')!;
  if (['tasks','projects'].includes(module) && ['low','medium','high','urgent'].includes(source.get('priority') || '')) result.priority = source.get('priority')!;
  if (module === 'contents' && customTypes.includes(source.get('type') || '')) result.type = source.get('type')!;
  if (module === 'contents' && targetAudiences.includes(source.get('target_audience') || '')) result.target_audience = source.get('target_audience')!;
  if (module === 'contents') {
    const publishFrom = source.get('publish_from');
    const publishTo = source.get('publish_to');
    if (!(isIsoCalendarDate(publishFrom) && isIsoCalendarDate(publishTo) && publishTo < publishFrom)) {
      if (isIsoCalendarDate(publishFrom)) result.publish_from = publishFrom;
      if (isIsoCalendarDate(publishTo)) result.publish_to = publishTo;
    }
  }
  if (module === 'projects' && /^[1-9]\d{0,18}$/.test(source.get('project_manager_id') || '')) result.project_manager_id = source.get('project_manager_id')!;
  if (module === 'tasks' && source.get('assignee') === 'me') result.assignee = 'me';
  if (module === 'contents' && source.get('owner') === 'me') result.owner = 'me';
  if (['tasks','contents'].includes(module) && /^[1-9]\d{0,18}$/.test(source.get('project_id') || '')) result.project_id = source.get('project_id')!;
  if (module === 'tasks' && /^[1-9]\d{0,18}$/.test(source.get('content_id') || '')) result.content_id = source.get('content_id')!;
  if (['created_at','updated_at','deadline'].includes(source.get('sort') || '')) result.sort = source.get('sort')!;
  if (['asc','desc'].includes(source.get('direction') || '')) result.direction = source.get('direction')!;
  return result;
}
export function safeReturnTo(value: string | null, fallback: string) {
  return value && /^\/(?:(?:projects|tasks|contents)(?:\/[1-9]\d{0,18})?|notifications|approvals|dashboard|archive)(\?[^#]*)?$/.test(value) ? value : fallback;
}
export function notificationDestination(notification: { linkTaskId?: string; linkProjectId?: string; linkContentId?: string }) {
  for (const [key, module] of [['linkTaskId','tasks'],['linkProjectId','projects'],['linkContentId','contents']] as const) {
    const id = notification[key]; if (id && /^[1-9]\d{0,18}$/.test(String(id))) return `/${module}/${id}`;
  }
  return null; // No fabricated deep route for meeting/idea/letter without a route-backed detail.
}
