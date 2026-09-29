import React, { useLayoutEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, LoaderCircle } from 'lucide-react';
import { parseApiError } from '../../api/errors';
export { Avatar } from './Avatar';
export { PersianDatePicker as DateInput } from './PersianDatePicker';
export { PriorityPill as PriorityBadge, TaskStatusBadge as StatusBadge } from './PriorityPill';
export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; loading?: boolean };
export function Button({ variant = 'primary', loading, disabled, children, className = '', ...props }: ButtonProps) {
  return <button type="button" {...props} disabled={disabled || loading} aria-busy={loading || undefined} className={`ui-button ui-button-${variant} ${className}`}>{loading && <LoaderCircle aria-hidden className="w-4 h-4 animate-spin" />}{children}</button>;
}
export function IconButton({ label, ...props }: ButtonProps & { label: string }) { return <Button {...props} aria-label={label} title={label} />; }
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>((props, ref) => <input {...props} ref={ref} className={`ui-input ${props.className ?? ''}`} />);
export const Textarea = (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} className={`ui-input ${props.className ?? ''}`} />;
export const Select = (props: React.SelectHTMLAttributes<HTMLSelectElement>) => <select {...props} className={`ui-input ${props.className ?? ''}`} />;
export function FormField({ label, error, children, htmlFor }: { label: string; error?: string; children: React.ReactNode; htmlFor: string }) {
  return <div className="space-y-1.5"><label htmlFor={htmlFor} className="block text-sm font-bold">{label}</label>{children}{error && <p id={`${htmlFor}-error`} role="alert" className="text-sm text-red-700">{error}</p>}</div>;
}
export function LoadingState({ label = 'در حال بارگذاری…' }: { label?: string }) { return <div role="status" className="p-10 text-center"><LoaderCircle className="mx-auto mb-3 animate-spin" aria-hidden />{label}</div>; }
export function EmptyState({ title = 'هنوز رکوردی ثبت نشده است.', children }: { title?: string; children?: React.ReactNode }) { return <section className="p-8 text-center text-slate-500"><p>{title}</p>{children}</section>; }
export function ErrorState({ error, onRetry, title }: { error?: unknown; onRetry?: () => void; title?: string }) { return <section role="alert" className="p-8 text-center space-y-4"><p>{title || parseApiError(error).message}</p>{onRetry && <Button variant="secondary" onClick={onRetry}>تلاش مجدد</Button>}</section>; }
export const Skeleton = () => <div aria-hidden className="h-12 rounded-lg bg-slate-200 animate-pulse" />;
export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) { return <header className="flex flex-wrap justify-between items-center gap-4 mb-5"><div className="min-w-0 max-w-full"><h1 className="text-xl font-black break-words">{title}</h1>{description && <p className="text-sm text-slate-500 mt-2">{description}</p>}</div>{actions}</header>; }
let locks = 0; let previousOverflow = '';
const modalStack: HTMLElement[] = [];
export function Modal({ open, onClose, title, children, busy = false, drawer = false }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; busy?: boolean; drawer?: boolean }) {
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
      if (event.key === 'Escape' && !busy) { event.preventDefault(); close.current(); }
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
  }, [open, busy]);
  if (!open) return null;
  return createPortal(<div className={`fixed inset-0 z-[80] bg-slate-900/60 flex ${drawer ? 'justify-end p-0 sm:p-3' : 'p-3 items-center justify-center'}`} dir="rtl" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
    <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className={`bg-white shadow-xl overflow-auto w-full outline-none ${drawer ? 'max-w-xl h-full sm:h-auto rounded-none sm:rounded-xl max-h-dvh sm:max-h-[94dvh]' : 'max-w-2xl rounded-xl max-h-[94dvh]'}`}>
      <header className="flex items-center justify-between p-4 border-b border-slate-200"><h2 id={titleId} className="font-bold min-w-0 break-words">{title}</h2><IconButton label="بستن" variant="ghost" disabled={busy} onClick={onClose}><X className="w-5 h-5" /></IconButton></header>{children}
    </div></div>, document.body);
}
export const Drawer = (props: React.ComponentProps<typeof Modal>) => <Modal {...props} drawer />;
export function ConfirmDialog({ open, onClose, onConfirm, title, busy, error }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; busy?: boolean; error?: string }) {
  return <Modal open={open} onClose={onClose} title={title} busy={busy}><div className="p-4 space-y-4">{error && <ErrorState title={error} />}<div className="flex justify-end gap-2"><Button variant="secondary" disabled={busy} onClick={onClose}>انصراف</Button><Button variant="danger" loading={busy} onClick={onConfirm}>تأیید</Button></div></div></Modal>;
}
