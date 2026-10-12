import React, { useEffect, useRef, useState } from 'react';
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
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  const download = async (format: TextAssetFormat) => {
    setBusy(format); setOpen(false);
    try { await downloadTextAsset(title, html, format); }
    finally { setBusy(null); }
  };
  return <div className={`flex items-center justify-end gap-1 ${className}`} ref={root}>
    {showView && <button type="button" onClick={onView} aria-label="مشاهده متن" title="مشاهده متن" className={ASSET_ACTION_PREVIEW_CLASS}><Eye className="h-4 w-4" /></button>}
    {canDownload && <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-label="انتخاب قالب دانلود"
        title="دانلود"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-busy={busy !== null || undefined}
        disabled={busy !== null}
        className={ASSET_ACTION_DOWNLOAD_CLASS}
      >{busy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4" />}</button>
      {open && <div role="menu" aria-label="قالب دانلود" className="absolute bottom-full left-0 z-40 mb-1.5 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 text-right shadow-xl">
        {TEXT_ASSET_FORMATS.map(format => <button key={format.id} type="button" role="menuitem" onClick={() => void download(format.id)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[11px] font-bold text-slate-700 hover:bg-slate-50"><FileText className={`h-3.5 w-3.5 ${format.iconClass}`} />{format.label}</button>)}
      </div>}
    </div>}
    {busy && <span className="min-w-20 text-[9px] font-bold text-indigo-700">در حال آماده‌سازی…</span>}
  </div>;
}
