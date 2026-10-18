import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8');
const app = read('../src/app/App.tsx');
const lab = read('../src/features/showcase/UiShowcaseThemeComparison.tsx');
const styles = read('../src/features/showcase/uiShowcaseThemes.css');
const ds = read('../src/index.css');

test('public theme preview route is accessible without login', () => {
  assert.match(app, /<Route path="\/theme-previews" element=/);
  assert.match(app, /const UiShowcaseThemeComparison = React\.lazy/);
  assert.doesNotMatch(app, /const UiShowcaseThemeComparison = import\.meta\.env\.DEV/);
});

test('theme preview renders the real UI showcase and switches all four palettes', () => {
  assert.match(lab, /<UiShowcasePage \/>/);
  for (const key of ['forest', 'mint', 'sun', 'sky']) {
    assert.match(lab, new RegExp("key: '" + key + "'"));
    assert.match(styles, new RegExp("tadbir-theme-lab--" + key));
    assert.match(styles, new RegExp("data-tadbir-theme-preview='" + key + "'"));
  }
});

test('theme palettes override the actual design-system tokens, not only the background', () => {
  for (const token of [
    '--color-primary', '--color-primary-hover', '--color-background',
    '--color-surface', '--color-surface-muted', '--color-border',
    '--color-text', '--color-text-muted'
  ]) {
    assert.ok(styles.includes(token + ':'), 'missing theme mapping for ' + token);
    assert.ok(ds.includes(token + ':'), 'not a real DS token: ' + token);
  }
  for (const component of ['.ui-button-primary', '.ui-tab[aria-selected=', '.ui-input', ".ui-badge-primary", "input[type='checkbox']:checked"]) {
    assert.ok(ds.includes(component), 'no shared styling for ' + component);
  }
});

test('portaled dialogs inherit theme and route cleanup restores normal styling', () => {
  assert.match(lab, /document\.body\.dataset\.tadbirThemePreview = active/);
  assert.match(lab, /delete document\.body\.dataset\.tadbirThemePreview/);
  assert.match(styles, /body\[data-tadbir-theme-preview\]/);
  assert.doesNotMatch(lab, /localStorage|fetch\(|useQuery|useAuth/);
});
