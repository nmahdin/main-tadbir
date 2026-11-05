import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const html = read('../index.html');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);

test('cached favicon is applied at HTML parsing time', () => {
  assert.match(html, /data-tadbir-favicon="pending"/);
  assert.equal(scripts.length, 2);
  // نوعِ اعلام‌شده باید پاک شود؛ وگرنه PNG با برچسب SVG رد می‌شود و آیکون قبلی می‌ماند.
  const cleared = [];
  const icon = { href: '', dataset: {}, removeAttribute: (name) => cleared.push(name) };
  vm.runInNewContext(scripts[1], {
    localStorage: { getItem: () => '/api/v1/media/brand/logo.png' },
    document: { querySelector: () => icon },
    location: { href: 'https://tadbir.example/dashboard' },
    URL,
  });
  assert.equal(icon.href, 'https://tadbir.example/api/v1/media/brand/logo.png');
  assert.equal(icon.dataset.tadbirFavicon, 'custom');
  assert.deepEqual(cleared, ['type']);
});

test('the cached favicon refuses non-HTTP protocols', () => {
  const icon = { href: 'neutral', dataset: {} };
  vm.runInNewContext(scripts[1], {
    localStorage: { getItem: () => 'javascript:alert(1)' },
    document: { querySelector: () => icon },
    location: { href: 'https://tadbir.example/dashboard' },
    URL,
  });
  assert.equal(icon.href, 'neutral');
});

test('workspace and login retain the correct visual identity during loading', () => {
  const app = read('../src/App.tsx');
  const context = read('../src/context/AppContext.tsx');
  const sidebar = read('../src/components/layout/Sidebar.tsx');
  assert.match(app, /if \(isWorkspaceLoading\) return;\s*const raw = generalSettings\.faviconUrl/);
  assert.match(context, /cachedBrandColor\('tadbir:theme-color'/);
  assert.match(context, /stopFavicon = applyFavicon\(identity\.faviconUrl\)/);
  assert.match(sidebar, /fallback=\{isWorkspaceLoading && !generalSettings\.logoUrl \? null : <Building2/);
  assert.match(sidebar, /tadbir:brand-logo/);
});
