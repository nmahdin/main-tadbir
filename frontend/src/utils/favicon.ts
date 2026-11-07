/**
 * A stable favicon URL is inserted into index.html by Vite before React mounts.
 * Never update it on ordinary reload/login/workspace hydration. The browser
 * caches the response and keeps its image instead of showing an old placeholder.
 *
 * Only when the admin has SAVED a new favicon do we update the same link with
 * a version parameter to invalidate its HTTP cache.
 */
export function refreshFavicon(): void {
  const link = document.head.querySelector<HTMLLinkElement>('link[rel="icon"][data-tadbir-favicon="stable"]');
  if (!link) return;
  const url = new URL(link.href, window.location.href);
  url.searchParams.set('v', String(Date.now()));
  link.href = url.toString();
}
