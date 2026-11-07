/** Query-based navigation works on static shared hosting without rewrite rules. */
export function readTaskLink(search: string): string | null {
  const values = new URLSearchParams(search).getAll('task');
  return values.length === 1 && /^[1-9][0-9]{0,17}$/.test(values[0]) ? values[0] : null;
}

/** Deep link to a content record from the panel/Bale entry: `?content=<id>`. */
export function readContentLink(search: string): string | null {
  const values = new URLSearchParams(search).getAll('content');
  return values.length === 1 && /^[1-9][0-9]{0,17}$/.test(values[0]) ? values[0] : null;
}

/**
 * پیوند عمیق به یک ایده از بات بله یا مرکز اعلان‌ها: `?idea=<id>`.
 *
 * با `comment=1` (دکمهٔ «نظر دادن» در بات) همان ایده باز می‌شود و کادر ثبت
 * دیدگاه فعال و فوکوس می‌شود؛ بدون آن فقط جزئیات ایده نمایش داده می‌شود.
 */
export function readIdeaLink(search: string): { id: string; comment: boolean } | null {
  const params = new URLSearchParams(search);
  const values = params.getAll('idea');
  if (values.length !== 1 || !/^[1-9][0-9]{0,17}$/.test(values[0])) return null;
  return { id: values[0], comment: params.get('comment') === '1' };
}

export function taskLink(base: string, id: string): string | null {
  if (!/^[1-9][0-9]{0,17}$/.test(id)) return null;
  const url = new URL(base);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
  url.search = '';
  url.hash = '';
  url.searchParams.set('task', id);
  return url.toString();
}

/** Cancel on navigation/account changes; no cached task is trusted in place of an API check. */
export function followTaskLink<T>(options: {
  id: string | null;
  signedIn: boolean;
  loading: boolean;
  load: (id: string, signal: AbortSignal) => Promise<T>;
  open: (task: T) => void;
  failed: (error: unknown) => void;
}): () => void {
  const controller = new AbortController();
  if (options.id && options.signedIn && !options.loading) {
    void options.load(options.id, controller.signal).then(task => {
      if (!controller.signal.aborted) options.open(task);
    }).catch(error => {
      if (!controller.signal.aborted) options.failed(error);
    });
  }
  return () => controller.abort();
}

/** This is a UI hint only. Task and DAM permissions are checked by their APIs. */
export function readTaskAssetLink(search: string, taskId: string): 'create' | 'text' | 'file' | 'row' | 'link' | null {
  const values = new URLSearchParams(search).getAll('asset');
  if (readTaskLink(search) !== taskId || values.length !== 1) return null;
  const value = values[0];
  return value === 'create' || value === 'text' || value === 'file' || value === 'row' || value === 'link' ? value : null;
}
