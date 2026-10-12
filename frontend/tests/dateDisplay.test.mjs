import assert from 'node:assert/strict';
import test from 'node:test';
import { formatPersianDate, formatPersianTime, formatPersianDateTime } from '../src/utils/date.ts';

test('publication dates treat ISO date-only strings as local calendar dates and show Persian numerals', () => {
  const value = formatPersianDate('2026-03-21');
  assert.match(value, /۱۴۰۵/);
  assert.match(value, /فروردین/);
  assert.match(value, /۱/);
});

test('publication time accepts ASCII and Persian digits and does not invent a missing time', () => {
  assert.equal(formatPersianTime('9:05'), '۰۹:۰۵');
  assert.equal(formatPersianTime('۲۱:۳۰'), '۲۱:۳۰');
  assert.equal(formatPersianDateTime('2026-03-21'), '۱ فروردین ۱۴۰۵');
  assert.match(formatPersianDateTime('2026-03-21', '09:05'), /ساعت ۰۹:۰۵/);
});
