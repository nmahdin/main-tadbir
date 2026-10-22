import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * UX-02-3-FINAL (F03/F04): local draft autosave for long forms.
 * Drafts are namespaced per authenticated user so a shared browser
 * never leaks one person's unfinished form to another. They hold UI
 * form state only — never credentials or tokens — and are cleared on
 * successful submit or explicit discard.
 */
export interface FormDraft<T> {
  value: T;
  savedAt: string;
}

export function draftStorageKey(userId: string | number, key: string): string {
  return `tadbir:draft:${userId}:${key}`;
}

export function readFormDraft<T>(userId: string | number, key: string): FormDraft<T> | null {
  try {
    const raw = localStorage.getItem(draftStorageKey(userId, key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FormDraft<T>;
    if (!parsed || typeof parsed !== 'object' || !('value' in parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeFormDraft<T>(userId: string | number, key: string, value: T): void {
  try {
    localStorage.setItem(draftStorageKey(userId, key), JSON.stringify({ value, savedAt: new Date().toISOString() }));
  } catch {
    /* storage unavailable or full — the form itself still works */
  }
}

export function clearFormDraft(userId: string | number, key: string): void {
  try {
    localStorage.removeItem(draftStorageKey(userId, key));
  } catch {
    /* ignore */
  }
}

/**
 * Debounced autosave hook: while `enabled`, persists `value` shortly
 * after it stops changing and reports whether a saved draft exists.
 */
export function useFormDraft<T>(userId: string | number, key: string, value: T, enabled = true) {
  const [hasDraft, setHasDraft] = useState(false);
  const valueJson = JSON.stringify(value);
  const latest = useRef(value);
  latest.current = value;

  useEffect(() => {
    setHasDraft(readFormDraft(userId, key) !== null);
  }, [userId, key]);

  useEffect(() => {
    if (!enabled) return;
    const timer = setTimeout(() => {
      writeFormDraft(userId, key, latest.current);
      setHasDraft(true);
    }, 700);
    return () => clearTimeout(timer);
    // valueJson captures value changes without re-running on identity churn
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueJson, enabled, userId, key]);

  const discard = useCallback(() => {
    clearFormDraft(userId, key);
    setHasDraft(false);
  }, [userId, key]);

  return { hasDraft, discard };
}
