import { useQuery } from '@tanstack/react-query';
import { request } from '../api/client';

/** فایل آخر یک دارایی مخزن؛ فقط همان چند فیلدی که پیش‌نمایش لازم دارد. */
export type DamAssetFileMeta = {
  original_filename?: string;
  file_size?: number;
  mime_type?: string;
  /** پسوند واقعی فایل (مثل `pdf`، `mp4`)؛ برای نوشتن فرمت در برچسب نوع خروجی. */
  extension?: string;
};

/** جزئیات کوتاه دارایی مخزن برای پیش‌نمایش و کارت خروجی. */
export type DamAssetDetail = {
  id: number | string;
  title?: string;
  type?: 'file' | 'content';
  latest_file?: DamAssetFileMeta | null;
  content_item?: { content_body?: string } | null;
  folder?: { id?: number; name?: string } | null;
};

/**
 * جزئیات یک دارایی مخزن با کش مشترک.
 *
 * کارت خروجی (برای فهمیدن اینکه فایل عکس است یا متن) و پنجرهٔ پیش‌نمایش، هر دو
 * همین کلید کش را می‌خوانند؛ بنابراین باز کردن پیش‌نمایش پس از دیده‌شدن کارت،
 * درخواست تازه‌ای نمی‌فرستد و تصویر/متن همان لحظه نمایش داده می‌شود.
 */
export function useDamAssetDetail(assetId?: string, enabled = true) {
  return useQuery({
    queryKey: ['dam-asset', 'preview', assetId],
    queryFn: () => request<{ data: DamAssetDetail }>(`/dam/library/${assetId}`).then(response => response.data),
    enabled: Boolean(assetId && enabled),
    staleTime: 60_000,
    retry: false,
  });
}
