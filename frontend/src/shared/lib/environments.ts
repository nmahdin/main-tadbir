/**
 * UX-02-1 environment model (pure logic; no React, no storage, no I/O).
 *
 * An "environment" is a navigation/authorization context only (K2):
 * platform, one organization, or one workspace (personal or
 * organizational). Selecting an environment never widens access —
 * the server authorizes every request exactly as before — and it
 * never re-scopes legacy operational data.
 */

export type EnvironmentKind = 'platform' | 'organization' | 'workspace';

export interface EnvironmentSelection {
  kind: EnvironmentKind;
  /** Organization/workspace id; null for platform and for the
   *  unpinned workspace environment (the legacy default shell). */
  id: number | null;
}

export interface EnvironmentRole {
  key: string;
  name: string;
}

export interface PlatformEnvironment {
  eligible: boolean;
  is_primary: boolean;
  permissions: string[];
}

export interface OrganizationEnvironment {
  id: number;
  name: string;
  slug: string;
  status: string;
  role: EnvironmentRole | null;
  permissions: string[];
}

export interface WorkspaceEnvironment {
  id: number;
  name: string;
  organization_id: number | null;
  organization_name: string | null;
  is_default: boolean;
  relation: 'owner' | 'member';
  role: EnvironmentRole | null;
  permissions: string[];
}

export interface EnvironmentsPayload {
  platform: PlatformEnvironment;
  organizations: OrganizationEnvironment[];
  workspaces: WorkspaceEnvironment[];
}

export interface EnvironmentDescriptor {
  selection: EnvironmentSelection;
  kind: EnvironmentKind;
  id: number | null;
  name: string;
  /** Persian human label for the caller's standing in this environment. */
  standing: string;
  organizationName: string | null;
}

export const PLATFORM_SELECTION: EnvironmentSelection = { kind: 'platform', id: null };
export const UNSCOPED_WORKSPACE_SELECTION: EnvironmentSelection = { kind: 'workspace', id: null };

export function environmentKey(selection: EnvironmentSelection): string {
  return selection.id === null ? selection.kind : `${selection.kind}:${selection.id}`;
}

export function sameEnvironment(a: EnvironmentSelection | null, b: EnvironmentSelection | null): boolean {
  if (a === null || b === null) return a === b;
  return a.kind === b.kind && a.id === b.id;
}

const KIND_NAMES: Record<EnvironmentKind, string> = {
  platform: 'پلتفرم',
  organization: 'سازمان',
  workspace: 'فضای کاری',
};

export function environmentKindName(kind: EnvironmentKind): string {
  return KIND_NAMES[kind];
}

/** Resolve a selection against a fresh payload; null when the user
 *  may no longer enter it (membership ended, organization suspended,
 *  platform assignment revoked, …). */
export function resolveEnvironment(
  payload: EnvironmentsPayload,
  selection: EnvironmentSelection,
): EnvironmentDescriptor | null {
  if (selection.kind === 'platform') {
    if (!payload.platform.eligible) return null;
    return {
      selection,
      kind: 'platform',
      id: null,
      name: 'مدیریت پلتفرم',
      standing: payload.platform.is_primary ? 'مدیر اصلی پلتفرم' : 'مدیر پلتفرم',
      organizationName: null,
    };
  }
  if (selection.kind === 'organization') {
    const organization = payload.organizations.find(item => item.id === selection.id);
    if (!organization) return null;
    return {
      selection,
      kind: 'organization',
      id: organization.id,
      name: organization.name,
      standing: organization.role?.name ?? 'عضو سازمان',
      organizationName: organization.name,
    };
  }
  if (selection.id === null) {
    return {
      selection,
      kind: 'workspace',
      id: null,
      name: 'محیط کاری',
      standing: 'فضای کاری',
      organizationName: null,
    };
  }
  const workspace = payload.workspaces.find(item => item.id === selection.id);
  if (!workspace) return null;
  return {
    selection,
    kind: 'workspace',
    id: workspace.id,
    name: workspace.name,
    standing: workspace.role?.name ?? (workspace.relation === 'owner' ? 'مالک فضای کاری' : 'عضو فضای کاری'),
    organizationName: workspace.organization_name,
  };
}

/** The environment to enter when nothing valid is selected yet:
 *  the default personal workspace, else the first workspace, else
 *  the first organization, else the platform (when eligible), else
 *  the unpinned workspace shell. */
