/**
 * DS-2.1 notification queue logic (pure, unit-testable).
 *
 * The React viewport lives in Notifications.tsx; every queue rule —
 * dedupe window, capacity, default lifetime — is decided here so it
 * can be tested without a DOM.
 */

export type ToastKind = 'success' | 'error' | 'warning' | 'info';

export interface ToastInput {
  kind: ToastKind;
  title: string;
  description?: string;
  /** UX-02-4: optional inline action (e.g. Undo for reversible ops). */
  action?: { label: string; onClick: () => void };
  /** Explicit dedupe identity; defaults to kind+title+description. */
  dedupeKey?: string;
  /** Milliseconds until auto-dismiss; null = stays until dismissed. */
  durationMs?: number | null;
}

export interface ToastRecord extends Required<Pick<ToastInput, 'kind' | 'title'>> {
  id: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  dedupeKey: string;
  durationMs: number | null;
  createdAt: number;
}

/** Sensible defaults: calm confirmations fade, important errors stay. */
export function defaultToastDuration(kind: ToastKind): number | null {
  switch (kind) {
    case 'success':
    case 'info':
      return 5000;
    case 'warning':
      return 8000;
    case 'error':
      return null; // errors remain accessible until the user dismisses them
  }
}

/** Repeated identical notifications inside this window are suppressed. */
export const TOAST_DEDUPE_WINDOW_MS = 4000;

/** The stack never grows past this; older calm toasts yield first. */
export const TOAST_MAX_VISIBLE = 5;

export function toastDedupeKey(input: ToastInput): string {
  return input.dedupeKey ?? `${input.kind}:${input.title}:${input.description ?? ''}`;
}

export function createToastRecord(input: ToastInput, id: string, now: number): ToastRecord {
  return {
    id,
    kind: input.kind,
    title: input.title,
    description: input.description,
    action: input.action,
    dedupeKey: toastDedupeKey(input),
    durationMs: input.durationMs !== undefined ? input.durationMs : defaultToastDuration(input.kind),
    createdAt: now,
  };
}

/**
 * Add a toast to the stack. Returns the next stack plus whether the
 * incoming toast was suppressed as a duplicate (same dedupe key
 * inside TOAST_DEDUPE_WINDOW_MS — e.g. a burst of identical API
 * failures collapses into one visible notification).
 */
export function enqueueToast(
  current: readonly ToastRecord[],
  incoming: ToastRecord,
  maxVisible: number = TOAST_MAX_VISIBLE,
): { toasts: ToastRecord[]; suppressed: boolean } {
  const duplicate = current.some(
    toast => toast.dedupeKey === incoming.dedupeKey && incoming.createdAt - toast.createdAt < TOAST_DEDUPE_WINDOW_MS,
  );
  if (duplicate) return { toasts: [...current], suppressed: true };

  const next = [...current, incoming];
  while (next.length > maxVisible) {
    // Drop the oldest auto-dismissible toast first; persistent
    // errors are the last to be evicted.
    const evictable = next.findIndex(toast => toast.durationMs !== null);
    next.splice(evictable >= 0 ? evictable : 0, 1);
  }
  return { toasts: next, suppressed: false };
}

export function dismissToastFrom(current: readonly ToastRecord[], id: string): ToastRecord[] {
  return current.filter(toast => toast.id !== id);
}
