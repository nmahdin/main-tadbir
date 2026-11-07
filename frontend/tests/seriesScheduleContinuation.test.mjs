import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const view = readFileSync(new URL('../src/components/content/ContentSeriesView.tsx', import.meta.url), 'utf8');
const types = readFileSync(new URL('../src/types.ts', import.meta.url), 'utf8');
const api = readFileSync(new URL('../src/api/contents.ts', import.meta.url), 'utf8');
const detail = readFileSync(new URL('../src/components/content/ContentDetailView.tsx', import.meta.url), 'utf8');

/**
 * ادامهٔ زمان‌بندی مجموعه از تاریخ واقعیِ دورهٔ قبل.
 *
 * وقتی انتشار دوره‌ای به هفتهٔ بعد منتقل می‌شود، دورهٔ بعدی باید هفتهٔ بعدِ همان
 * تاریخ باشد؛ کاربر نباید تاریخ همهٔ دوره‌های بعدی را دستی تعیین کند.
 */
test('series preview exposes the continuation base and its shift', () => {
  assert.match(types, /continuation\?: \{ sequence: number; date: string; shiftDays: number; shifted: boolean \} \| null;/);
});

test('the next-occurrence card explains that dates continue from the real last occurrence', () => {
  assert.match(view, /nextPreview\.continuation\?\.shifted/);
  assert.match(view, /زمان‌بندی از تاریخ واقعی دورهٔ/);
  assert.match(view, /دورهٔ بعدی روی همان روز تکرار نمی‌شود/);
  // تاریخ دورهٔ بعدی همان مقدار سرور است و در رابط جعل نمی‌شود.
  assert.match(view, /publicationDate: nextPreview\.publicationDate \|\| nextPreview\.startDate/);
});

test('the create dialog warns when the schedule follows a moved occurrence', () => {
  assert.match(view, /preview\?\.continuation\?\.shifted && <p/);
  assert.match(view, /تاریخ این دوره از تاریخ واقعی دورهٔ/);
});

test('saving the publication of a series occurrence reports how many later ones moved', () => {
  assert.match(api, /shiftedOccurrences\?: number; shiftedDays\?: number/);
  assert.match(detail, /const shifted = Number\(saved\.meta\?\.shiftedOccurrences \|\| 0\)/);
  assert.match(detail, /پروندهٔ بعدی این مجموعه هم به همان اندازه جابه‌جا شد/);
});
