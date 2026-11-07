import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('UX-REVIEW-013: custom-select decorative search icon has no visual frame or keyboard focus', () => {
  const select = read('src/shared/ui/Select.tsx');
  const css = read('src/styles/index.css');
  assert.ok(select.includes('className="ui-select-search-icon" aria-hidden="true" focusable="false"'));
  assert.ok(select.includes('className="ui-select-search"'));
  assert.ok(!select.includes('ui-select-search pr-9'));
  assert.ok(css.includes('inset-inline-start: .75rem'));
  assert.ok(css.includes('padding-inline-start: 2.25rem'));
  assert.ok(css.includes('padding-inline-end: .75rem'));
  assert.ok(css.includes('pointer-events: none; border: 0; background: transparent;'));
  assert.ok(css.includes('.ui-select-search:focus-visible { outline: 2px solid var(--color-primary)'));
});

test('UX-REVIEW-013: selector direction, filtering, keyboard and a11y contracts remain intact', () => {
  const select = read('src/shared/ui/Select.tsx');
  assert.ok(select.includes("dir = 'rtl'"));
  assert.ok(select.includes('dir={dir}'));
  for (const part of ['filterSelectOptions(options, event.target.value)', 'onKeyDown={handleKeyDown}', 'aria-label="جست‌وجو در گزینه‌ها"', 'aria-activedescendant', "case 'ArrowDown'", "case 'Escape'", "case 'Tab'", 'role="combobox"']) assert.ok(select.includes(part), part);
});
