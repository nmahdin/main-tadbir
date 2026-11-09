import { LayoutDashboard, MailPlus, SlidersHorizontal, type LucideIcon } from 'lucide-react';
import type { ActiveView } from '../../shared/types';

/**
 * UX-02-3 typed navigation configuration (addendum §1).
 *
 * One declaration per shell context: stable key, Persian title,
 * Ocean icon, destination (an in-app view or a real route), the
 * permission the destination requires (UI hiding only — the backend
 * stays authoritative), context eligibility, section and order.
 * Only operational destinations are listed; the workspace shell
 * keeps its richer data-driven menu in Sidebar (its items carry
 * live collections), while platform/organization shells render
 * straight from this config.
 */
export type ShellContext = 'platform' | 'organization' | 'workspace';

export interface ShellNavItem {
  key: string;
  /** DOM id preserved from the pre-config markup. */
  id: string;
  title: string;
  icon: LucideIcon;
  kind: 'view' | 'route';
  view?: ActiveView;
  path?: string;
  permission?: string;
  contexts: ShellContext[];
  section: string;
  order: number;
}

export const ORGANIZATION_NAV: ShellNavItem[] = [
  {
    key: 'org-dashboard', id: 'nav-item-org-dashboard', title: 'کارتابل من', icon: LayoutDashboard,
    kind: 'view', view: 'dashboard', contexts: ['organization'], section: 'مدیریت سازمان', order: 1,
  },
  {
    key: 'org-settings', id: 'nav-item-scoped-settings', title: 'تنظیمات سازمان', icon: SlidersHorizontal,
    kind: 'view', view: 'scoped-settings', permission: 'organization.settings.manage',
    contexts: ['organization'], section: 'مدیریت سازمان', order: 2,
  },
  {
    key: 'org-invitations', id: 'nav-item-org-invitations', title: 'مدیریت دعوت‌ها', icon: MailPlus,
    kind: 'route', path: '/invitations/manage', contexts: ['organization'], section: 'مدیریت سازمان', order: 3,
  },
];

export const PLATFORM_NAV: ShellNavItem[] = [
  {
    key: 'platform-settings', id: 'nav-item-scoped-settings', title: 'تنظیمات پلتفرم', icon: SlidersHorizontal,
    kind: 'view', view: 'scoped-settings', contexts: ['platform'], section: 'مدیریت پلتفرم', order: 1,
  },
  {
    key: 'platform-dashboard', id: 'nav-item-platform-dashboard', title: 'کارتابل من', icon: LayoutDashboard,
    kind: 'view', view: 'dashboard', contexts: ['platform'], section: 'مدیریت پلتفرم', order: 2,
  },
];

/** Active-route matching: views match the active view, routes match the path prefix. */
export function isShellNavActive(item: ShellNavItem, activeView: ActiveView, pathname: string): boolean {
  if (item.kind === 'route') return Boolean(item.path) && pathname.startsWith(item.path!.split('/').slice(0, 2).join('/'));
  return item.view === activeView;
}