export function defaultEnvironment(payload: EnvironmentsPayload): EnvironmentSelection {
  const personal = payload.workspaces.filter(item => item.organization_id === null);
  const preferred = personal.find(item => item.is_default) ?? personal[0] ?? payload.workspaces[0];
  if (preferred) return { kind: 'workspace', id: preferred.id };
  const organization = payload.organizations[0];
  if (organization) return { kind: 'organization', id: organization.id };
  if (payload.platform.eligible) return PLATFORM_SELECTION;
  return UNSCOPED_WORKSPACE_SELECTION;
}

/** Personal vs by-organization grouping for the selector page. */
export function groupedWorkspaces(payload: EnvironmentsPayload): {
  personal: WorkspaceEnvironment[];
  organizations: { organizationId: number | null; organizationName: string; items: WorkspaceEnvironment[] }[];
} {
  const personal = payload.workspaces.filter(item => item.organization_id === null);
  const groups = new Map<string, { organizationId: number | null; organizationName: string; items: WorkspaceEnvironment[] }>();
  for (const workspace of payload.workspaces) {
    if (workspace.organization_id === null) continue;
    const key = String(workspace.organization_id);
    const existing = groups.get(key);
    if (existing) existing.items.push(workspace);
    else groups.set(key, {
      organizationId: workspace.organization_id,
      organizationName: workspace.organization_name ?? 'سازمان',
      items: [workspace],
    });
  }
  return { personal, organizations: [...groups.values()] };
}

/** Latin/Arabic-tolerant contains match for environment search. */
export function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\s+/g, ' ')
    .trim();
}

export function filterPayload(payload: EnvironmentsPayload, rawQuery: string): EnvironmentsPayload {
  const query = normalizeSearchText(rawQuery);
  if (!query) return payload;
  const matches = (name: string) => normalizeSearchText(name).includes(query);
  return {
    platform: payload.platform,
    organizations: payload.organizations.filter(item => matches(item.name)),
    workspaces: payload.workspaces.filter(item => matches(item.name) || (item.organization_name !== null && matches(item.organization_name))),
  };
}

export function hasAnyEnvironment(payload: EnvironmentsPayload): boolean {
  return payload.platform.eligible || payload.organizations.length > 0 || payload.workspaces.length > 0;
}

/** Where entering an environment lands. Organization/platform
 *  management surfaces live in scoped settings today (UX-02-2 will
 *  add their dashboards); the workspace environment is the daily
 *  operational shell (K2: legacy views stay global). */
export function landingPathFor(selection: EnvironmentSelection): string {
  if (selection.kind === 'workspace') return '/dashboard';
  return '/scoped-settings';
}

/* --- Recent environments (identifiers only; labels always come
 *     from the fresh server payload, never from storage) --- */

export interface RecentEnvironment {
  kind: EnvironmentKind;
  id: number | null;
  at: number;
}

const MAX_RECENTS = 6;

export function parseRecents(raw: string | null): RecentEnvironment[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is RecentEnvironment => {
      if (typeof item !== 'object' || item === null) return false;
      const candidate = item as { kind?: unknown; id?: unknown; at?: unknown };
      return (candidate.kind === 'platform' || candidate.kind === 'organization' || candidate.kind === 'workspace')
        && (candidate.id === null || (typeof candidate.id === 'number' && Number.isFinite(candidate.id)))
        && typeof candidate.at === 'number';
    }).slice(0, MAX_RECENTS);
  } catch {
    return [];
  }
}

export function pushRecent(recents: RecentEnvironment[], selection: EnvironmentSelection, at: number): RecentEnvironment[] {
  const rest = recents.filter(item => !(item.kind === selection.kind && item.id === selection.id));
  return [{ kind: selection.kind, id: selection.id, at }, ...rest].slice(0, MAX_RECENTS);
}

/** Drop recents the fresh payload no longer authorizes (suspended
 *  organizations, ended memberships, revoked platform access). */
export function validRecents(recents: RecentEnvironment[], payload: EnvironmentsPayload): RecentEnvironment[] {
  return recents.filter(item => resolveEnvironment(payload, item) !== null);
}

export function parseSelection(raw: string | null): EnvironmentSelection | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const candidate = parsed as { kind?: unknown; id?: unknown };
    if (candidate.kind !== 'platform' && candidate.kind !== 'organization' && candidate.kind !== 'workspace') return null;
    const id: number | null = candidate.id === null || candidate.id === undefined
      ? null
      : (typeof candidate.id === 'number' && Number.isFinite(candidate.id) ? candidate.id : Number.NaN);
    if (Number.isNaN(id)) return null;
    if (candidate.kind === 'platform' && id !== null) return null;
    return { kind: candidate.kind, id };
  } catch {
    return null;
  }
}
