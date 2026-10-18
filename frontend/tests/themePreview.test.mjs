import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../src/features/showcase/uiShowcaseThemes.css', import.meta.url), 'utf8');
const preview = readFileSync(new URL('../src/features/showcase/UiShowcaseThemeComparison.tsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/app/App.tsx', import.meta.url), 'utf8');
const design = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

test('one public preview route reuses real fictional design showcase', () => {
 assert.match(app, /<Route path="\/theme-previews"/);
 assert.match(preview, /<UiShowcasePage \/>/);
 // No palette-SWITCHING machinery may return (the single approved
 // palette is fixed); local useState for the fictional status-color
 // editor is unrelated and allowed.
 assert.doesNotMatch(preview, /setActive|const options|ThemeKey/);
});
test('single palette uses #39677C with actual shared design system tokens', () => {
 assert.match(css, /--color-primary:#39677c/i);
 assert.match(css, /--color-primary-hover:#2b5266/i);
 assert.match(css, /--color-surface-muted:#edf4f7/i);
 assert.match(design, /\.ui-button-primary\s*\{[^}]*var\(--color-primary\)/);
 assert.match(design, /\.ui-tab\[aria-selected='true'\]\s*\{[^}]*var\(--color-primary\)/);
 assert.match(design, /input\[type='checkbox'\]:checked[^\n]*var\(--color-primary\)/);
 assert.doesNotMatch(css, /tadbir-theme-lab--(forest|mint|sun|sky|sage|coast|peach)/);
 assert.doesNotMatch(css, /:root\s*\{/);
});
test('portal and overlay components inherit single demo palette', () => {
 assert.match(css, /body\[data-tadbir-theme-preview='ocean'\]/);
 assert.match(preview, /document\.body\.dataset\.tadbirThemePreview = 'ocean'/);
 assert.doesNotMatch(css, /--color-(danger|warning|success):/);
});
