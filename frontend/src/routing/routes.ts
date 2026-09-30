import type { ActiveView } from '../types';
export const viewPaths: Partial<Record<ActiveView, string>> = {
  dashboard: '/dashboard', approvals: '/approvals', projects: '/projects', 'my-tasks': '/tasks', content: '/contents',
  'content-published': '/contents/published', 'content-publishing': '/contents/publishing', archive: '/archive',
  'user-management': '/users', 'roles-management': '/roles', departments: '/departments', assets: '/dam',
  messages: '/chat', 'thought-room': '/thought-room', secretariat: '/secretariat', notifications: '/notifications', comments: '/comments',
  settings: '/settings', 'user-profile': '/profile', calendar: '/calendar', analytics: '/analytics', reports: '/analytics', activity: '/activity', templates: '/projects',
};
export function resolveRoute(pathname: string, demo = false) {
  const path = pathname.replace(/\/$/, '') || '/';
  if (path === '/' || path === '/login') return { view: 'dashboard' as ActiveView, known: true };
  const match = Object.entries(viewPaths).find(([, value]) => value === path);
  if (match) return { view: match[0] as ActiveView, known: true };
  const detail = path.match(/^\/(projects|tasks|contents)\/([^/]+)$/);
  if (detail && (demo ? /^[\w-]+$/.test(detail[2]) : /^[1-9]\d{0,18}$/.test(detail[2]))) {
    const module = detail[1] as 'projects' | 'tasks' | 'contents';
    return { view: (module === 'projects' ? 'project-detail' : module === 'contents' ? 'content-detail' : 'my-tasks') as ActiveView,
      known: true, module, id: detail[2] };
  }
  return { view: 'dashboard' as ActiveView, known: false };
}
export const viewPermissions: Partial<Record<ActiveView, string[]>> = {
  projects: ['projects.view'], 'project-detail': ['projects.view'], 'my-tasks': ['tasks.view'],
  content: ['content.view'], 'content-detail': ['content.view'], 'content-published': ['content.view'], 'content-publishing': ['content.view'],
  'user-management': ['users.view'], 'roles-management': ['roles.view'], departments: ['departments.view'], assets: ['assets.view'],
  'thought-room': ['thinktank.view'], secretariat: ['secretariat.view'], messages: ['messaging.view'],
  settings: ['settings.manage', 'content.manage_process', 'workflows.manage'],
};
