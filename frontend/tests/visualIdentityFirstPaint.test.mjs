import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const html = read('../index.html');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);

test('initial HTML never injects stale favicon from browser storage', () => {
  assert.match(html, /data-tadbir-favicon="pending"/);
  assert.match(html, /data:image\/svg\+xml/);
  assert.doesNotMatch(html, /localStorage\.getItem\('tadbir:brand-favicon'\)/);
  assert.equal(scripts.length, 1, 'only prepaint palette bootstrap is needed');
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
