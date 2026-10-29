import React, { useEffect, useLayoutEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, LoaderCircle, Search, Inbox, SearchX, ShieldOff, TriangleAlert } from 'lucide-react';
import { parseApiError } from '../api/errors';
export { Avatar } from './Avatar';
export { PersianDatePicker as DateInput } from './PersianDatePicker';
export { PriorityPill as PriorityBadge, TaskStatusBadge as StatusBadge } from './PriorityPill';
export type ButtonAction = 'save' | 'cancel' | 'delete' | 'create';
export type ButtonShape = 'pill' | 'rounded';
export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'warning'; size?: 'sm' | 'md' | 'lg'; shape?: ButtonShape; tone?: 'primary' | 'success' | 'danger' | 'warning' | 'neutral'; loading?: boolean; action?: ButtonAction };
/** فقط اکشن‌های فرمِ ذخیره، انصراف، حذف و ایجاد جدید از الگوی فشرده استفاده می‌کنند. */
export const FORM_ACTION_REFERENCE_CLASS = 'inline-flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold shadow-2xs transition-colors cursor-pointer';
export function Button({ variant = 'primary', size = 'md', shape = 'rounded', tone, action, loading, disabled, children, className = '', ...props }: ButtonProps) {
  const actionClass = action ? `ui-form-action ui-form-action-${action} ${FORM_ACTION_REFERENCE_CLASS}` : '';
  return <button type="button" {...props} data-button-action={action} data-button-shape={shape} disabled={disabled || loading} aria-busy={loading || undefined} className={`ui-button ui-button-${variant} ui-button-${size} ui-button-${shape} ${tone ? `ui-button-tone-${tone}` : ''} ${actionClass} ${className}`}>{loading && <LoaderCircle aria-hidden className="w-4 h-4 animate-spin" />}{children}</button>;
}
export function IconButton({ label, purpose = 'default', className = '', ...props }: ButtonProps & { label: string; purpose?: 'default' | 'back' | 'close' }) {
  return <Button {...props} className={`ui-icon-button ui-icon-button-${purpose} ${className}`} aria-label={label} title={label} />;
}
export type ControlProps<T> = T & { invalid?: boolean };
export const Input = React.forwardRef<HTMLInputElement, ControlProps<React.InputHTMLAttributes<HTMLInputElement>>>(({ invalid, ...props }, ref) => <input {...props} ref={ref} aria-invalid={invalid || undefined} className={`ui-input ${invalid ? 'ui-input-invalid' : ''} ${props.className ?? ''}`} />);
export const Textarea = ({ invalid, ...props }: ControlProps<React.TextareaHTMLAttributes<HTMLTextAreaElement>>) => <textarea {...props} aria-invalid={invalid || undefined} className={`ui-input ${invalid ? 'ui-input-invalid' : ''} ${props.className ?? ''}`} />;

/**
 * Shared search field. The icon sits on the PHYSICAL left even in
 * RTL (text stays right-aligned Persian), with matching left padding
 * and an optional clear action. Use this instead of hand-rolling
 * icon/padding pairs in feature pages.
 */
export function SearchInput({ value, onChange, onClear, className = '', disabled, ...props }: ControlProps<React.InputHTMLAttributes<HTMLInputElement>> & { onClear?: () => void }) {
  const hasValue = value !== undefined && value !== null && String(value).length > 0;
  const clear = () => {
    if (onClear) { onClear(); return; }
    onChange?.({ target: { value: '' }, currentTarget: { value: '' } } as unknown as React.ChangeEvent<HTMLInputElement>);
  };
  return <div className={`relative ${className}`}>
    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
    <input {...props} type="search" value={value} onChange={onChange} disabled={disabled} className={`ui-input pl-10 ${hasValue ? 'pr-10' : ''}`} />
    {hasValue && !disabled && (
      <button type="button" onClick={clear} aria-label="پاک‌کردن جست‌وجو" title="پاک‌کردن جست‌وجو" className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700">
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    )}
  </div>;
}
// DS-2.1: the branded custom dropdown lives in ./Select and is
// re-exported here so every existing `Select` import keeps working
// with the same props contract (value/onChange/options children).
export { Select } from './Select';
export type { SelectProps } from './Select';

/**
 * DS-1 labeled checkbox. The global control styling (index.css)
 * draws the box; this component standardizes label, optional
 * description and disabled presentation.
 */
