import { useRef, useState } from 'react';
import { snapshotSession } from './serverSnapshots';

/**
 * Serialize writes per entity. Server success is the only point where cache/UI changes.
 *
 * خطای آخرین فرمان هر کلید هم نگه داشته می‌شود: `run` فقط `null` برمی‌گرداند،
 * پس فرم‌هایی که باید دلیل دقیق سرور را نشان دهند (مثل ذخیرهٔ جریان محتوا یا
 * ثبت خروجی مرحله) با `lastError` همان خطا را می‌خوانند و پیام مبهم نمایش
 * نمی‌دهند.
 */
export function useConfirmedCommand(onError: (key: string, error: unknown) => void) {
  const tails = useRef(new Map<string, Promise<unknown>>());
  const failures = useRef(new Map<string, unknown>());
  const [pendingKeys, setPendingKeys] = useState<string[]>([]);
  const run = <T,>(key: string, operation: () => Promise<T>, accept: (result: T) => void): Promise<T | null> => {
    const session = snapshotSession();
    const scopedKey = `${session.epoch}:${key}`;
    const previous = tails.current.get(scopedKey) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(async () => {
      if (session !== snapshotSession()) return null;
      try {
        const result = await operation();
        if (session !== snapshotSession()) return null;
        accept(result);
        failures.current.delete(key);
        return result;
      } catch (error) {
        failures.current.set(key, error);
        if (session === snapshotSession()) onError(key, error);
        return null;
      }
    });
    tails.current.set(scopedKey, next);
    setPendingKeys([...tails.current.keys()].map(value => value.slice(value.indexOf(':') + 1)));
    void next.finally(() => {
      if (tails.current.get(scopedKey) === next) tails.current.delete(scopedKey);
      setPendingKeys([...tails.current.keys()].map(value => value.slice(value.indexOf(':') + 1)));
    });
    return next;
  };
  /** خطای آخرین فرمان ناموفق همان کلید؛ برای نمایش دلیل دقیق سرور در فرم. */
  const lastError = (key: string): unknown => failures.current.get(key);

  return { run, pendingKeys, lastError };
}
