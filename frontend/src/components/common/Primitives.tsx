import React, { useLayoutEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, LoaderCircle } from 'lucide-react';
import { parseApiError } from '../../api/errors';
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
export function FormField({ label, error, children, htmlFor }: { label: string; error?: string; children: React.ReactNode; htmlFor: string }) {
  return <div className="space-y-1.5"><label htmlFor={htmlFor} className="block text-sm font-bold">{label}</label>{children}{error && <p id={`${htmlFor}-error`} role="alert" className="text-sm text-red-700">{error}</p>}</div>;
}
export function LoadingState({ label = 'در حال بارگذاری…' }: { label?: string }) {
  return <div role="status" aria-live="polite" className="flex items-center justify-center p-4 sm:p-6">
    <div className="inline-flex max-w-full items-center gap-2.5 rounded-xl bg-white px-3.5 py-2.5 text-xs font-bold text-slate-600">
      <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-indigo-600" aria-hidden />
      <span className="truncate">{label}</span>
    </div>
  </div>;
}
export function EmptyState({ title = 'هنوز رکوردی ثبت نشده است.', children }: { title?: string; children?: React.ReactNode }) { return <section className="p-8 text-center text-slate-500"><p>{title}</p>{children}</section>; }
export function ErrorState({ error, onRetry, title }: { error?: unknown; onRetry?: () => void; title?: string }) { return <section role="alert" className="p-8 text-center space-y-4"><p>{title || parseApiError(error).message}</p>{onRetry && <Button variant="secondary" onClick={onRetry}>تلاش مجدد</Button>}</section>; }
export const Skeleton = () => <div aria-hidden className="h-12 rounded-lg bg-slate-200 animate-pulse" />;
export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) { return <header className="flex flex-wrap justify-between items-center gap-4 mb-5"><div className="min-w-0 max-w-full"><h1 className="text-xl font-black break-words">{title}</h1>{description && <p className="text-sm text-slate-500 mt-2">{description}</p>}</div>{actions}</header>; }
let locks = 0; let previousOverflow = '';
const modalStack: HTMLElement[] = [];
export function Modal({ open, onClose, title, description, icon, children, busy = false, drawer = false, size = 'lg', panelScroll = true }: { open: boolean; onClose: () => void; title: React.ReactNode; description?: React.ReactNode; icon?: React.ReactNode; children: React.ReactNode; busy?: boolean; drawer?: boolean; size?: 'md' | 'lg' | 'xl'; panelScroll?: boolean }) {
  const panel = useRef<HTMLDivElement>(null); const titleId = useId(); const close = useRef(onClose); close.current = onClose;
  useLayoutEffect(() => {
    const element = panel.current;
    if (!open || !element) return;
    modalStack.push(element);
    const previous = document.activeElement as HTMLElement | null;
    if (locks++ === 0) { previousOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; }
    panel.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented || modalStack.at(-1) !== element) return;
      if (event.key === 'Escape') { event.preventDefault(); close.current(); }
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
  if (!open) return null;
  return createPortal(<div className={`fixed inset-0 z-[80] bg-slate-900/60 backdrop-blur-xs flex animate-in fade-in duration-200 ${drawer ? 'justify-end p-0 sm:p-3' : 'p-3 items-center justify-center'}`} dir="rtl" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className={`ui-modal bg-white shadow-2xl border border-slate-200 ${panelScroll ? 'overflow-auto' : 'overflow-hidden'} w-full outline-none ${drawer ? 'max-w-xl h-full sm:h-auto rounded-none sm:rounded-3xl max-h-dvh sm:max-h-[94dvh]' : `${size === 'md' ? 'max-w-xl' : size === 'xl' ? 'max-w-4xl' : 'max-w-2xl'} rounded-3xl max-h-[94dvh]`}`}>
      <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-slate-100 bg-white px-5 py-4.5 sm:px-6">
        <div className="flex items-center gap-3 min-w-0">
          {icon && <span className="w-10 h-10 shrink-0 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">{icon}</span>}
          <div className="min-w-0"><h2 id={titleId} className="text-sm sm:text-base font-extrabold text-slate-900 break-words">{title}</h2>{description && <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 break-words">{description}</p>}</div>
        </div>
        <IconButton label={busy ? 'لغو عملیات و بستن' : 'بستن'} purpose="close" variant="ghost" onClick={onClose} className="shrink-0"><X className="w-5 h-5" /></IconButton>
      </header>{children}
    </div></div>, document.body);
}
export const Drawer = (props: React.ComponentProps<typeof Modal>) => <Modal {...props} drawer />;
export function ConfirmDialog({ open, onClose, onConfirm, title, busy, error, confirmAction }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; busy?: boolean; error?: string; confirmAction?: ButtonAction }) {
  const confirmVariant = confirmAction && confirmAction !== 'delete' ? 'primary' : 'danger';
  return <Modal open={open} onClose={onClose} title={title} busy={busy}><div className="p-4 space-y-4">{error && <ErrorState title={error} />}<div className="flex justify-end gap-2"><Button action="cancel" variant="secondary" onClick={onClose}>انصراف</Button><Button action={confirmAction} variant={confirmVariant} loading={busy} onClick={onConfirm}>تأیید</Button></div></div></Modal>;
}
