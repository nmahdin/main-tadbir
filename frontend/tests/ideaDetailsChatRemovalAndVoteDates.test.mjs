import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PERSIAN_MONTH_NAMES, gregorianToJalali, toPersianDigits } from '../src/utils/jalali.ts';

const modal = readFileSync(new URL('../src/components/thought-room/IdeaDetailsModal.tsx', import.meta.url), 'utf8');
const dateUtils = readFileSync(new URL('../src/utils/date.ts', import.meta.url), 'utf8');

/**
 * مدال جزئیات ایده: دکمهٔ گفتگو با طراح ایده حذف شده و تاریخ آرا (و بقیهٔ
 * لحظه‌های ثبت در همین مدال) شمسی نمایش داده می‌شود.
 */
test('the "chat with the idea owner" action is removed from the idea modal', () => {
  assert.doesNotMatch(modal, /گفتگو با طراح ایده/);
  assert.doesNotMatch(modal, /startDirectChatWithUser/);
  assert.doesNotMatch(modal, /MessageCircle/);
  // بقیهٔ اکشن‌های پابرجا باید دست‌نخورده بمانند.
  assert.match(modal, /ویرایش ایده/);
  assert.match(modal, /حذف ایده/);
});

test('registered votes show a Jalali moment instead of the raw ISO string', () => {
  assert.match(modal, /const persianMoment = \(value\?: string \| null\): string =>\s*formatPersianIsoDateTime\(value\) \|\| \(value \? String\(value\) : ''\);/);
  assert.match(modal, /<div className="text-\[11px\] text-slate-400">\{persianMoment\(vote\.timestamp\)\}<\/div>/);
  // همان اصلاح برای دیدگاه‌ها و تاریخچهٔ همان مدال هم اعمال شده است.
  assert.match(modal, /\{persianMoment\(comment\.timestamp\)\}/);
  assert.match(modal, /\{persianMoment\(act\.timestamp\)\}/);
  // تاریخ خام میلادی دیگر مستقیم رندر نمی‌شود.
  assert.doesNotMatch(modal, /\{(vote|comment|act)\.timestamp\}/);
});

test('the Jalali formatter used by the modal produces Persian date and clock', () => {
  // همان مسیر `formatPersianIsoDateTime`: میلادی → جلالی + نام ماه + ارقام فارسی.
  const { jy, jm, jd } = gregorianToJalali(2026, 9, 28);
  assert.deepEqual({ jy, jm, jd }, { jy: 1405, jm: 7, jd: 6 });
  assert.equal(PERSIAN_MONTH_NAMES[jm - 1], 'مهر');
  assert.equal(toPersianDigits(jd), '۶');
  assert.equal(toPersianDigits(jy), '۱۴۰۵');

  // و خودِ تابع تاریخ‌زمان، همین تاریخ شمسی را با ساعت فارسی برمی‌گرداند.
  assert.match(dateUtils, /export const formatPersianIsoDateTime = \(value\?: string \| Date \| null\): string =>/);
  assert.match(dateUtils, /return formatPersianDateTime\(String\(value\), `\$\{String\(date\.getHours\(\)\)\.padStart\(2, '0'\)\}:\$\{String\(date\.getMinutes\(\)\)\.padStart\(2, '0'\)\}`\);/);
  assert.match(dateUtils, /const parts = \[formatPersianDateLong\(date\), formatPersianTime\(time\) && `ساعت \$\{formatPersianTime\(time\)\}`\]/);
});
