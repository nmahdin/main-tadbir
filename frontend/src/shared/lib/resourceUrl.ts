/** Stored links are untrusted; blob/data/javascript URLs are not durable resources. */
export function resourceUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const url=value.trim();
  if (/[\u0000-\u0020\\]/.test(url)) return null;
  return /^https?:\/\//i.test(url) || /^\/(?!\/)/.test(url) ? url : null;
}
