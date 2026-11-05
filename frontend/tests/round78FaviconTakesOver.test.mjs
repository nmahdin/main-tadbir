import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const html = read('../index.html');
const favicon = read('../src/utils/favicon.ts');
const app = read('../src/App.tsx');
const context = read('../src/context/AppContext.tsx');
const backend = read('../../backend/app/Http/Controllers/Api/V1/SystemSettingController.php');
const routes = read('../../backend/routes/api.php');

test('favicon has one stable URL resolved before React renders', () => {
  assert.match(html, /href="__TADBIR_FAVICON_URL__"/);
  assert.match(routes, /Route::get\('public\/favicon'/);
  assert.match(backend, /function publicFavicon\(\)/);
  assert.doesNotMatch(html, /pending|\/favicon\.svg/);
});

test('React never replaces favicon on ordinary page hydration or login', () => {
  assert.doesNotMatch(app, /applyFavicon/);
  assert.doesNotMatch(context, /applyFavicon/);
  assert.doesNotMatch(favicon, /new Image\(\)/);
  assert.match(favicon, /export function refreshFavicon\(\): void/);
});

test('native favicon supports cache re-use and neutral fallback', () => {
  assert.match(backend, /Cache-Control' => 'public, max-age=300'/);
  assert.match(backend, /<svg xmlns=/);
  assert.match(favicon, /url\.searchParams\.set\('v'/);
});
