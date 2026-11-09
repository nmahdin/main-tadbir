import type { ScopedSettingItem, SettingSource } from './scopedSettingsApi';

/**
 * Pure presentation logic for the C7-4 scoped-settings screens.
 * Kept free of React/network so the node test harness can pin it.
 * Nothing here ever handles secret values — secrets have separate,
 * write-only UI state that is never derived from server data.
 */

export type EditorKind = 'select' | 'text' | 'textarea' | 'number' | 'boolean' | 'json';

export function editorKindFor(type: string, values: string[] | null): EditorKind {
  if (values && values.length > 0) return 'select';
  switch (type) {
    case 'boolean':
      return 'boolean';
    case 'integer':
      return 'number';
    case 'json':
      return 'json';
    case 'locale':
    case 'timezone':
    case 'enum':
      return 'select';
    default:
      return 'text';
  }
}

/** Common IANA zones offered for timezone settings (value stays the raw zone id). */
export const TIMEZONE_OPTIONS: string[] = [
  'Asia/Tehran',
  'UTC',
  'Asia/Dubai',
  'Asia/Baku',
  'Asia/Kabul',
  'Europe/Istanbul',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Asia/Tokyo',
  'Australia/Sydney',
];

export function optionsFor(item: ScopedSettingItem): string[] {
  const { definition } = item;
  if (definition.values && definition.values.length > 0) return definition.values;
  if (definition.type === 'timezone') {
    const current = typeof item.effective.value === 'string' ? item.effective.value : null;
    return current && !TIMEZONE_OPTIONS.includes(current)
      ? [current, ...TIMEZONE_OPTIONS]
      : TIMEZONE_OPTIONS;
  }
  if (definition.type === 'locale') return ['fa', 'en'];
  return [];
}

export function sourceLabel(source: SettingSource): string {
  switch (source) {
    case 'organization':
      return 'سازمان';
    case 'workspace':
      return 'فضای کاری';
    case 'user':
      return 'ترجیح شخصی';
    default:
      return 'پیش‌فرض پلتفرم';
  }
}

/** "Inherited from Organization" style label for a workspace row. */
export function inheritanceLabel(item: ScopedSettingItem, scope: 'organization' | 'workspace' | 'user'): string | null {
  if (scope !== 'workspace') return null;
  if (!item.explicit.exists) {
    return item.effective.source === 'organization'
      ? 'به ارث رسیده از سازمان'
      : 'مقدار پیش‌فرض پلتفرم';
  }
  return null;
}

/** Whether the workspace override editor must be disabled by policy. */
export function workspaceOverrideAllowed(item: ScopedSettingItem): boolean {
  if (!item.definition.workspace_override) return false;
  return item.override_policy?.allow ?? item.definition.workspace_override;
}

export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'بله' : 'خیر';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Draft state starts from the explicit value when present, else the effective one. */
export function draftFromItem(item: ScopedSettingItem): string {
  const value = item.explicit.exists ? item.explicit.value : item.effective.value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

export function parseDraft(item: ScopedSettingItem, draft: string): { ok: true; value: unknown } | { ok: false; error: string } {
  const { definition } = item;
  const trimmed = draft.trim();
  if (trimmed === '') {
    return definition.nullable
      ? { ok: true, value: null }
      : { ok: false, error: 'این تنظیم نمی‌تواند خالی باشد.' };
  }
  switch (definition.type) {
    case 'integer': {
      const parsed = Number(trimmed);
      return Number.isInteger(parsed)
        ? { ok: true, value: parsed }
        : { ok: false, error: 'مقدار باید یک عدد صحیح باشد.' };
    }
    case 'boolean':
      return { ok: true, value: trimmed === 'true' };
    case 'json':
      try {
        return { ok: true, value: JSON.parse(trimmed) };
      } catch {
        return { ok: false, error: 'مقدار JSON معتبر نیست.' };
      }
    default:
      return { ok: true, value: draft };
  }
}

/** Stable API error codes → safe Persian copy. Never includes submitted values. */
export function settingErrorMessage(code: string | undefined, status: number): string {
  switch (code) {
    case 'setting_version_conflict':
      return 'این تنظیم هم‌زمان تغییر کرده است. صفحه را تازه‌سازی کنید و دوباره تلاش کنید.';
    case 'setting_forbidden':
      return 'مجوز لازم برای این کار را ندارید.';
    case 'setting_override_denied':
      return 'سازمان اجازهٔ بازنویسی این تنظیم در فضای کاری را نداده است.';
    case 'setting_organization_unavailable':
      return 'سازمان در وضعیت فعلی قابل ویرایش نیست (تعلیق یا پایان‌یافته).';
    case 'setting_module_disabled':
    case 'setting_module_unavailable':
      return 'ماژول صاحب این تنظیم در این فضا فعال نیست؛ مقدار ذخیره‌شده حفظ شده و قابل ویرایش نیست.';
    case 'setting_revision_not_found':
      return 'نسخهٔ درخواستی یافت نشد.';
    case 'setting_history_unavailable':
      return 'برای این تنظیم تاریخچه‌ای در دسترس نیست.';
    case 'setting_not_found':
      return 'این تنظیم ثبت نشده است.';
    case 'setting_locale_invalid':
      return 'زبان انتخاب‌شده معتبر نیست.';
    case 'setting_timezone_invalid':
      return 'منطقهٔ زمانی انتخاب‌شده معتبر نیست.';
    case 'setting_value_too_long':
      return 'مقدار واردشده بیش از حد مجاز طولانی است.';
    case 'setting_not_nullable':
      return 'این تنظیم نمی‌تواند خالی باشد.';
    default:
      if (status === 401) return 'نشست شما پایان یافته است؛ دوباره وارد شوید.';
      if (status === 403) return 'مجوز لازم برای این کار را ندارید.';
      if (status === 404) return 'مورد درخواستی یافت نشد.';
      if (status === 409) return 'وضعیت فعلی با این کار سازگار نیست.';
      if (status === 422) return 'مقدار واردشده معتبر نیست.';
      return 'خطایی رخ داد. دوباره تلاش کنید.';
  }
}

export function operationLabel(operation: string): string {
  switch (operation) {
    case 'create':
      return 'ایجاد';
    case 'update':
      return 'ویرایش';
    case 'remove':
      return 'حذف مقدار صریح';
    case 'restore':
      return 'بازگردانی';
    default:
      return operation;
  }
}
