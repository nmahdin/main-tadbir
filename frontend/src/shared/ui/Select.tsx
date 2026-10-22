import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, LoaderCircle, Search } from 'lucide-react';
import {
  filterSelectOptions,
  firstEnabledIndex,
  indexOfValue,
  lastEnabledIndex,
  moveActiveIndex,
  typeaheadIndex,
  type SelectOptionItem,
} from './selectLogic';

/**
 * DS-2.1 branded Select — replaces the browser-native dropdown UI
 * while preserving the DS-1 component contract exactly:
 * `<Select value onChange={e => e.target.value}>` with `<option>`
 * children, `id` for FormField labels, `name` for form submission.
 *
 * Accessibility (WAI-ARIA listbox pattern, aria-activedescendant):
 * DOM focus stays on the trigger — or on the search field in the
 * searchable variant — and the active option is exposed via
 * aria-activedescendant, so screen readers announce navigation
 * without focus ever being lost into the popup. Enter/Space select,
 * Escape closes and returns focus to the trigger, arrows/Home/End
 * move, Tab closes, and click-outside dismisses.
 *
 * A hidden native <select> stays in the DOM (aria-hidden, not
 * focusable) as the form/progressive-enhancement fallback: form
 * submission keeps working with zero call-site changes. `multiple`
 * selects keep the native control — no caller uses one today, and a
 * multi-select listbox is deliberately out of DS-2.1 scope.
 */

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  invalid?: boolean;
  /** Show a filter field at the top of the popup (long lists). */
  searchable?: boolean;
  /** Show a spinner in the trigger and block opening. */
  loading?: boolean;
  /** Placeholder when nothing (or the empty option) is selected. */
  placeholder?: string;
  /** Data-driven alternative to <option> children. */
  options?: SelectOptionItem[];
}

function optionsFromChildren(children: React.ReactNode): SelectOptionItem[] {
  const items: SelectOptionItem[] = [];
  React.Children.forEach(children, child => {
    if (!React.isValidElement(child)) return;
    const props = child.props as { value?: string | number; disabled?: boolean; children?: React.ReactNode };
    if (child.type === 'option') {
      const label = typeof props.children === 'string' || typeof props.children === 'number'
        ? String(props.children)
        : '';
      items.push({ value: String(props.value ?? label), label, disabled: Boolean(props.disabled) });
    } else if (child.type === 'optgroup') {
      items.push(...optionsFromChildren(props.children));
    }
  });
  return items;
}

