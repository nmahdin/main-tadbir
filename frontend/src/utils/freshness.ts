/**
 * نشانگر «تازه» برای تغییرات دیگران (دور ۹۹).
 *
 * هر فهرست، هنگام خروج، زمان دیدن خودش را در `localStorage` ذخیره می‌کند. در
 * بازدید بعدی، هر ردیفی که `updated_at` آن **بعد از** آن زمان باشد یک نقطهٔ
 * آبی کوچک می‌گیرد؛ به‌محض باز کردن ردیف، نقطه برداشته می‌شود.
 *
 * قاعده‌های ایمنی:
 * - داده‌ای که هیچ مهر زمانی ندارد «تازه» علامت نمی‌خورد؛ هیچ چیزی حدس زده
 *   نمی‌شود.
 * - اولین بازدید از یک فهرست (بدون زمان ذخیره‌شده) هیچ نقطه‌ای نشان نمی‌دهد؛
 *   وگرنه همهٔ ردیف‌ها «تازه» می‌شدند و نشانگر بی‌معنا بود.
 * - در محیط خصوصی/ممنوع‌کوکی، دسترسی به `localStorage` خطا می‌دهد؛ آن‌جا
 *   قابلیت بی‌صدا خاموش می‌شود، نه اینکه صفحه بشکند.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const KEY_PREFIX = 'tadbir:last-seen:';

type Clock = { now: () => number };
const clock: Clock = { now: () => Date.now() };

const storage = (): Storage | null => {
  try {
    const candidate = typeof window === 'undefined' ? null : window.localStorage;
    // برخی مرورگرها شیء می‌دهند ولی نوشتن خطا می‌اندازد؛ یک آزمون کوچک.
    if (!candidate) return null;
    const probe = `${KEY_PREFIX}__probe__`;
    candidate.setItem(probe, '1');
    candidate.removeItem(probe);
    return candidate;
  } catch {
    return null;
  }
};

/** زمان آخرین بازدید این فهرست (میلی‌ثانیه) یا `null` اگر هرگز دیده نشده باشد. */
export function readLastSeen(scope: string): number | null {
  const store = storage();
  if (!store) return null;
  const raw = store.getItem(`${KEY_PREFIX}${scope}`);
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function markLastSeen(scope: string, at: number = clock.now()): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(`${KEY_PREFIX}${scope}`, String(at));
  } catch {
    // سهمیه پر است؛ نشانگر تازه مهم‌تر از این خطا نیست.
  }
}

/** برای تست: پاک‌کردن یک فهرست یا همهٔ آن‌ها. */
export function forgetLastSeen(scope?: string): void {
  const store = storage();
  if (!store) return;
  if (scope) { store.removeItem(`${KEY_PREFIX}${scope}`); return; }
  Object.keys(store)
    .filter(key => key.startsWith(KEY_PREFIX))
    .forEach(key => store.removeItem(key));
}

/**
 * مهر زمانی یک رکورد. سرور `updated_at` می‌دهد و دادهٔ نمایشی `updatedAt`؛ هر
 * دو پذیرفته می‌شوند تا نشانگر در هر دو حالت کار کند.
 */
export function recordStamp(row: unknown): number | null {
  if (!row || typeof row !== 'object') return null;
  const record = row as Record<string, unknown>;
  const raw = record.updated_at ?? record.updatedAt ?? record.last_activity_at ?? record.lastActivityAt;
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

/** آیا این رکورد بعد از زمان مرجع تغییر کرده است؟ */
export function isFreshSince(row: unknown, baseline: number | null): boolean {
  if (baseline === null) return false;
  const stamp = recordStamp(row);
  if (stamp === null) return false;
  return stamp > baseline;
}

export type FreshRecords = {
  /** آیا این ردیف باید نقطهٔ «تازه» بگیرد؟ */
  isFresh: (row: unknown) => boolean;
  /** باز شدن یک ردیف؛ نقطهٔ آن بی‌درنگ برداشته می‌شود. */
  markOpened: (id: string | number) => void;
};

/**
 * وضعیت «تازه» برای یک فهرست.
 *
 * زمان مرجع **یک بار** در ورود خوانده می‌شود (نه در هر رندر) و زمان دیدن جدید
 * هنگام خروج نوشته می‌شود؛ بنابراین نقطه‌ها در طول همان بازدید ناپدید نمی‌شوند
 * و در بازدید بعد دیگر برنمی‌گردند.
 */
export function useFreshRecords(scope: string, rows: ReadonlyArray<unknown>): FreshRecords {
  const baseline = useMemo(() => readLastSeen(scope), [scope]);
  const [opened, setOpened] = useState<Set<string>>(() => new Set());
  const openedRef = useRef(opened);
  openedRef.current = opened;

  // با تغییر فهرست (مثلاً رفتن از وظایف به محتوا) زمان دیدنِ فهرست قبلی ثبت و
  // مجموعهٔ بازشده‌ها پاک می‌شود.
  useEffect(() => {
    setOpened(new Set());
    return () => markLastSeen(scope);
  }, [scope]);

  // پس از پایان بارگذاری هم یک بار ثبت می‌کنیم؛ اگر کاربر تب را ببندد و افکت
  // پاک‌سازی اجرا نشود، بازدید بعدی همان لحظه را مرجع می‌گیرد، نه چند روز قبل.
  const counted = useRef(false);
  useEffect(() => {
    if (counted.current || !rows.length) return;
    counted.current = true;
    markLastSeen(scope);
  }, [rows.length, scope]);

  const isFresh = useCallback((row: unknown) => {
    const id = (row as { id?: string | number } | null)?.id;
    if (id !== undefined && openedRef.current.has(String(id))) return false;
    return isFreshSince(row, baseline);
  }, [baseline]);

  const markOpened = useCallback((id: string | number) => {
    setOpened(current => {
      if (current.has(String(id))) return current;
      const next = new Set(current);
      next.add(String(id));
      return next;
    });
  }, []);

  return { isFresh, markOpened };
}
