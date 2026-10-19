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
