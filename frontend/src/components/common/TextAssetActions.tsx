import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Eye, FileText, LoaderCircle } from 'lucide-react';
import { downloadTextAsset, type TextAssetFormat } from '../../utils/textAssetDownload';

/**
 * دکمه‌های دارایی متنی دقیقاً هم‌شکل دکمه‌های فایل آپلودی‌اند؛
 * کلاس‌های مشترک در index.css (ui-asset-action) منبع حقیقت هر دو است.
 */
export const ASSET_ACTION_PREVIEW_CLASS = 'ui-asset-action ui-asset-action-preview';
export const ASSET_ACTION_DOWNLOAD_CLASS = 'ui-asset-action ui-asset-action-download';

export const TEXT_ASSET_FORMATS: { id: TextAssetFormat; label: string; iconClass: string }[] = [
  { id: 'txt', label: 'متن ساده (TXT)', iconClass: 'text-slate-400' },
  { id: 'doc', label: 'سند Word', iconClass: 'text-blue-500' },
  { id: 'pdf', label: 'سند PDF', iconClass: 'text-rose-500' },
];

const MENU_WIDTH = 176;
const MENU_HEIGHT = 132;
const VIEWPORT_MARGIN = 8;

/**
 * فهرست قالب‌های دانلود در `portal` و با موقعیت `fixed` رندر می‌شود.
 *
 * دلیل: این دکمه‌ها داخل کارت‌ها و ردیف‌هایی هستند که `overflow-hidden` دارند
 * (ردیف دارایی، پاورقی نمایشگر متن، جدول‌ها)؛ فهرست `absolute` در آن قاب‌ها بریده
 * می‌شد و دیده نمی‌شد. با `fixed` روی کل صفحه و مختصات جدول‌بندی‌شده، فهرست
 * همیشه کامل و بیرون از هر قاب بریده‌شده نمایش داده می‌شود.
 */
export function TextAssetActions({ title, html, onView, canDownload = true, showView = true, className = '' }: {
  title: string;
  html: string;
  onView: () => void;
  canDownload?: boolean;
  showView?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<TextAssetFormat | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number; above: boolean } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!root.current?.contains(target) && !menu.current?.contains(target)) setOpen(false);
    };
    const reposition = () => {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const above = rect.top > MENU_HEIGHT + VIEWPORT_MARGIN * 2;
      const left = Math.min(
        Math.max(VIEWPORT_MARGIN, rect.right - MENU_WIDTH),
        Math.max(VIEWPORT_MARGIN, window.innerWidth - MENU_WIDTH - VIEWPORT_MARGIN),
      );
      setPosition({ top: above ? rect.top - 6 : rect.bottom + 6, left, above });
    };
    const dismiss = () => setOpen(false);
    document.addEventListener('mousedown', close);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', dismiss, true);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', dismiss, true);
    };
  }, [open]);

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = trigger.current?.getBoundingClientRect();
    if (rect) {
      const above = rect.top > MENU_HEIGHT + VIEWPORT_MARGIN * 2;
      const left = Math.min(
        Math.max(VIEWPORT_MARGIN, rect.right - MENU_WIDTH),
        Math.max(VIEWPORT_MARGIN, window.innerWidth - MENU_WIDTH - VIEWPORT_MARGIN),
      );
      setPosition({ top: above ? rect.top - 6 : rect.bottom + 6, left, above });
    }
    setOpen(true);
  };

  const download = async (format: TextAssetFormat) => {
    setBusy(format); setOpen(false);
    try { await downloadTextAsset(title, html, format); }
    finally { setBusy(null); }
  };

  return <div className={`flex items-center justify-end gap-1 ${className}`} ref={root}>
    {showView && <button type="button" onClick={onView} aria-label="مشاهده متن" title="مشاهده متن" className={ASSET_ACTION_PREVIEW_CLASS}><Eye className="h-4 w-4" /></button>}
    {canDownload && <div className="relative">
      <button
        ref={trigger}
        type="button"
        onClick={toggle}
        aria-label="انتخاب قالب دانلود"
        title="دانلود"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-busy={busy !== null || undefined}
        disabled={busy !== null}
        className={ASSET_ACTION_DOWNLOAD_CLASS}
      >{busy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4" />}</button>
      {open && createPortal(
        <div
          ref={menu}
          role="menu"
          aria-label="قالب دانلود"
          dir="rtl"
          style={{
            position: 'fixed',
            top: position?.top ?? 0,
            left: position?.left ?? 0,
            transform: position?.above ? 'translateY(-100%)' : undefined,
          }}
          className="z-[120] w-44 rounded-xl border border-slate-200 bg-white p-1.5 text-right shadow-xl"
        >
          {TEXT_ASSET_FORMATS.map(format => <button key={format.id} type="button" role="menuitem" onClick={() => void download(format.id)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[11px] font-bold text-slate-700 hover:bg-slate-50"><FileText className={`h-3.5 w-3.5 ${format.iconClass}`} />{format.label}</button>)}
        </div>,
        document.body,
      )}
    </div>}
    {busy && <span className="min-w-20 text-[9px] font-bold text-indigo-700">در حال آماده‌سازی…</span>}
  </div>;
}
