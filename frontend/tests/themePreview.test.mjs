import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../src/features/showcase/uiShowcaseThemes.css', import.meta.url), 'utf8');
const preview = readFileSync(new URL('../src/features/showcase/UiShowcaseThemeComparison.tsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/app/App.tsx', import.meta.url), 'utf8');
const indexCss = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

test('theme preview has its own public route outside ProtectedRoute', () => {
  assert.match(app, /<Route path="\/theme-previews"/);
  assert.match(app, /React\.lazy\(\(\) => import\('\.\.\/features\/showcase\/UiShowcaseThemeComparison'\)/);
  assert.match(preview, /<UiShowcasePage \/>/);
});

test('four palettes override the actual design-system color tokens without changing :root', () => {
  for (const key of ['forest', 'mint', 'sun', 'sky']) {
    assert.match(css, new RegExp('\\.tadbir-theme-lab--' + key + '\\s*\\{'));
    assert.match(preview, new RegExp("key: '" + key + "'"));
  }
  for (const token of [
    '--color-primary', '--color-primary-hover', '--color-background',
    '--color-surface', '--color-surface-muted', '--color-border',
    '--color-text', '--color-text-muted',
  ]) {
    assert.ok(css.includes(token + ':'), 'theme lab must override ' + token);
  }
  assert.match(indexCss, /\.ui-button-primary\s*\{[^}]*var\(--color-primary\)/);
  assert.match(indexCss, /\.ui-tab\[aria-selected='true'\]\s*\{[^}]*var\(--color-primary\)/);
  assert.match(indexCss, /input\[type='checkbox'\]:checked[^\n]*var\(--color-primary\)/);
  assert.doesNotMatch(css, /:root\s*\{/);
});

test('modal portals receive the active palette, and semantic alert tokens remain untouched', () => {
  assert.match(css, /body:has\(\.tadbir-theme-lab--forest\) > div:has\(> \.ui-modal\)/);
  assert.doesNotMatch(css, /--color-danger\s*:/);
  assert.doesNotMatch(css, /--color-warning\s*:/);
  assert.doesNotMatch(css, /--color-success\s*:/);
});
