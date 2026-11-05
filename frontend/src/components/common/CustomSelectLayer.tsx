import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { prefersReducedMotion } from './useModalExit';

/**
 * انتخابگر سفارشی برای همهٔ `select`های سامانه.
 *
 * مرورگر برای `<select>` فهرست اختصاصی خودش را باز می‌کند؛ ظاهر آن با بقیهٔ
 * کنترل‌های سامانه هم‌خوان نیست و در ویندوز/اندروید کاملاً متفاوت دیده می‌شود.
 * این لایه یک‌بار در ریشهٔ سامانه سوار می‌شود و:
 *   - بازشدن فهرست پیش‌فرض مرورگر را با `preventDefault` می‌بندد،
 *   - همان گزینه‌های واقعیِ `select` را در یک فهرست سفارشی (با گروه‌بندی
 *     `optgroup`، گزینه‌های غیرفعال و علامت گزینهٔ انتخاب‌شده) نشان می‌دهد،
 *   - با انتخاب یک گزینه، مقدار را از مسیر بومی (`value` setter + رویداد
 *     `change`) روی خود `select` می‌نویسد؛ بنابراین همهٔ فرم‌ها، کنترل‌شده یا
 *     کنترل‌نشده، بدون هیچ تغییری در کدشان کار می‌کنند.
 *
 * استثناها: `select` چندگانه یا فهرستی (`multiple`/`size>1`) و هر `select`ی که
 * `data-native-select` داشته باشد، رفتار بومی خود را نگه می‌دارند.
 */

type SelectItem = {
  index: number;
  value: string;
  label: string;
  group: string | null;
  disabled: boolean;
};

const MENU_MIN_WIDTH = 168;
const MENU_MAX_WIDTH = 360;
const MENU_MARGIN = 8;
const ITEM_HEIGHT = 34;

const nativeValueSetter = () => Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;

const isPlainSelect = (element: Element | null): element is HTMLSelectElement => {
  if (!element || element.tagName !== 'SELECT') return false;
  const select = element as HTMLSelectElement;
  if (select.multiple || select.size > 1) return false;
  if (select.hasAttribute('data-native-select')) return false;
  if (select.disabled || select.getAttribute('aria-disabled') === 'true') return false;
  return true;
};

const itemsOf = (select: HTMLSelectElement): SelectItem[] => Array.from(select.options).map((option, index) => ({
  index,
  value: option.value,
  label: (option.label || option.textContent || '').trim(),
  group: option.parentElement instanceof HTMLOptGroupElement ? (option.parentElement.label || null) : null,
  disabled: option.disabled,
}));

/** مقدار را با همان مسیر بومی می‌نویسد تا React هم رویداد را ببیند. */
const commitValue = (select: HTMLSelectElement, value: string) => {
  const setter = nativeValueSetter();
  if (setter) setter.call(select, value);
  else select.value = value;
  select.dispatchEvent(new Event('input', { bubbles: true }));
  select.dispatchEvent(new Event('change', { bubbles: true }));
};