export function Checkbox({ label, description, id, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; description?: string }) {
  const autoId = React.useId();
  const inputId = id ?? autoId;
  return <label htmlFor={inputId} className={`flex items-start gap-2 text-sm ${props.disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
    <input {...props} id={inputId} type="checkbox" className="mt-0.5" />
    <span className="min-w-0"><span className="block font-bold">{label}</span>{description && <span className="mt-0.5 block text-xs text-slate-500">{description}</span>}</span>
  </label>;
}

const RadioGroupContext = React.createContext<{ name: string; value: string; select: (value: string) => void } | null>(null);

/** Shared radio option. Inside a RadioGroup it inherits name/value. */
export function Radio({ label, description, id, value, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; description?: string; value: string }) {
  const group = React.useContext(RadioGroupContext);
  const autoId = React.useId();
  const inputId = id ?? autoId;
  const inGroup = Boolean(group);
  return <label htmlFor={inputId} className={`flex items-start gap-2 text-sm ${props.disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
    <input
      {...props}
      id={inputId}
      type="radio"
      className="mt-0.5"
      name={inGroup ? group?.name : props.name}
      value={value}
      checked={inGroup ? group?.value === value : props.checked}
      onChange={event => {
        props.onChange?.(event);
        if (inGroup && event.target.checked) group?.select(value);
      }}
    />
    <span className="min-w-0"><span className="block font-bold">{label}</span>{description && <span className="mt-0.5 block text-xs text-slate-500">{description}</span>}</span>
  </label>;
}

export interface RadioOption { value: string; label: string; description?: string; disabled?: boolean }

/**
 * Accessible radio group on native inputs: browsers provide arrow-key
 * navigation and Space selection within a same-name group, and form
 * submission carries the group name/value with no extra wiring.
 */
export function RadioGroup({ label, helpText, error, name, value, defaultValue, onChange, required = false, options, children, disabled = false }: {
  label: string;
  helpText?: string;
  error?: string;
  name: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  required?: boolean;
  options?: RadioOption[];
  children?: React.ReactNode;
  disabled?: boolean;
}) {
  const [internal, setInternal] = useState(defaultValue ?? '');
  const current = value ?? internal;
  const labelId = React.useId();
  const helpId = `${labelId}-help`;
  const errorId = `${labelId}-error`;
  const select = (next: string) => {
    if (value === undefined) setInternal(next);
    onChange?.(next);
  };
  return <div>
    <span id={labelId} className="block text-sm font-bold">{label}{required && <> <span className="text-rose-500" aria-hidden="true">*</span></>}</span>
    {helpText && <p id={helpId} className="mt-0.5 text-xs text-slate-500">{helpText}</p>}
    <div
      role="radiogroup"
      aria-labelledby={labelId}
      aria-describedby={error ? errorId : helpText ? helpId : undefined}
      aria-invalid={error ? true : undefined}
      aria-required={required || undefined}
      className={`mt-2 space-y-2 ${error ? 'rounded-xl border border-rose-200 p-2' : ''}`}
    >
      <RadioGroupContext.Provider value={{ name, value: current, select }}>
        {options
          ? options.map(option => <Radio key={option.value} value={option.value} label={option.label} description={option.description} disabled={disabled || option.disabled} />)
          : children}
      </RadioGroupContext.Provider>
    </div>
    {error && <p id={errorId} role="alert" className="mt-1.5 text-sm text-red-700">{error}</p>}
  </div>;
}

export type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';
export type BadgeSize = 'xs' | 'sm' | 'md';
/**
 * Status/count badge with fixed tones (no ad-hoc colors) and three
 * token sizes. `usage="count"` renders the compact numeric pill used
 * in tabs, cards and table headers.
 */
export function Badge({ tone = 'neutral', size = 'sm', usage = 'status', children }: { tone?: BadgeTone; size?: BadgeSize; usage?: 'status' | 'count'; children: React.ReactNode }) {
  return <span className={`ui-badge ui-badge-${tone} ui-badge-${size} ${usage === 'count' ? 'ui-badge-count' : ''}`}>{children}</span>;
}

export interface TabItem {
  id: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  /** Small count/status pill rendered after the label. */
  badge?: React.ReactNode;
  disabled?: boolean;
}

/**
 * DS-2.2 shared Tabs (WAI-ARIA tabs pattern, automatic activation).
 * A lightweight tab strip — not a navigation framework: roving
 * tabindex, Arrow keys (RTL-aware), Home/End, disabled tabs, and a
 * horizontally scrollable strip for overflow. Controlled via
 * `value`/`onChange`, or uncontrolled via `defaultValue`.
 */
export function Tabs({ items, value, defaultValue, onChange, ariaLabel, panel }: {
  items: TabItem[];
  value?: string;
  defaultValue?: string;
  onChange?: (id: string) => void;
  ariaLabel: string;
  panel?: (activeId: string) => React.ReactNode;
}) {
  const firstEnabled = items.find(item => !item.disabled)?.id;
  const [internal, setInternal] = React.useState<string>(defaultValue ?? firstEnabled ?? '');
  const active = value ?? internal;
  const tabRefs = React.useRef(new Map<string, HTMLButtonElement>());
  const enabledItems = items.filter(item => !item.disabled);

  const activate = (id: string, focus = false) => {
    if (value === undefined) setInternal(id);
    onChange?.(id);
    if (focus) tabRefs.current.get(id)?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent, currentId: string) => {
    const rtl = typeof document !== 'undefined' && document.dir === 'rtl';
    const nextKey = rtl ? 'ArrowLeft' : 'ArrowRight';
    const prevKey = rtl ? 'ArrowRight' : 'ArrowLeft';
    const currentIndex = enabledItems.findIndex(item => item.id === currentId);
    if (currentIndex < 0) return;
    if (event.key === nextKey || event.key === prevKey) {
      event.preventDefault();
      const delta = event.key === nextKey ? 1 : -1;
      const next = enabledItems[(currentIndex + delta + enabledItems.length) % enabledItems.length];
      if (next) activate(next.id, true);
    } else if (event.key === 'Home') {
      event.preventDefault();
      if (enabledItems[0]) activate(enabledItems[0].id, true);
    } else if (event.key === 'End') {
      event.preventDefault();
      const last = enabledItems[enabledItems.length - 1];
      if (last) activate(last.id, true);
    }
  };

  return <div>
    <div role="tablist" aria-label={ariaLabel} className="ui-tabs">
      {items.map(item => {
        const selected = item.id === active;
        return <button
          key={item.id}
          ref={node => { if (node) tabRefs.current.set(item.id, node); else tabRefs.current.delete(item.id); }}
          type="button"
          role="tab"
          id={`tab-${item.id}`}
          aria-selected={selected}
          aria-controls={panel ? `tabpanel-${item.id}` : undefined}
          disabled={item.disabled}
          tabIndex={selected ? 0 : -1}
          className="ui-tab"
          onClick={() => activate(item.id)}
          onKeyDown={event => onKeyDown(event, item.id)}
        >
          {item.icon}
          <span>{item.label}</span>
          {item.badge}
        </button>;
      })}
    </div>
    {panel && <div role="tabpanel" id={`tabpanel-${active}`} aria-labelledby={`tab-${active}`} className="pt-4">{panel(active)}</div>}
  </div>;
}

/** DS-1 card: flat by default. Standalone elevation is an explicit ADR-0020 B opt-in. */
export function Card({ title, description, actions, children, className = '', elevation = 'none' }: { title?: string; description?: string; actions?: React.ReactNode; children: React.ReactNode; className?: string; elevation?: 'none' | 'standalone' }) {
  return <section data-elevation={elevation === 'standalone' ? 'standalone' : undefined} className={`ui-card ${elevation === 'standalone' ? 'ui-standalone-card' : ''} ${className}`}>
    {(title || actions) && <header className="ui-card-header"><div className="min-w-0">{title && <h2 className="text-sm font-extrabold text-slate-900">{title}</h2>}{description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}</div>{actions}</header>}
    <div className="ui-card-body">{children}</div>
  </section>;
}

/**
 * DS-1 table foundation: semantic table with token-driven header,
 * row separators and an optional empty row. Feature pages compose
 * this instead of hand-rolling table geometry.
 */
export function Table({ columns, children, caption }: { columns: string[]; children: React.ReactNode; caption?: string }) {
  return <div className="ui-table-wrap"><table className="ui-table">{caption && <caption className="sr-only">{caption}</caption>}<thead><tr>{columns.map(column => <th key={column} scope="col">{column}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;
}
export function TableRow({ children }: { children: React.ReactNode }) { return <tr>{children}</tr>; }
export function TableCell({ children, className = '' }: { children: React.ReactNode; className?: string }) { return <td className={className}>{children}</td>; }
export function FormField({ label, error, helpText, children, htmlFor, required = false }: { label: string; error?: string; helpText?: string; children: React.ReactNode; htmlFor: string; required?: boolean }) {
  const errorId = `${htmlFor}-error`;
  const helpId = `${htmlFor}-help`;
  const describedBy = error ? errorId : helpText ? helpId : undefined;
  // Wire the single control child: point its aria-describedby at the
  // error (or help) text and flag invalid, without overriding values
  // the caller set explicitly. Works for Input, custom Select,
  // RadioGroup wrappers and DatePicker triggers alike.
  const control = React.isValidElement(children)
    ? React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
        'aria-describedby': (children as React.ReactElement<Record<string, unknown>>).props['aria-describedby'] ?? describedBy,
        invalid: (children as React.ReactElement<Record<string, unknown>>).props.invalid ?? (error ? true : undefined),
      })
    : children;
  return <div className="space-y-1.5">
    <label htmlFor={htmlFor} className="block text-sm font-bold">{label}{required && <> <span className="text-rose-500" aria-hidden="true">*</span></>}</label>
    {control}
    {helpText && !error && <p id={helpId} className="text-xs text-slate-500">{helpText}</p>}
    {error && <p id={errorId} role="alert" className="text-sm text-red-700">{error}</p>}
  </div>;
}
export function LoadingState({ label = 'در حال بارگذاری…' }: { label?: string }) {
  return <div role="status" aria-live="polite" className="flex items-center justify-center p-4 sm:p-6">
    <div className="inline-flex max-w-full items-center gap-2.5 rounded-xl bg-white px-3.5 py-2.5 text-xs font-bold text-slate-600">
      <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-indigo-600" aria-hidden />
      <span className="truncate">{label}</span>
    </div>
  </div>;
}
export type EmptyStateVariant = 'first-use' | 'no-results' | 'no-permission' | 'error';

const EMPTY_VARIANT_ICON: Record<EmptyStateVariant, React.ReactNode> = {
  'first-use': <Inbox className="h-8 w-8 text-slate-300" aria-hidden />,
  'no-results': <SearchX className="h-8 w-8 text-slate-300" aria-hidden />,
  'no-permission': <ShieldOff className="h-8 w-8 text-slate-300" aria-hidden />,
  'error': <TriangleAlert className="h-8 w-8 text-amber-500" aria-hidden />,
};

/**
 * Empty/unavailable states with distinct semantics:
 * - first-use: nothing created yet (offer the creation action)
 * - no-results: a search/filter matched nothing (offer clearing it)
 * - no-permission: content exists but is not available to the viewer
 * - error: the request failed (offer retry) — announced via role=alert
 * `action` renders ONE contextual primary action where appropriate.
 */
export function EmptyState({ title, description, variant = 'first-use', action, children }: {
  title?: string;
  description?: string;
  variant?: EmptyStateVariant;
  action?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const defaultTitle = variant === 'no-results' ? 'نتیجه‌ای یافت نشد.'
    : variant === 'no-permission' ? 'این محتوا در دسترس نیست.'
    : variant === 'error' ? 'دریافت اطلاعات ناموفق بود.'
    : 'هنوز رکوردی ثبت نشده است.';
  return <section role={variant === 'error' ? 'alert' : 'status'} className="space-y-3 p-8 text-center text-slate-500">
    <div className="flex justify-center">{EMPTY_VARIANT_ICON[variant]}</div>
    <p className="font-bold text-slate-700">{title ?? defaultTitle}</p>
    {description && <p className="mx-auto max-w-md text-sm leading-6">{description}</p>}
    {action && <div className="flex justify-center pt-1">{action}</div>}
    {children}
  </section>;
}
export function ErrorState({ error, onRetry, title }: { error?: unknown; onRetry?: () => void; title?: string }) { return <section role="alert" className="p-8 text-center space-y-4"><p>{title || parseApiError(error).message}</p>{onRetry && <Button variant="secondary" onClick={onRetry}>تلاش مجدد</Button>}</section>; }
export const Skeleton = ({ className = '' }: { className?: string }) => <div aria-hidden className={`h-12 rounded-lg bg-slate-200 animate-pulse ${className}`} />;

/** DS-2.2 card-shaped skeleton (stat/content cards while loading). */
export function CardSkeleton() {
  return <div aria-hidden className="ui-card"><div className="ui-card-body space-y-3">
    <div className="h-4 w-1/3 rounded bg-slate-200 animate-pulse" />
    <div className="h-8 w-1/2 rounded bg-slate-200 animate-pulse" />
    <div className="h-3 w-2/3 rounded bg-slate-100 animate-pulse" />
  </div></div>;
}

/** DS-2.2 table-shaped skeleton; pair with a status label for AT. */
export function TableSkeleton({ rows = 4, columns = 3 }: { rows?: number; columns?: number }) {
  return <div aria-hidden className="ui-table-wrap"><div className="space-y-0 p-2">
    {Array.from({ length: rows }, (_, row) => (
      <div key={row} className="flex gap-3 border-b border-slate-100 py-2.5 last:border-0">
        {Array.from({ length: columns }, (_, col) => (
          <div key={col} className="h-4 flex-1 rounded bg-slate-200 animate-pulse" />
        ))}
      </div>
    ))}
  </div></div>;
}

/** DS-2.2 full-page loading pattern (centered, calm). */
/** DS-2.2 full-page loader: large spinner on a soft brand surface. */
export function FullPageLoader({ label = 'در حال بارگذاری…', description }: { label?: string; description?: string }) {
  return <div className="ui-fullpage-loader" role="status" aria-live="polite">
    <div className="ui-fullpage-loader-surface"><LoaderCircle className="h-10 w-10 animate-spin" aria-hidden /></div>
    <div><p className="text-sm font-extrabold text-slate-800">{label}</p>{description && <p className="mt-1 text-xs text-slate-500">{description}</p>}</div>
  </div>;
}

export function PageLoadingState({ label = 'در حال بارگذاری…' }: { label?: string }) {
  return <div className="flex min-h-48 items-center justify-center"><LoadingState label={label} /></div>;
}

/** DS-2.2 small inline spinner + label for rows, buttons and cells. */
export function InlineLoading({ label = 'در حال انجام…' }: { label?: string }) {
  return <span role="status" className="inline-flex items-center gap-2 text-xs font-bold text-slate-500">
    <LoaderCircle className="h-3.5 w-3.5 animate-spin text-indigo-600" aria-hidden />
    {label}
  </span>;
}
export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) { return <header className="flex flex-wrap justify-between items-center gap-4 mb-5"><div className="min-w-0 max-w-full"><h1 className="text-xl font-black break-words">{title}</h1>{description && <p className="text-sm text-slate-500 mt-2">{description}</p>}</div>{actions}</header>; }
let locks = 0; let previousOverflow = ''; let previousHtmlOverflow = '';
const modalStack: HTMLElement[] = [];
export function Modal({ open, onClose, title, description, icon, children, busy = false, drawer = false, size = 'lg', panelScroll = true }: { open: boolean; onClose: () => void; title: React.ReactNode; description?: React.ReactNode; icon?: React.ReactNode; children: React.ReactNode; busy?: boolean; drawer?: boolean; size?: 'md' | 'lg' | 'xl'; panelScroll?: boolean }) {
  const panel = useRef<HTMLDivElement>(null); const titleId = useId(); const close = useRef(onClose); close.current = onClose;
  // Exit animation: closing keeps the dialog mounted for ~160ms of
  // subtle opacity/scale fade instead of unmounting immediately.
  // Focus trap + restoration live in the [open] effect below and are
  // untouched; reduced motion skips the wait entirely.
  const [mounted, setMounted] = useState(open);
  const [exiting, setExiting] = useState(false);
  useEffect(() => {
    if (open) { setMounted(true); setExiting(false); return; }
    if (!mounted) return;
    setExiting(true);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(() => { setMounted(false); setExiting(false); }, reduced ? 0 : 160);
    return () => window.clearTimeout(timer);
  }, [open, mounted]);
  useLayoutEffect(() => {
    const element = panel.current;
    if (!open || !element) return;
    modalStack.push(element);
    const previous = document.activeElement as HTMLElement | null;
    if (locks++ === 0) { previousOverflow = document.body.style.overflow; previousHtmlOverflow = document.documentElement.style.overflow; document.body.style.overflow = 'hidden'; document.documentElement.style.overflow = 'hidden'; }
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
    return () => { const index = modalStack.indexOf(element); if (index >= 0) modalStack.splice(index,1); document.removeEventListener('keydown', key); if (--locks === 0) { document.body.style.overflow = previousOverflow; document.documentElement.style.overflow = previousHtmlOverflow; } if (previous?.isConnected) previous.focus(); else (modalStack.at(-1) || document.querySelector<HTMLElement>('main'))?.focus(); };
  }, [open]);
  if (!mounted) return null;
  return createPortal(<div className={`fixed inset-0 z-[80] bg-slate-900/60 backdrop-blur-xs flex animate-in fade-in duration-200 ${exiting ? 'ui-modal-exiting' : ''} ${drawer ? 'justify-end p-0 sm:p-3' : 'p-3 items-center justify-center'}`} dir="rtl" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
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
