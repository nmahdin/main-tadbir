import React, { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button, type ButtonProps } from './Primitives';

/**
 * DS-2.3 contextual overlays: DropdownMenu, Popover, Tooltip.
 *
 * They reuse the Select interaction foundation (outside-click,
 * Escape-returns-focus, edge flip, active-descendant style keyboard
 * handling) without dragging in the modal focus trap — these are
 * non-modal surfaces. Tooltip content must be short plain text:
 * never put anything sensitive or essential-only-on-hover in it.
 */

export interface DropdownMenuItem {
  id: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  disabled?: boolean;
  danger?: boolean;
  onSelect: () => void;
}

function useFlip(open: boolean, anchorRef: React.RefObject<HTMLElement | null>) {
  const [up, setUp] = useState(false);
  useEffect(() => {
    if (!open || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    setUp(window.innerHeight - rect.bottom < 260 && rect.top > window.innerHeight - rect.bottom);
  }, [open, anchorRef]);
  return up;
}

function useOutsideClose(open: boolean, ref: React.RefObject<HTMLElement | null>, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) close();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, ref, close]);
}

export function DropdownMenu({
  label,
  items,
  ariaLabel,
  variant = 'secondary',
  size = 'md',
  shape,
  disabled = false,
}: {
  label: React.ReactNode;
  items: DropdownMenuItem[];
  ariaLabel: string;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  shape?: ButtonProps['shape'];
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const up = useFlip(open, wrapperRef);
  const close = (refocus = false) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };
  useOutsideClose(open, wrapperRef, () => close());

  const enabledIndexes = items.map((item, index) => (item.disabled ? -1 : index)).filter(index => index >= 0);
  const openMenu = (focusLast = false) => {
    if (disabled) return;
    setActiveIndex(focusLast ? (enabledIndexes[enabledIndexes.length - 1] ?? -1) : (enabledIndexes[0] ?? -1));
    setOpen(true);
  };
  const move = (delta: 1 | -1) => {
    if (enabledIndexes.length === 0) return;
    const position = enabledIndexes.indexOf(activeIndex);
    const next = enabledIndexes[(position + delta + enabledIndexes.length) % enabledIndexes.length];
    setActiveIndex(next ?? -1);
  };
  const choose = (item: DropdownMenuItem | undefined) => {
    if (!item || item.disabled) return;
    close(true);
    item.onSelect();
  };

  return (
    <div ref={wrapperRef} className="relative inline-block" dir="rtl">
      <Button
        ref={triggerRef as React.Ref<HTMLButtonElement>}
        variant={variant}
        size={size}
        shape={shape}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={event => {
          if (event.key === 'ArrowDown') { event.preventDefault(); openMenu(); }
          if (event.key === 'ArrowUp') { event.preventDefault(); openMenu(true); }
        }}
      >
        {label}
        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </Button>
      {open && (
        <div
          role="menu"
          aria-label={ariaLabel}
          className={`ui-menu ${up ? 'ui-menu-up' : ''}`}
          onKeyDown={event => {
            if (event.key === 'ArrowDown') { event.preventDefault(); move(1); }
            else if (event.key === 'ArrowUp') { event.preventDefault(); move(-1); }
            else if (event.key === 'Home') { event.preventDefault(); setActiveIndex(enabledIndexes[0] ?? -1); }
            else if (event.key === 'End') { event.preventDefault(); setActiveIndex(enabledIndexes[enabledIndexes.length - 1] ?? -1); }
            else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(items[activeIndex]); }
            else if (event.key === 'Escape') { event.preventDefault(); close(true); }
            else if (event.key === 'Tab') close();
          }}
        >
          {items.map((item, index) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              data-active={index === activeIndex || undefined}
              tabIndex={index === activeIndex ? 0 : -1}
              ref={node => { if (node && index === activeIndex) node.focus(); }}
              className={`ui-menu-item ${item.danger ? 'ui-menu-item-danger' : ''}`}
              onMouseEnter={() => { if (!item.disabled) setActiveIndex(index); }}
              onClick={() => choose(item)}
            >
              {item.icon}
              <span className="min-w-0 flex-1">{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Popover({
  label,
  ariaLabel,
  children,
  variant = 'secondary',
  size = 'md',
}: {
  label: React.ReactNode;
  ariaLabel: string;
  children: React.ReactNode;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const up = useFlip(open, wrapperRef);
  const close = (refocus = false) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };
  useOutsideClose(open, wrapperRef, () => close());

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open ]);

  return (
    <div ref={wrapperRef} className="relative inline-block" dir="rtl">
      <Button
        ref={triggerRef as React.Ref<HTMLButtonElement>}
        variant={variant}
        size={size}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => (open ? close() : setOpen(true))}
      >
        {label}
      </Button>
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label={ariaLabel}
          tabIndex={-1}
          className={`ui-popover-panel ${up ? 'ui-popover-panel-up' : ''} outline-none`}
          onKeyDown={event => {
            if (event.key === 'Escape') { event.preventDefault(); close(true); }
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/** Short plain-text explanation on hover AND focus (never hover-only essentials). */
export function Tooltip({ label, children }: { label: string; children: React.ReactElement }) {
  const [visible, setVisible] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const tooltipId = useId();
  const show = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setVisible(true), 200);
  };
  const hide = () => {
    window.clearTimeout(timer.current);
    setVisible(false);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const child = React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
    'aria-describedby': tooltipId,
    onMouseEnter: show,
    onMouseLeave: hide,
    onFocus: show,
    onBlur: hide,
  });

  return (
    <span className="relative inline-flex">
      {child}
      {visible && <span role="tooltip" id={tooltipId} className="ui-tooltip">{label}</span>}
    </span>
  );
}