export const CustomSelectLayer: React.FC = () => {
  const [menu, setMenu] = useState<HTMLSelectElement | null>(null);
  const [items, setItems] = useState<SelectItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState<{ top: number; left: number; minWidth: number; maxHeight: number; above: boolean } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | null>(null);
  const [closing, setClosing] = useState(false);
  const targetRef = useRef<HTMLSelectElement | null>(null);

  /** بستن نهایی: وضعیت‌ها پاک می‌شوند و لایه از صفحه برداشته می‌شود. */
  const finishClose = useCallback(() => {
    const select = targetRef.current;
    if (select) select.removeAttribute('aria-expanded');
    targetRef.current = null;
    setClosing(false);
    setMenu(null);
    setPosition(null);
  }, []);

  /**
   * بستن نرم: اول انیمیشن خروج فهرست اجرا می‌شود و بعد لایه برداشته می‌شود؛
   * گزینش یک گزینه مقدارش را همان لحظه می‌نویسد، فقط ظاهر فهرست تا پایان
   * انیمیشن می‌ماند.
   */
  const close = useCallback(() => {
    if (prefersReducedMotion()) { finishClose(); return; }
    if (closeTimer.current !== null) return;
    setClosing(true);
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null;
      finishClose();
    }, 150);
  }, [finishClose]);

  useEffect(() => () => { if (closeTimer.current !== null) window.clearTimeout(closeTimer.current); }, []);

  const place = useCallback((select: HTMLSelectElement, count: number) => {
    const rect = select.getBoundingClientRect();
    const minWidth = Math.min(MENU_MAX_WIDTH, Math.max(MENU_MIN_WIDTH, rect.width));
    const needed = Math.min(count * ITEM_HEIGHT + 12, 300);
    const spaceBelow = window.innerHeight - rect.bottom - MENU_MARGIN;
    const spaceAbove = rect.top - MENU_MARGIN;
    const above = spaceBelow < needed && spaceAbove > spaceBelow;
    const maxHeight = Math.max(120, above ? spaceAbove - 4 : spaceBelow - 4);
    const left = Math.min(
      Math.max(MENU_MARGIN, rect.right - minWidth),
      Math.max(MENU_MARGIN, window.innerWidth - minWidth - MENU_MARGIN),
    );
    setPosition({ top: above ? rect.top - 6 : rect.bottom + 6, left, minWidth, maxHeight, above });
  }, []);

  const open = useCallback((select: HTMLSelectElement) => {
    const next = itemsOf(select);
    if (next.length === 0) return;
    targetRef.current = select;
    setItems(next);
    const selectedIndex = next.findIndex(item => item.index === select.selectedIndex && !item.disabled);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : next.findIndex(item => !item.disabled));
    place(select, next.length);
    select.setAttribute('aria-expanded', 'true');
    setClosing(false);
    if (closeTimer.current !== null) { window.clearTimeout(closeTimer.current); closeTimer.current = null; }
    setMenu(select);
  }, [place]);

  // بازکردن با ماوس/لمس: فهرست پیش‌فرض مرورگر همان‌جا بسته می‌شود.
  useEffect(() => {
    const onPointerDown = (event: Event) => {
      const target = event.target as Element | null;
      const select = target?.closest?.('select') ?? null;
      if (isPlainSelect(select)) {
        event.preventDefault();
        select.focus({ preventScroll: true });
        open(select);
        return;
      }
      if (menuRef.current && target && menuRef.current.contains(target)) return;
      if (targetRef.current && target && !targetRef.current.contains(target)) close();
    };
    document.addEventListener('mousedown', onPointerDown, true);
    document.addEventListener('touchstart', onPointerDown, { capture: true, passive: false });
    return () => {
      document.removeEventListener('mousedown', onPointerDown, true);
      document.removeEventListener('touchstart', onPointerDown, true);
    };
  }, [close, open]);

  // کلیدها: بازکردن، جابه‌جایی، انتخاب و بستن — همان انتظار کاربر از یک select.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const focused = document.activeElement;
      const select = targetRef.current;
      if (!select) {
        if (isPlainSelect(focused) && ['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
          // فهرست بومی مرورگر با کلید باز نشود؛ همان فهرست سفارشی باز می‌شود.
          event.preventDefault();
          open(focused);
        }
        return;
      }
      if (event.key === 'Escape') { event.preventDefault(); close(); select.focus({ preventScroll: true }); return; }
      if (event.key === 'Tab') { close(); return; }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        setActiveIndex(current => {
          let next = current;
          for (let guard = 0; guard < items.length; guard += 1) {
            next = (next + step + items.length) % items.length;
            if (!items[next].disabled) break;
          }
          return next;
        });
        return;
      }
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        const item = items[activeIndex];
        if (item && !item.disabled) {
          commitValue(select, item.value);
          close();
          select.focus({ preventScroll: true });
        }
        return;
      }
      if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        setActiveIndex(event.key === 'Home' ? 0 : items.length - 1);
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [activeIndex, close, items, open]);

  // بستن هنگام اسکرول و تغییر اندازه
  useEffect(() => {
    if (!menu) return;
    const dismiss = (event: Event) => {
      if (menuRef.current && event.target instanceof Node && menuRef.current.contains(event.target)) return;
      close();
    };
    window.addEventListener('resize', dismiss);
    window.addEventListener('scroll', dismiss, true);
    return () => {
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('scroll', dismiss, true);
    };
  }, [close, menu]);

  if (!menu || !position) return null;

  const choose = (item: SelectItem) => {
    if (item.disabled) return;
    commitValue(menu, item.value);
    close();
    menu.focus({ preventScroll: true });
  };

  let lastGroup: string | null = null;

  return createPortal(
    <div
      ref={menuRef}
      role="listbox"
      aria-label={menu.getAttribute('aria-label') || menu.closest('label')?.textContent?.trim().slice(0, 60) || 'انتخاب گزینه'}
      dir="rtl"
      data-custom-select="true"
      style={{
        position: 'fixed',
        top: position.top,
        left: position.left,
        minWidth: position.minWidth,
        maxWidth: MENU_MAX_WIDTH,
        maxHeight: position.maxHeight,
        transform: position.above ? 'translateY(-100%)' : undefined,
      }}
      data-state={closing ? 'closing' : 'open'}
      className="ui-pop z-[130] overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white p-1 shadow-lg outline-none"
    >
      {items.map((item, index) => {
        const header = item.group && item.group !== lastGroup ? item.group : null;
        lastGroup = item.group;
        return (
          <React.Fragment key={`${item.index}-${item.value}`}>
            {header && <p className="px-2 pb-0.5 pt-1.5 text-[9px] font-black text-slate-400">{header}</p>}
            <button
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              aria-disabled={item.disabled || undefined}
              disabled={item.disabled}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(item)}
              className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-right text-[11px] font-bold transition-colors ${
                item.disabled
                  ? 'cursor-not-allowed text-slate-300'
                  : index === activeIndex
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span className="min-w-0 flex-1 truncate">{item.label || '—'}</span>
              {item.index === menu.selectedIndex
                ? <Check className="h-3.5 w-3.5 shrink-0 text-indigo-600" aria-hidden="true" />
                : <ChevronDown className="h-3 w-3 shrink-0 opacity-0" aria-hidden="true" />}
            </button>
          </React.Fragment>
        );
      })}
    </div>,
    document.body,
  );
};

export default CustomSelectLayer;
