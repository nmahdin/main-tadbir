import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search, X } from 'lucide-react';

/**
 * فیلد انتخابی جستجوپذیر.
 *
 * `select`های سامانه با لایهٔ سراسریِ `CustomSelectLayer` نمایش داده می‌شوند،
 * ولی آن لایه امکان تایپ برای جست‌وجو ندارد. این کامپوننت به‌جای `select` بومی
 * (و به‌جای آن لایه) یک دکمه + فهرست شناور با ورودی جست‌وجو می‌سازد:
 *   - فهرست در `body` رندر می‌شود تا از کادرهای `overflow` بیرون نزند،
 *   - با بالا/پایین و Enter و Escape کامل با صفحه‌کلید کار می‌کند،
 *   - و گروه‌بندی (`group`) را مثل `optgroup` نشان می‌دهد.
 */

export type SearchableOption = { value: string; label: string; group?: string | null };

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: SearchableOption[];
  placeholder: string;
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
  searchPlaceholder?: string;
  emptyText?: string;
  id?: string;
};

const normalize = (text: string) => text
  .replace(/[يى]/g, 'ی')
  .replace(/ك/g, 'ک')
  .replace(/[\u064B-\u0652\u200c\u200f\u200e]/g, '')
  .toLowerCase();

const PANEL_MAX_HEIGHT = 288;

export function SearchableSelect({
  value, onChange, options, placeholder, ariaLabel, className = '', disabled = false,
  searchPlaceholder = 'جست‌وجو…', emptyText = 'موردی پیدا نشد.', id,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const [position, setPosition] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 220 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const selected = options.find(option => option.value === value) || null;

  const filtered = useMemo(() => {
    const needle = normalize(query.trim());
    if (!needle) return options;
    return options.filter(option => normalize(option.label).includes(needle) || normalize(option.group || '').includes(needle));
  }, [options, query]);

  const groups = useMemo(() => {
    const buckets: Array<{ name: string | null; items: SearchableOption[] }> = [];
    filtered.forEach(option => {
      const name = option.group || null;
      const bucket = buckets.find(item => item.name === name);
      if (bucket) bucket.items.push(option);
      else buckets.push({ name, items: [option] });
    });
    return buckets;
  }, [filtered]);

  const updatePosition = () => {
    const trigger = triggerRef.current?.getBoundingClientRect();
    if (!trigger) return;
    const width = Math.max(trigger.width, 208);
    const spaceBelow = window.innerHeight - trigger.bottom;
    const top = spaceBelow >= PANEL_MAX_HEIGHT + 12 || spaceBelow >= trigger.top
      ? Math.min(trigger.bottom + 6, window.innerHeight - 12)
      : Math.max(12, trigger.top - PANEL_MAX_HEIGHT - 6);
    const left = Math.max(8, Math.min(trigger.left + trigger.width - width, window.innerWidth - width - 8));
    setPosition({ top, left, width });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    const onScroll = () => updatePosition();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open]);

  useEffect(() => {
    if (!open) { setQuery(''); return; }
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !triggerRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      window.clearTimeout(timer);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const index = filtered.findIndex(option => option.value === value);
    setHighlight(index >= 0 ? index : 0);
  }, [open, filtered, value]);

  useEffect(() => {
    if (!open) return;
    const active = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    active?.scrollIntoView({ block: 'nearest' });
  }, [highlight, open]);

  const choose = (option: SearchableOption) => {
    onChange(option.value);
    setOpen(false);
    setQuery('');
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); return; }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlight(current => Math.min(current + 1, filtered.length - 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlight(current => Math.max(current - 1, 0));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const option = filtered[highlight];
      if (option) choose(option);
    }
  };

  const panel = open ? (
    <div
      ref={panelRef}
      dir="rtl"
      style={{ top: position.top, left: position.left, width: position.width, maxHeight: PANEL_MAX_HEIGHT }}
      className="fixed z-[120] flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
      role="dialog"
      aria-label={ariaLabel || placeholder}
    >
      <div className="flex items-center gap-1.5 border-b border-slate-100 px-2 py-1.5">
        <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        <input
          ref={inputRef}
          value={query}
          onChange={event => { setQuery(event.target.value); setHighlight(0); }}
          onKeyDown={onKeyDown}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          aria-controls={listId}
          className="min-w-0 flex-1 bg-transparent py-1 text-[11px] text-slate-700 outline-none placeholder:text-slate-400"
        />
        {query && <button type="button" onClick={() => { setQuery(''); inputRef.current?.focus(); }} aria-label="پاک‌کردن جست‌وجو" className="rounded p-0.5 text-slate-400 hover:text-slate-600"><X className="h-3 w-3" /></button>}
      </div>
      <div ref={listRef} id={listId} role="listbox" className="min-h-0 flex-1 overflow-y-auto p-1">
        {!filtered.length && <p className="px-2 py-3 text-center text-[10px] text-slate-400">{emptyText}</p>}
        {groups.map(group => (
          <div key={group.name || 'all'}>
            {group.name && <p className="px-2 pb-1 pt-2 text-[9px] font-black text-slate-400">{group.name}</p>}
            {group.items.map(option => {
              const index = filtered.indexOf(option);
              const isSelected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  data-active={index === highlight}
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => choose(option)}
                  className={`flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-right text-[11px] transition-colors ${index === highlight ? 'bg-indigo-50 text-indigo-800' : 'text-slate-600 hover:bg-slate-50'} ${isSelected ? 'font-bold' : ''}`}
                >
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-indigo-600" />}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  ) : null;

  return (
    <div className={`relative min-w-0 ${className}`}>
      <button
        id={id}
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel || placeholder}
        onClick={() => setOpen(current => !current)}
        onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setOpen(true); } }}
        className={`flex w-full min-w-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 pl-7 text-right text-xs outline-none transition-colors hover:bg-slate-50 focus:border-indigo-400 disabled:cursor-not-allowed disabled:opacity-60 ${open ? 'border-indigo-400' : ''}`}
      >
        <span className={`min-w-0 flex-1 truncate ${selected ? 'font-bold text-slate-700' : 'text-slate-400'}`}>{selected ? selected.label : placeholder}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {selected && !disabled && <button
        type="button"
        aria-label="پاک‌کردن انتخاب"
        onClick={() => onChange('')}
        className="absolute left-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-500"
      ><X className="h-3 w-3" /></button>}
      {panel && createPortal(panel, document.body)}
    </div>
  );
}

export default SearchableSelect;
