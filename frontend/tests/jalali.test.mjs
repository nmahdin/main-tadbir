import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jalaliToGregorian, gregorianToJalali } from '../src/utils/jalali.ts';
test('Jalali leap-year and Gregorian rollover boundaries', () => {
  for (const [j, g] of [
    [[1403, 12, 30], [2025, 3, 20]], [[1404, 1, 1], [2025, 3, 21]],
    [[1404, 12, 29], [2026, 3, 20]], [[1405, 7, 6], [2026, 9, 28]],
  ]) assert.deepEqual(jalaliToGregorian(...j), { gy: g[0], gm: g[1], gd: g[2] });
});
test('all days from 2000 through 2099 round trip without timezone assumptions', () => {
  for (let ms = Date.UTC(2000, 0, 1); ms < Date.UTC(2100, 0, 1); ms += 86400000) {
    const d = new Date(ms), gy = d.getUTCFullYear(), gm = d.getUTCMonth() + 1, gd = d.getUTCDate();
    const j = gregorianToJalali(gy, gm, gd);
    assert.deepEqual(jalaliToGregorian(j.jy, j.jm, j.jd), { gy, gm, gd });
  }
});
