import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import {
  createToastRecord,
  dismissToastFrom,
  enqueueToast,
  type ToastInput,
  type ToastKind,
  type ToastRecord,
} from './notificationLogic';

export type { ToastInput, ToastKind, ToastRecord };

/**
 * DS-2.1 — one application-level notification service.
 *
 * `ToastProvider` is mounted once at the app root and renders the
 * stack. Any code (components, contexts, plain modules) can call the
 * imperative `toast.success(...)` / `toast.error(...)` /
 * `toast.warning(...)` / `toast.info(...)` helpers; calls made before
 * the provider mounts are queued and flushed on mount.
 *
 * Safety rule: titles/descriptions must be calm, user-safe text.
 * Never pass raw API payloads, credentials or sensitive record data
 * into a toast — summarize the outcome instead.
 */

type ToastOptions = Omit<ToastInput, 'kind' | 'title'>;

let sequence = 0;
const nextId = () => `toast-${Date.now().toString(36)}-${(sequence += 1).toString(36)}`;

let pushHandler: ((input: ToastInput) => string) | null = null;
const pendingQueue: ToastInput[] = [];

function pushToast(input: ToastInput): string {
  if (pushHandler) return pushHandler(input);
  pendingQueue.push(input);
  return nextId();
}

export const toast = {
  show: (input: ToastInput): string => pushToast(input),
  success: (title: string, options?: ToastOptions): string => pushToast({ ...options, kind: 'success', title }),
  error: (title: string, options?: ToastOptions): string => pushToast({ ...options, kind: 'error', title }),
  warning: (title: string, options?: ToastOptions): string => pushToast({ ...options, kind: 'warning', title }),
  info: (title: string, options?: ToastOptions): string => pushToast({ ...options, kind: 'info', title }),
};

const ToastContext = React.createContext<{ show: (input: ToastInput) => string; dismiss: (id: string) => void } | null>(null);

export function useToast() {
  const context = React.useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>');
  return {
    show: context.show,
    dismiss: context.dismiss,
    success: (title: string, options?: ToastOptions) => context.show({ ...options, kind: 'success', title }),
    error: (title: string, options?: ToastOptions) => context.show({ ...options, kind: 'error', title }),
    warning: (title: string, options?: ToastOptions) => context.show({ ...options, kind: 'warning', title }),
    info: (title: string, options?: ToastOptions) => context.show({ ...options, kind: 'info', title }),
  };
}

const KIND_ICON: Record<ToastKind, React.ReactNode> = {
  success: <CheckCircle2 className="h-4.5 w-4.5 text-emerald-600" aria-hidden />,
  error: <XCircle className="h-4.5 w-4.5 text-rose-600" aria-hidden />,
  warning: <AlertTriangle className="h-4.5 w-4.5 text-amber-600" aria-hidden />,
  info: <Info className="h-4.5 w-4.5 text-sky-600" aria-hidden />,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const timers = useRef(new Map<string, number>());

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts(current => dismissToastFrom(current, id));
  }, []);

  const schedule = useCallback((record: ToastRecord) => {
    if (record.durationMs === null) return;
    const timer = window.setTimeout(() => dismiss(record.id), record.durationMs);
    timers.current.set(record.id, timer);
  }, [dismiss]);

  const show = useCallback((input: ToastInput): string => {
    const record = createToastRecord(input, nextId(), Date.now());
    setToasts(current => {
      const result = enqueueToast(current, record);
      if (!result.suppressed) schedule(record);
      return result.toasts;
    });
    return record.id;
  }, [schedule]);

  useEffect(() => {
    pushHandler = show;
    // Flush anything queued before the provider mounted.
    while (pendingQueue.length > 0) {
      const queued = pendingQueue.shift();
      if (queued) show(queued);
    }
    return () => {
      if (pushHandler === show) pushHandler = null;
    };
  }, [show]);

  useEffect(() => () => {
    timers.current.forEach(timer => window.clearTimeout(timer));
    timers.current.clear();
  }, []);

  const pause = (record: ToastRecord) => {
    const timer = timers.current.get(record.id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timers.current.delete(record.id);
    }
  };

  return (
    <ToastContext.Provider value={{ show, dismiss }}>
      {children}
      {toasts.length > 0 && (
        <div className="ui-toast-viewport" dir="rtl">
          {toasts.map(record => (
            <div
              key={record.id}
              role={record.kind === 'error' || record.kind === 'warning' ? 'alert' : 'status'}
              className={`ui-toast ui-toast-${record.kind}`}
              onMouseEnter={() => pause(record)}
              onMouseLeave={() => schedule(record)}
              onFocus={() => pause(record)}
              onBlur={() => schedule(record)}
              onKeyDown={event => {
                if (event.key === 'Escape') dismiss(record.id);
              }}
            >
              <span className="mt-0.5 shrink-0">{KIND_ICON[record.kind]}</span>
              <div className="min-w-0 flex-1">
                <p className="ui-toast-title">{record.title}</p>
                {record.description && <p className="ui-toast-description">{record.description}</p>}
              </div>
              <button
                type="button"
                onClick={() => dismiss(record.id)}
                className="shrink-0 cursor-pointer rounded-lg p-1 text-slate-400 transition-colors hover:bg-white/60 hover:text-slate-700"
                aria-label="بستن اعلان"
                title="بستن"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}

/**
 * Inline Alert — persistent, page-level message. Unlike a toast it
 * stays until the surrounding state changes (or the user closes it),
 * which makes it right for form-level and section-level feedback.
 */
export function Alert({
  tone = 'info',
  title,
  description,
  children,
  onClose,
  actions,
  className = '',
}: {
  tone?: ToastKind;
  title: string;
  description?: string;
  children?: React.ReactNode;
  onClose?: () => void;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div role={tone === 'error' || tone === 'warning' ? 'alert' : 'status'} className={`ui-alert ui-alert-${tone} ${className}`} dir="rtl">
      <span className="mt-0.5 shrink-0">{KIND_ICON[tone]}</span>
      <div className="min-w-0 flex-1">
        <p className="ui-alert-title">{title}</p>
        {description && <p className="ui-alert-description">{description}</p>}
        {children}
        {actions && <div className="mt-2 flex flex-wrap gap-2">{actions}</div>}
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 cursor-pointer rounded-lg p-1 text-slate-400 transition-colors hover:bg-white/60 hover:text-slate-700"
          aria-label="بستن پیام"
          title="بستن"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      )}
    </div>
  );
}
