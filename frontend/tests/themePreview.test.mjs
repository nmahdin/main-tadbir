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

test('seven palettes override the actual design-system color tokens without changing :root', () => {
  for (const key of ['forest', 'mint', 'sun', 'sky', 'sage', 'coast', 'peach']) {
    assert.match(css, new RegExp('tadbir-theme-lab--' + key + '\\b'));
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
  assert.match(css, /body\[data-tadbir-theme-preview='forest'\]/);
  assert.match(preview, /document\.body\.dataset\.tadbirThemePreview = active/);
  assert.doesNotMatch(css, /--color-danger\s*:/);
  assert.doesNotMatch(css, /--color-warning\s*:/);
  assert.doesNotMatch(css, /--color-success\s*:/);
});

test('user-supplied palettes retain all four original HEX values in theme selectors', () => {
  const palettes = {
    sage: ['#FAF9EE', '#A2AF9B', '#DCCFC0', '#EEEEEE'],
    coast: ['#96B6C5', '#ADC4CE', '#EEE0C9', '#F1F0E8'],
    peach: ['#94B49F', '#CEE5D0', '#FCF8E8', '#ECB390'],
  };
  for (const [key, colors] of Object.entries(palettes)) {
    const section = preview.split("key: '" + key + "'")[1]?.split('},')[0] ?? '';
    for (const color of colors) assert.ok(section.includes(color), key + ' must include ' + color);
  }
});
