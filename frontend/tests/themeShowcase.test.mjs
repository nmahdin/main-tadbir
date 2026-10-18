import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8');
const app = read('../src/app/App.tsx');
const lab = read('../src/features/showcase/UiShowcaseThemeComparison.tsx');
const styles = read('../src/features/showcase/uiShowcaseThemes.css');
const ds = read('../src/index.css');

// Canonical-theme contract (CORE-UX-FIX-01): the product owner
// designated /theme-previews as the sole design reference with a
// SINGLE approved palette (#39677C "ocean"). Earlier candidate
// palettes were deliberately removed by the owner; these tests
// pin the approved single-palette state and the invariant that
// the preview and the application share the same semantic tokens.

test('public theme preview route is accessible without login', () => {
  assert.match(app, /<Route path="\/theme-previews" element=/);
  assert.match(app, /const UiShowcaseThemeComparison = React\.lazy/);
  assert.doesNotMatch(app, /const UiShowcaseThemeComparison = import\.meta\.env\.DEV/);
});

test('theme preview renders the real component gallery with the single approved palette', () => {
  assert.match(lab, /<UiShowcasePage \/>/);
  assert.match(lab, /#39677C/);
  assert.match(lab, /document\.body\.dataset\.tadbirThemePreview = 'ocean'/);
  // Candidate palettes were removed by the owner; none may return.
  assert.doesNotMatch(lab, /forest|mint|sun|sky/);
  assert.doesNotMatch(styles, /tadbir-theme-lab--(forest|mint|sun|sky)/);
  assert.doesNotMatch(styles, /data-tadbir-theme-preview='(forest|mint|sun|sky)'/);
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
  // The application root carries the same approved primary identity.
  assert.match(ds, /--color-primary:\s*#39677c/);
  assert.match(ds, /--color-primary-hover:\s*#2b5266/);
  for (const component of ['.ui-button-primary', '.ui-tab[aria-selected=', '.ui-input', ".ui-badge-primary", "input[type='checkbox']:checked"]) {
    assert.ok(ds.includes(component), 'no shared styling for ' + component);
  }
});

test('portaled dialogs inherit theme and route cleanup restores normal styling', () => {
  assert.match(lab, /document\.body\.dataset\.tadbirThemePreview = 'ocean'/);
  assert.match(lab, /delete document\.body\.dataset\.tadbirThemePreview/);
  assert.match(styles, /body\[data-tadbir-theme-preview='ocean'\]/);
  assert.doesNotMatch(lab, /localStorage|fetch\(|useQuery|useAuth/);
});
