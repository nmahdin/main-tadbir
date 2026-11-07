import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const html = read('../index.html');
const app = read('../src/App.tsx');
const context = read('../src/context/AppContext.tsx');
const vite = read('../vite.config.ts');
const settings = read('../src/components/settings/SettingsView.tsx');

test('favicon URL is resolved by Vite in initial HTML, without client-side bootstrap', () => {
  assert.match(html, /href="__TADBIR_FAVICON_URL__"/);
  assert.match(vite, /transformIndexHtml/);
  assert.match(vite, /public\/favicon/);
  assert.doesNotMatch(html, /localStorage\.getItem\('tadbir:brand-favicon'/);
});

test('browser icon is not touched by React loading, login or refresh', () => {
  assert.doesNotMatch(app, /applyFavicon/);
  assert.doesNotMatch(context, /applyFavicon/);
  assert.match(context, /cachedBrandColor\('tadbir:theme-color'/);
});

test('admin branding save alone refreshes the icon URL', () => {
  assert.match(settings, /faviconUploadPending/);
  assert.match(settings, /refreshFavicon\(\)/);
});
