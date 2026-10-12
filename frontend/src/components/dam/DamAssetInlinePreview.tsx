import React, { useEffect, useState } from 'react';
import { AlertTriangle, FileText, Image, LoaderCircle, Music2, Video } from 'lucide-react';
import { request } from '../../api/client';
import { damApi } from '../../api/dam';
import type { ApiResponse } from '../../api/client';

type PreviewAsset = {
  id: number | string;
  title: string;
  type: 'file' | 'content';
  latest_file?: { original_filename?: string; mime_type?: string; file_size?: number } | null;
  content_item?: { content_body?: string; content_plain_text?: string } | null;
};

/** A read-only, permission-checked preview for DAM assets linked from workflow handoffs. */
export const DamAssetInlinePreview: React.FC<{ assetId: string | number }> = ({ assetId }) => {
  const [asset, setAsset] = useState<PreviewAsset | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mediaError, setMediaError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setAsset(null);
    setLoading(true);
    setError('');
    setMediaError(false);
    request<ApiResponse<PreviewAsset>>(`/dam/library/${encodeURIComponent(String(assetId))}`, { signal: controller.signal })
      .then(response => setAsset(response.data))
      .catch(reason => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'دریافت مشخصات دارایی ناموفق بود.');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [assetId]);

  if (loading) return <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-6 text-xs text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" />دریافت پیش‌نمایش امن از مخزن…</div>;
  if (error || !asset) return <div role="status" className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-6 text-amber-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error || 'دارایی در دسترس نیست یا مجوز مشاهدهٔ آن وجود ندارد.'}</span></div>;

  if (asset.type === 'content') {
    const body = asset.content_item?.content_body || asset.content_item?.content_plain_text || '';
    return <section className="space-y-2"><h4 className="text-[11px] font-black text-slate-700">متن دارایی در DAM</h4><p className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-2xl border border-violet-100 bg-violet-50/40 p-4 text-xs leading-7 text-slate-700">{body || 'متنی برای این دارایی ثبت نشده است.'}</p></section>;
  }

  const file = asset.latest_file;
  if (!file) return <p className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500">نسخهٔ فایلی برای این دارایی ثبت نشده است.</p>;
  const mime = (file.mime_type || '').toLowerCase();
  const src = damApi.library.previewUrl(asset.id);
  const title = file.original_filename || asset.title;
  const previewable = (mime.startsWith('image/') && mime !== 'image/svg+xml')
    || mime.startsWith('audio/') || mime.startsWith('video/')
    || ['application/pdf', 'text/plain'].includes(mime);

  return <section className="space-y-2"><h4 className="flex items-center gap-1.5 text-[11px] font-black text-slate-700"><FileText className="h-3.5 w-3.5 text-indigo-600" />پیش‌نمایش فایل از مخزن</h4>
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-2">
      {mediaError ? <p role="status" className="p-5 text-center text-xs text-amber-700">پیش‌نمایش این دارایی در دسترس نیست یا مجوز نمایش فایل وجود ندارد.</p>
        : mime.startsWith('image/') && mime !== 'image/svg+xml' ? <img crossOrigin="use-credentials" src={src} alt={title} onError={() => setMediaError(true)} className="mx-auto max-h-[60vh] w-full rounded-xl object-contain" />
        : mime.startsWith('video/') ? <video crossOrigin="use-credentials" controls preload="metadata" src={src} onError={() => setMediaError(true)} className="max-h-[60vh] w-full rounded-xl bg-black" />
        : mime.startsWith('audio/') ? <div className="flex items-center gap-3 rounded-xl bg-white p-3"><Music2 className="h-5 w-5 shrink-0 text-indigo-600" /><audio crossOrigin="use-credentials" controls preload="none" src={src} onError={() => setMediaError(true)} className="min-w-0 flex-1" /></div>
        : mime === 'application/pdf' || mime === 'text/plain' ? <iframe title={`پیش‌نمایش ${title}`} src={src} sandbox="allow-same-origin" className="h-[52vh] min-h-64 w-full rounded-xl bg-white" />
        : <div className="flex items-center gap-3 rounded-xl bg-white p-4 text-xs text-slate-600"><Image className="h-5 w-5 shrink-0 text-slate-400" />پیش‌نمایش درون‌صفحه‌ای برای این قالب فایل پشتیبانی نمی‌شود.</div>}
    </div>
    <p className="flex items-center gap-1.5 text-[10px] text-slate-400"><Video className="h-3 w-3" />{title}{file.file_size ? ` · ${(file.file_size / 1024).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} کیلوبایت` : ''}{!previewable && ' · نوع فایل بدون پیش‌نمایش'}</p>
  </section>;
};
