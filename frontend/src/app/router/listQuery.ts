export const listStatuses: Record<string, Record<string,string>> = {
  projects: { open: 'جاری', planning: 'برنامه‌ریزی', active: 'فعال', on_hold: 'متوقف', completed: 'تکمیل‌شده', cancelled: 'لغوشده', archived: 'بایگانی' },
  tasks: { open: 'جاری', backlog: 'در صف بررسی', in_progress: 'در حال انجام', review: 'در حال بررسی', completed: 'تکمیل‌شده', archived: 'بایگانی' },
  contents: { open: 'نیازمند اقدام', idea: 'ایده', draft: 'پیش‌نویس', producing: 'در حال تولید', reviewing: 'در حال بررسی', approved: 'تأییدشده', ready_to_publish: 'آماده انتشار', published: 'منتشرشده', archived: 'بایگانی' },
};
export function parseListQuery(search: string, module: string, customStatuses: string[] = [], customTypes: string[] = [], targetAudiences: string[] = []) {
  const source = new URLSearchParams(search); const result: Record<string, string> = {};
  const page = Number(source.get('page')); if (Number.isSafeInteger(page) && page > 1 && page <= 100000) result.page = String(page);
  const perPage = source.get('per_page'); if (perPage && ['10','20','50','100'].includes(perPage)) result.per_page = perPage;
  const text = source.get('search')?.trim().slice(0,120); if (text) result.search = text;
  const status = source.get('status'); if (status && (status in (listStatuses[module] || {}) || customStatuses.includes(status))) result.status = status;
  if (module === 'tasks' && status === 'overdue') result.due = 'overdue'; // Legacy shared links.
  if (['tasks','projects'].includes(module) && (module === 'tasks' ? ['today','near','overdue'] : ['today','overdue']).includes(source.get('due') || '')) result.due = source.get('due')!;
  if (['tasks','projects'].includes(module) && ['low','medium','high','urgent'].includes(source.get('priority') || '')) result.priority = source.get('priority')!;
  if (module === 'contents' && customTypes.includes(source.get('type') || '')) result.type = source.get('type')!;
  if (module === 'contents' && targetAudiences.includes(source.get('target_audience') || '')) result.target_audience = source.get('target_audience')!;
  if (module === 'projects' && /^[1-9]\d{0,18}$/.test(source.get('project_manager_id') || '')) result.project_manager_id = source.get('project_manager_id')!;
  if (module === 'tasks' && source.get('assignee') === 'me') result.assignee = 'me';
  if (module === 'contents' && source.get('owner') === 'me') result.owner = 'me';
  if (['tasks','contents'].includes(module) && /^[1-9]\d{0,18}$/.test(source.get('project_id') || '')) result.project_id = source.get('project_id')!;
  if (module === 'tasks' && /^[1-9]\d{0,18}$/.test(source.get('content_id') || '')) result.content_id = source.get('content_id')!;
  const sortParam = source.get('sort') || '';
  if (sortParam.includes(':')) {
    // UX-02-3 multi-sort spec: allowlisted fields, unique, max 3 pairs.
    const spec = parseSortSpec(sortParam, module);
    if (spec) result.sort = serializeSortSpec(spec);
  } else if (['created_at','updated_at','deadline'].includes(sortParam)) {
    result.sort = sortParam;
    if (['asc','desc'].includes(source.get('direction') || '')) result.direction = source.get('direction')!;
  }
  return result;
}

export interface SortCriterion { field: string; direction: 'asc' | 'desc' }

export const SORTABLE_FIELDS: Record<string, string[]> = {
  projects: ['created_at', 'updated_at', 'deadline', 'priority'],
  tasks: ['created_at', 'updated_at', 'deadline', 'priority'],
  contents: ['created_at', 'updated_at', 'deadline'],
};

/** Parse `field:dir,field2:dir2` (or a legacy single field) into criteria. */
export function parseSortSpec(value: string | null | undefined, module: string): SortCriterion[] | null {
  if (!value) return null;
  const allowed = SORTABLE_FIELDS[module] || SORTABLE_FIELDS.contents;
  if (!value.includes(':')) {
    return allowed.includes(value) ? [{ field: value, direction: 'desc' }] : null;
  }
  const pairs = value.split(',');
  if (pairs.length > 3) return null;
  const seen = new Set<string>();
  const spec: SortCriterion[] = [];
  for (const pair of pairs) {
    const [field, rawDirection] = pair.split(':');
    if (!allowed.includes(field) || (rawDirection !== 'asc' && rawDirection !== 'desc') || seen.has(field)) return null;
    seen.add(field);
    spec.push({ field, direction: rawDirection });
  }
  return spec.length ? spec : null;
}

export function serializeSortSpec(spec: SortCriterion[]): string {
  return spec.map(item => `${item.field}:${item.direction}`).join(',');
}

/** Cycle a field through asc → desc → removed, preserving precedence of the rest. */
export function cycleSortField(spec: SortCriterion[], field: string): SortCriterion[] {
  const existing = spec.find(item => item.field === field);
  if (!existing) return [...spec, { field, direction: 'asc' as const }].slice(0, 3);
  if (existing.direction === 'asc') return spec.map(item => item.field === field ? { ...item, direction: 'desc' as const } : item);
  return spec.filter(item => item.field !== field);
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
