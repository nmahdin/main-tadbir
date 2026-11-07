import React, { useLayoutEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, LoaderCircle, RefreshCw, WifiOff, X } from 'lucide-react';
import { parseApiError } from '../../api/errors';
import { MODAL_EXIT_MS, prefersReducedMotion, useModalExit } from './useModalExit';
export { Avatar } from './Avatar';
export { PersianDatePicker as DateInput } from './PersianDatePicker';
export { PriorityPill as PriorityBadge, TaskStatusBadge as StatusBadge } from './PriorityPill';
export type ButtonAction = 'save' | 'cancel' | 'delete' | 'create';
export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'warning'; loading?: boolean; action?: ButtonAction };
/** فقط اکشن‌های فرمِ ذخیره، انصراف، حذف و ایجاد جدید از الگوی فشرده استفاده می‌کنند. */
export const FORM_ACTION_REFERENCE_CLASS = 'inline-flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold shadow-2xs transition-colors cursor-pointer';
export function Button({ variant = 'primary', action, loading, disabled, children, className = '', ...props }: ButtonProps) {
  const actionClass = action ? `ui-form-action ui-form-action-${action} ${FORM_ACTION_REFERENCE_CLASS}` : '';
  return <button type="button" {...props} data-button-action={action} disabled={disabled || loading} aria-busy={loading || undefined} className={`ui-button ui-button-${variant} ${actionClass} ${className}`}>{loading && <LoaderCircle aria-hidden className="w-4 h-4 animate-spin" />}{children}</button>;
}
export function IconButton({ label, purpose = 'default', className = '', ...props }: ButtonProps & { label: string; purpose?: 'default' | 'back' | 'close' }) {
  return <Button {...props} className={`ui-icon-button ui-icon-button-${purpose} ${className}`} aria-label={label} title={label} />;
}
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>((props, ref) => <input {...props} ref={ref} className={`ui-input ${props.className ?? ''}`} />);
export const Textarea = (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} className={`ui-input ${props.className ?? ''}`} />;
export const Select = (props: React.SelectHTMLAttributes<HTMLSelectElement>) => <select {...props} className={`ui-input ${props.className ?? ''}`} />;
export function FormField({ label, error, children, htmlFor, required = false }: { label: string; error?: string; children: React.ReactNode; htmlFor: string; required?: boolean }) {
  return <div className="space-y-1.5"><label htmlFor={htmlFor} className="block text-sm font-bold">{label}{required && <> <span className="text-rose-500" aria-hidden="true">*</span></>}</label>{children}{error && <p id={`${htmlFor}-error`} role="alert" className="text-sm text-red-700">{error}</p>}</div>;
}
export function LoadingState({ label = 'در حال بارگذاری…' }: { label?: string }) {
  return <div role="status" aria-live="polite" className="flex items-center justify-center p-4 sm:p-6">
    <div className="inline-flex max-w-full items-center gap-2.5 rounded-xl bg-white px-3.5 py-2.5 text-xs font-bold text-slate-600">
      {/* نشانگر بارگذاری بخش‌ها/فهرست‌ها: با همان سرعت لودینگ‌های سطح صفحه
          می‌چرخد تا هنگام کلیک روی یک ردیف، انتظار کند حس نشود. */}
      <LoaderCircle className="ui-spin-fast h-4 w-4 shrink-0 animate-spin text-indigo-600" aria-hidden />
      <span className="truncate">{label}</span>
    </div>
  </div>;
}
export function EmptyState({ title = 'هنوز رکوردی ثبت نشده است.', children }: { title?: string; children?: React.ReactNode }) { return <section className="p-8 text-center text-slate-500"><p>{title}</p>{children}</section>; }
export function ErrorState({ error, onRetry, title }: { error?: unknown; onRetry?: () => void; title?: string }) {
  const parsed = parseApiError(error);
  // خطای اتصال شکل دیگری دارد: به‌جای هشدار قرمز، کارت آرام با آیکون شبکه و
  // راهنمای روشن نمایش داده می‌شود تا کاربر بداند مشکل از اینترنت است.
  const connection = parsed.status === 0 || /ارتباط با (سرور|اینترنت)|اینترنت/.test(parsed.message);
  return (
    <section
      role="alert"
      className={`m-4 flex flex-col items-center gap-3 rounded-2xl border p-6 text-center ${connection ? 'border-amber-200 bg-amber-50/70' : 'border-rose-200 bg-rose-50/70'}`}
    >
      <span className={`flex h-11 w-11 items-center justify-center rounded-2xl bg-white/80 ${connection ? 'text-amber-600' : 'text-rose-600'} ring-1 ${connection ? 'ring-amber-100' : 'ring-rose-100'}`}>
        {connection ? <WifiOff className="h-5 w-5" aria-hidden /> : <AlertTriangle className="h-5 w-5" aria-hidden />}
      </span>
      <div className="space-y-1">
        <p className="text-xs font-black text-slate-900">{title || (connection ? 'ارتباط برقرار نشد' : 'خطا در دریافت اطلاعات')}</p>
        <p className="mx-auto max-w-md text-[11px] leading-6 text-slate-600">
          {title ? parsed.message : (connection ? 'اتصال اینترنت یا دسترسی به سرور سامانه را بررسی کنید و دوباره تلاش کنید.' : parsed.message)}
        </p>
      </div>
      {onRetry && <Button variant="secondary" onClick={onRetry}><RefreshCw className="h-4 w-4" />تلاش دوباره</Button>}
    </section>
  );
}
export const Skeleton = () => <div aria-hidden className="h-12 rounded-lg bg-slate-200 animate-pulse" />;
export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) { return <header className="flex flex-wrap justify-between items-center gap-4 mb-5"><div className="min-w-0 max-w-full"><h1 className="text-xl font-black break-words">{title}</h1>{description && <p className="text-sm text-slate-500 mt-2">{description}</p>}</div>{actions}</header>; }
let locks = 0; let previousOverflow = '';
const modalStack: HTMLElement[] = [];
export function Modal({ open, onClose, title, description, icon, children, busy = false, drawer = false, size = 'lg', panelScroll = true }: { open: boolean; onClose: () => void; title: React.ReactNode; description?: React.ReactNode; icon?: React.ReactNode; children: React.ReactNode; busy?: boolean; drawer?: boolean; size?: 'md' | 'lg' | 'xl'; panelScroll?: boolean }) {
  const panel = useRef<HTMLDivElement>(null); const titleId = useId(); const close = useRef(onClose); close.current = onClose;
  /**
   * انیمیشن ورود/خروج: `requestClose` اول کادر را در حالت `closing` نگه می‌دارد
   * و سپس `onClose` والد را صدا می‌زند تا بسته‌شدن ناگهانی نباشد.
   */
  const presence = useModalExit(open, onClose);
  const requestClose = presence.requestClose;
  const startExit = presence.startExit;
  const requestCloseRef = useRef(requestClose); requestCloseRef.current = requestClose;
  /**
   * دکمه‌های «انصراف»/«بستن» پای مدال‌ها `onClose` والد را مستقیم صدا می‌زنند و
   * همین باعث می‌شد مدال بدون انیمیشن ناپدید شود. اینجا کلیک در فاز capture
   * گرفته می‌شود: اول انیمیشن خروج اجرا می‌شود، بعد همان کلیک تکرار می‌شود تا
   * منطق خودِ دکمه (پاک‌سازی فرم، بستن والد) هم اجرا شود.
   */
  const replaying = useRef(false);
  const interceptDismiss = (event: React.MouseEvent<HTMLDivElement>) => {
    if (replaying.current) { replaying.current = false; return; }
    if (busy) return;
    const target = event.target as HTMLElement | null;
    const dismiss = target?.closest<HTMLElement>('[data-button-action="cancel"], [data-modal-close]');
    if (!dismiss) return;
    event.preventDefault();
    event.stopPropagation();
    const delay = prefersReducedMotion() ? 0 : MODAL_EXIT_MS;
    startExit();
    window.setTimeout(() => { replaying.current = true; dismiss.click(); }, delay);
    // اگر کلیک تکراری به این هندلر نرسید (دکمه همراه مدال حذف شد)، پرچم آزاد شود.
    window.setTimeout(() => { replaying.current = false; }, delay + 400);
  };
  useLayoutEffect(() => {
    const element = panel.current;
    if (!open || !element) return;
    modalStack.push(element);
    const previous = document.activeElement as HTMLElement | null;
    if (locks++ === 0) { previousOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; }
    panel.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented || modalStack.at(-1) !== element) return;
      if (event.key === 'Escape') { event.preventDefault(); requestCloseRef.current(); }
      if (event.key === 'Tab') {
        const focusable = (Array.from(panel.current.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex="0"]')) as HTMLElement[]).filter(el => el.getClientRects().length);
        const first = focusable[0]; const last = focusable.at(-1);
        if (!first) { event.preventDefault(); return; }
        if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current || !element.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current || !element.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', key);
    return () => { const index = modalStack.indexOf(element); if (index >= 0) modalStack.splice(index,1); document.removeEventListener('keydown', key); if (--locks === 0) document.body.style.overflow = previousOverflow; if (previous?.isConnected) previous.focus(); else (modalStack.at(-1) || document.querySelector<HTMLElement>('main'))?.focus(); };
  }, [open]);
  // تا پایان انیمیشن خروج (حتی وقتی دکمهٔ «انصراف» بستن را صدا می‌زند) در DOM می‌ماند.
  if (!presence.visible) return null;
  const state = presence.state;
  return createPortal(<div data-state={state} className={`ui-modal-overlay fixed inset-0 z-[80] bg-slate-900/60 backdrop-blur-xs flex ${drawer ? 'justify-end p-0 sm:p-3' : 'p-3 items-center justify-center'}`} dir="rtl" onMouseDown={e => { if (e.target === e.currentTarget) requestClose(); }}>
    <div ref={panel} data-state={state} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onClickCapture={interceptDismiss} className={`ui-modal ui-modal-panel flex flex-col overflow-hidden bg-white shadow-2xl border border-slate-200 w-full outline-none ${drawer ? 'max-w-xl h-full sm:h-auto rounded-none sm:rounded-3xl max-h-dvh sm:max-h-[94dvh]' : `${size === 'md' ? 'max-w-xl' : size === 'xl' ? 'max-w-4xl' : 'max-w-2xl'} rounded-3xl max-h-[94dvh]`}`}>
      <header className="z-10 flex shrink-0 items-center justify-between gap-4 border-b border-slate-100 bg-white px-5 py-4.5 sm:px-6">
        <div className="flex items-center gap-3 min-w-0">
          {icon && <span className="w-10 h-10 shrink-0 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">{icon}</span>}
          <div className="min-w-0"><h2 id={titleId} className="text-sm sm:text-base font-extrabold text-slate-900 break-words">{title}</h2>{description && <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 break-words">{description}</p>}</div>
        </div>
        <IconButton label={busy ? 'لغو عملیات و بستن' : 'بستن'} purpose="close" variant="ghost" onClick={requestClose} className="shrink-0"><X className="w-5 h-5" /></IconButton>
      </header>{panelScroll
        // یک ناحیهٔ پیمایش مشترک برای بدنهٔ مدال: خودِ کادر مدال هرگز جداگانه
        // اسکرول نمی‌شود تا در مرورگر دو نوار پیمایش روی هم دیده نشود.
        ? <div data-modal-body className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
        : children}
    </div></div>, document.body);
}
export const Drawer = (props: React.ComponentProps<typeof Modal>) => <Modal {...props} drawer />;
export function ConfirmDialog({ open, onClose, onConfirm, title, busy, error, confirmAction }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; busy?: boolean; error?: string; confirmAction?: ButtonAction }) {
  const confirmVariant = confirmAction && confirmAction !== 'delete' ? 'primary' : 'danger';
  return <Modal open={open} onClose={onClose} title={title} busy={busy}><div className="p-4 space-y-4">{error && <ErrorState title={error} />}<div className="flex justify-end gap-2"><Button action="cancel" variant="secondary" onClick={onClose}>انصراف</Button><Button action={confirmAction} variant={confirmVariant} loading={busy} onClick={onConfirm}>تأیید</Button></div></div></Modal>;
}