export const Select = React.forwardRef<HTMLButtonElement, SelectProps>(function Select(
  {
    invalid,
    searchable = false,
    loading = false,
    placeholder,
    options: optionsProp,
    children,
    value,
    defaultValue,
    onChange,
    id,
    name,
    disabled,
    required,
    className = '',
    multiple,
    'aria-label': ariaLabel,
    'aria-describedby': ariaDescribedBy,
    ...rest
  },
  ref,
) {
  const options = useMemo(
    () => optionsProp ?? optionsFromChildren(children),
    [optionsProp, children],
  );
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState<string>(String(defaultValue ?? ''));
  const currentValue = isControlled ? String(value ?? '') : internalValue;

  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typeahead = useRef<{ text: string; timer: number }>({ text: '', timer: 0 });
  const reactId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const listboxId = `${reactId}-listbox`;
  const optionId = (index: number) => `${reactId}-option-${index}`;

  const visibleOptions = useMemo(
    () => (searchable && open ? filterSelectOptions(options, query) : options),
    [options, query, searchable, open],
  );

  const selectedIndex = indexOfValue(options, currentValue);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;
  const showingPlaceholder = !selected || selected.value === '';

  const setTriggerRef = (node: HTMLButtonElement | null) => {
    triggerRef.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref && typeof ref === 'object') (ref as React.MutableRefObject<HTMLButtonElement | null>).current = node;
  };

  const openPopup = () => {
    if (disabled || loading) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      const below = window.innerHeight - rect.bottom;
      setOpenUp(below < 280 && rect.top > below);
    }
    setQuery('');
    const initial = selectedIndex >= 0 && !options[selectedIndex]?.disabled
      ? selectedIndex
      : firstEnabledIndex(options);
    setActiveIndex(initial);
    setOpen(true);
  };

  const closePopup = (refocus = false) => {
    setOpen(false);
    setQuery('');
    if (refocus) triggerRef.current?.focus();
  };

  const commit = (option: SelectOptionItem | undefined) => {
    if (!option || option.disabled) return;
    if (!isControlled) setInternalValue(option.value);
    if (onChange) {
      const fakeTarget = { value: option.value, name: name ?? '' };
      onChange({ target: fakeTarget, currentTarget: fakeTarget } as unknown as React.ChangeEvent<HTMLSelectElement>);
    }
    closePopup(true);
  };

  // Click-outside dismissal.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) closePopup();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open ]);

  // Keep the active option visible while navigating.
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (disabled || loading) return;
    if (!open) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openPopup();
      }
      return;
    }
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setActiveIndex(index => moveActiveIndex(visibleOptions, index, 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActiveIndex(index => moveActiveIndex(visibleOptions, index, -1));
        break;
      case 'Home':
        event.preventDefault();
        setActiveIndex(firstEnabledIndex(visibleOptions));
        break;
      case 'End':
        event.preventDefault();
        setActiveIndex(lastEnabledIndex(visibleOptions));
        break;
      case 'Enter':
      case ' ':
        // Space types into the search field in searchable mode.
        if (searchable && event.key === ' ' && (event.target as HTMLElement).tagName === 'INPUT') return;
        event.preventDefault();
        commit(visibleOptions[activeIndex]);
        break;
      case 'Escape':
        event.preventDefault();
        closePopup(true);
        break;
      case 'Tab':
        closePopup();
        break;
      default:
        if (!searchable && event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
          window.clearTimeout(typeahead.current.timer);
          typeahead.current.text += event.key;
          typeahead.current.timer = window.setTimeout(() => { typeahead.current.text = ''; }, 600);
          setActiveIndex(index => typeaheadIndex(visibleOptions, typeahead.current.text, index));
        }
    }
  };

  if (multiple) {
    // Multi-select keeps the native control (out of DS-2.1 scope).
    return (
      <select
        id={id}
        name={name}
        value={value}
        defaultValue={defaultValue}
        onChange={onChange}
        disabled={disabled}
        required={required}
        aria-invalid={invalid || undefined}
        aria-label={ariaLabel}
        multiple
        className={`ui-input ${invalid ? 'ui-input-invalid' : ''} ${className}`}
        {...rest}
      >
        {children}
      </select>
    );
  }

  return (
    <div ref={wrapperRef} className={`ui-select ${className}`} dir="rtl">
      <button
        ref={setTriggerRef}
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={open && activeIndex >= 0 ? optionId(activeIndex) : undefined}
        aria-invalid={invalid || undefined}
        aria-required={required || undefined}
        aria-busy={loading || undefined}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy ?? (invalid && id ? `${id}-error` : undefined)}
        data-invalid={invalid || undefined}
        className="ui-select-trigger"
        onClick={() => (open ? closePopup() : openPopup())}
        onKeyDown={handleKeyDown}
      >
        <span className={`ui-select-value ${showingPlaceholder ? 'ui-select-placeholder' : ''}`}>
          {selected ? selected.label : (placeholder ?? '')}
          {showingPlaceholder && selected && placeholder ? placeholder : null}
          {!selected && !placeholder ? ' ' : null}
        </span>
        {loading
          ? <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-slate-400" aria-hidden />
          : <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />}
      </button>

      {/* Progressive-enhancement fallback: real form value, never focusable. */}
      <select
        aria-hidden="true"
        tabIndex={-1}
        name={name}
        value={currentValue}
        onChange={() => undefined}
        className="hidden"
      >
        {options.map(option => (
          <option key={`${option.value}-${option.label}`} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>

      {open && (
        <div className={`ui-select-popup ${openUp ? 'ui-select-popup-up' : ''}`}>
          {searchable && (
            <div className="relative">
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <input
                autoFocus
                value={query}
                onChange={event => {
                  setQuery(event.target.value);
                  const filtered = filterSelectOptions(options, event.target.value);
                  setActiveIndex(firstEnabledIndex(filtered));
                }}
                onKeyDown={handleKeyDown}
                className="ui-select-search pr-9"
                placeholder="جست‌وجو…"
                aria-label="جست‌وجو در گزینه‌ها"
                aria-controls={listboxId}
                aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
                role="combobox"
                aria-expanded="true"
                aria-autocomplete="list"
              />
            </div>
          )}
          {visibleOptions.length === 0 ? (
            <p className="ui-select-empty">گزینه‌ای یافت نشد.</p>
          ) : (
            <ul ref={listRef} role="listbox" id={listboxId} aria-label={ariaLabel} className="ui-select-list">
              {visibleOptions.map((option, index) => {
                const isSelected = option.value === currentValue;
                return (
                  <li
                    key={`${option.value}-${option.label}`}
                    id={optionId(index)}
                    data-index={index}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={option.disabled || undefined}
                    data-active={index === activeIndex || undefined}
                    className="ui-select-option"
                    onMouseEnter={() => { if (!option.disabled) setActiveIndex(index); }}
                    onMouseDown={event => {
                      event.preventDefault();
                      commit(option);
                    }}
                  >
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                    {isSelected && <Check className="h-4 w-4 shrink-0" aria-hidden />}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
});
