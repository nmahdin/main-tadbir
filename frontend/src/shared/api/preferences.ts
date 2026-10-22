import { request, type ApiResponse } from './client';

/**
 * UX-02-3 shared client for the actor's own C7 user preferences
 * (presentation-only). Kept in shared/ so any feature can persist
 * UI preferences without a feature→feature import; the settings
 * feature keeps its own richer client for the settings screens.
 * Preference writes are version-checked (lock_version semantics):
 * pass the explicit version you read, never overwrite blindly.
 *
 * UX-02-3-FINAL: the stored value is v2 — per module
 * { hidden: string[], order: string[] } (column order included).
 * The v1 shape (plain string array = hidden columns) is still
 * read-compatibly normalized, never rewritten blindly.
 */
export interface PreferenceItem {
  definition: { key: string };
  effective: { value: unknown };
  explicit: { exists: boolean; value: unknown; version: number | null };
}

const LIST_COLUMNS_KEY = 'user.experience.list_columns';

export type { ModuleColumnPreference } from './columnPreferences';
export { applyColumnOrder, moveInOrder, normalizeModuleColumnPreference } from './columnPreferences';

import {
  normalizeModuleColumnPreference,
  type ModuleColumnPreference,
} from './columnPreferences';

export type ListColumnPreferences = Partial<Record<'projects' | 'tasks' | 'contents', ModuleColumnPreference>>;

export async function readListColumnPreferences(): Promise<{ value: ListColumnPreferences; version: number | null }> {
  const response = await request<ApiResponse<PreferenceItem[]>>('/core/preferences');
  const item = response.data.find(entry => entry.definition.key === LIST_COLUMNS_KEY);
  if (!item || typeof item.effective.value !== 'string' || !item.effective.value) {
    return { value: {}, version: item?.explicit.version ?? null };
  }
  try {
    const parsed = JSON.parse(item.effective.value) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const value: ListColumnPreferences = {};
      for (const module of ['projects', 'tasks', 'contents'] as const) {
        value[module] = normalizeModuleColumnPreference((parsed as Record<string, unknown>)[module]);
      }
      return { value, version: item.explicit.version };
    }
  } catch { /* malformed preference falls back to defaults */ }
  return { value: {}, version: item.explicit.version };
}

export interface WrittenPreference {
  key: string;
  explicit: { exists: boolean; value: unknown; version: number | null };
}

export function writeListColumnPreferences(value: ListColumnPreferences, expectedVersion: number | null) {
  return request<ApiResponse<WrittenPreference>>(`/core/preferences/${LIST_COLUMNS_KEY}`, {
    method: 'PUT',
    body: { value: JSON.stringify(value), expected_version: expectedVersion ?? undefined },
  });
}

/* ------------------------------------------------------------------ */
/* UX-02-4: shared raw access for the remaining user.experience keys.  */

const MUTES_KEY = 'user.experience.notification_mutes';
const DENSITY_KEY = 'user.experience.table_density';
const TIMEZONE_KEY = 'user.experience.timezone';

/** Categories the user may mute; system/security can never be muted. */
export const MUTABLE_NOTIFICATION_CATEGORIES = ['tasks', 'content', 'meetings', 'secretariat', 'collaboration'] as const;

async function readRawPreference(key: string): Promise<{ raw: string | null; version: number | null }> {
  const response = await request<ApiResponse<PreferenceItem[]>>('/core/preferences');
  const item = response.data.find(entry => entry.definition.key === key);
  if (!item) return { raw: null, version: null };
  return {
    raw: typeof item.effective.value === 'string' && item.effective.value ? item.effective.value : null,
    version: item.explicit.version,
  };
}

function writeRawPreference(key: string, value: string, expectedVersion: number | null) {
  return request<ApiResponse<WrittenPreference>>(`/core/preferences/${key}`, {
    method: 'PUT',
    body: { value, expected_version: expectedVersion ?? undefined },
  });
}

export function normalizeMutedCategories(raw: unknown): string[] {
  const list = typeof raw === 'string'
    ? (() => { try { const parsed = JSON.parse(raw) as unknown; return Array.isArray(parsed) ? parsed : []; } catch { return []; } })()
    : Array.isArray(raw) ? raw : [];
  return list.filter((entry): entry is string => typeof entry === 'string' && (MUTABLE_NOTIFICATION_CATEGORIES as readonly string[]).includes(entry));
}

export async function readNotificationMutes(): Promise<{ value: string[]; version: number | null }> {
  const { raw, version } = await readRawPreference(MUTES_KEY);
  return { value: normalizeMutedCategories(raw), version };
}

export function writeNotificationMutes(categories: string[], expectedVersion: number | null) {
  return writeRawPreference(MUTES_KEY, JSON.stringify(normalizeMutedCategories(categories)), expectedVersion);
}

export type TableDensity = 'normal' | 'compact';

export async function readTableDensity(): Promise<{ value: TableDensity; version: number | null }> {
  const { raw, version } = await readRawPreference(DENSITY_KEY);
  return { value: raw === 'compact' ? 'compact' : 'normal', version };
}

export function writeTableDensity(density: TableDensity, expectedVersion: number | null) {
  return writeRawPreference(DENSITY_KEY, density, expectedVersion);
}

export async function readDisplayTimezone(): Promise<string | null> {
  const { raw } = await readRawPreference(TIMEZONE_KEY);
  return raw;
}
