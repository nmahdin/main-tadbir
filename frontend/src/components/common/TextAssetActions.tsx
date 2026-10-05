import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Download, Eye, FileText } from 'lucide-react';
import { downloadTextAsset, type TextAssetFormat } from '../../utils/textAssetDownload';
import { Button } from './Primitives';

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
  return <div className={`flex items-center gap-1.5 ${className}`} ref={root}>
    {showView && <Button type="button" variant="secondary" onClick={onView} className="text-[10px]"><Eye className="h-3.5 w-3.5" />مشاهده متن</Button>}
    {canDownload && <div className="relative">
      <Button type="button" variant="secondary" loading={busy !== null} onClick={() => setOpen(value => !value)} aria-haspopup="menu" aria-expanded={open} className="px-2.5 text-[10px]"><Download className="h-3.5 w-3.5" />دانلود<ChevronDown className="h-3 w-3" /></Button>
      {open && <div role="menu" className="absolute left-0 top-full z-40 mt-1.5 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 text-right shadow-xl">
        <button type="button" role="menuitem" onClick={() => void download('txt')} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[11px] font-bold text-slate-700 hover:bg-slate-50"><FileText className="h-3.5 w-3.5 text-slate-400" />متن ساده (TXT)</button>
        <button type="button" role="menuitem" onClick={() => void download('doc')} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[11px] font-bold text-slate-700 hover:bg-slate-50"><FileText className="h-3.5 w-3.5 text-blue-500" />سند Word</button>
        <button type="button" role="menuitem" onClick={() => void download('pdf')} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[11px] font-bold text-slate-700 hover:bg-slate-50"><FileText className="h-3.5 w-3.5 text-rose-500" />سند PDF</button>
      </div>}
    </div>}
  </div>;
}
