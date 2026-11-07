/**
 * قرارداد یکتای جلسه‌ها: تاریخ، ساعت شروع/پایان، مهمان‌ها و شمارنده‌های تب.
 *
 * چرا این فایل: تاریخ جلسه در دادهٔ قدیمی دو شکل دارد (شمسی `۱۴۰۵/۰۶/۱۵` و
 * میلادی `2026-09-06`) و فیلتر بازهٔ تاریخ نمی‌تواند بر مقایسهٔ رشته‌ای خام
 * تکیه کند. همین‌جا هر دو شکل به یک کلید `YYYY-MM-DD` میلادی تبدیل می‌شوند که
 * مقایسه‌اش درست است و نمایشش هم با `formatPersianDate` شمسی می‌ماند.
 *
 * هیچ وابستگی‌ای جز توابع تقویم لازم نیست، تا آزمون‌های نود همین منطق واقعی را
 * اجرا کنند.
 */
import { toEnglishDigits } from './jalali.ts';
import { toIsoDateKey } from './isoDate.ts';

/** ساعت را از ارقام فارسی/عربی به `HH:MM` استاندارد تبدیل می‌کند. */
export const normalizeClock = (value?: string | null): string => {
  if (!value) return '';
  const raw = toEnglishDigits(String(value)).trim();
  const match = raw.match(/^(\d{1,2})[:.](\d{1,2})/);
  if (!match) return '';
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return '';
  if (hours > 23 || minutes > 59) return '';
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

/** دقیقه‌های یک بازهٔ «۹۰ دقیقه»/«۱ ساعت»/«45» را می‌خواند. */
export const durationMinutes = (duration?: string | null): number => {
  if (!duration) return 0;
  const raw = toEnglishDigits(String(duration));
  const hours = raw.match(/(\d+)\s*(ساعت|hour)/i);
  const minutes = raw.match(/(\d+)\s*(دقیقه|min)/i);
  if (hours || minutes) return (hours ? Number(hours[1]) * 60 : 0) + (minutes ? Number(minutes[1]) : 0);
  const plain = raw.match(/(\d+)/);
  return plain ? Number(plain[1]) : 0;
};

/** افزودن دقیقه به ساعت `HH:MM`؛ خروجی همیشه همان قالب یا رشتهٔ خالی است. */
export const addMinutesToClock = (clock?: string | null, minutes = 0): string => {
  const normalized = normalizeClock(clock);
  if (!normalized) return '';
  const [hours, mins] = normalized.split(':').map(Number);
  const total = (hours * 60 + mins + minutes + 24 * 60) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

/** فاصلهٔ دو ساعت به دقیقه؛ اگر پایان پیش از شروع باشد مقدار منفی می‌شود. */
export const clockGapMinutes = (start?: string | null, end?: string | null): number => {
  const from = normalizeClock(start);
  const to = normalizeClock(end);
  if (!from || !to) return 0;
  const [sh, sm] = from.split(':').map(Number);
  const [eh, em] = to.split(':').map(Number);
  return (eh * 60 + em) - (sh * 60 + sm);
};

/** «۹۰ دقیقه» خوانا از دو ساعت؛ برای نمایش روی کارت جلسه. */
export const readableGap = (start?: string | null, end?: string | null): string => {
  const gap = clockGapMinutes(start, end);
  if (gap <= 0) return '';
  const hours = Math.floor(gap / 60);
  const minutes = gap % 60;
  if (hours && minutes) return `${hours} ساعت و ${minutes} دقیقه`;
  if (hours) return `${hours} ساعت`;
  return `${minutes} دقیقه`;
};

/** مهمان‌ها همیشه آرایه‌ای از نام‌های تمیز و بی‌تکرار هستند. */
export const parseGuests = (input?: string | string[] | null): string[] => {
  if (!input) return [];
  const list = Array.isArray(input) ? input : String(input).split(/[،,\n]/);
  const seen = new Set<string>();
  const guests: string[] = [];
  list.forEach(item => {
    const name = String(item ?? '').replace(/\s+/g, ' ').trim();
    if (!name || seen.has(name)) return;
    seen.add(name);
    guests.push(name);
  });
  return guests.slice(0, 50);
};

/** کلید میلادی `YYYY-MM-DD` برای مقایسهٔ درست تاریخ‌های شمسی و میلادی. */
export const meetingIsoDate = (value?: string | null): string => toIsoDateKey(value);

/** جلسه‌هایی که «برگزار نشده‌اند»: نه برگزار شده، نه لغو، نه بایگانی. */
export const MEETING_PENDING_STATUSES = ['scheduled', 'in_progress'] as const;

export const isMeetingPending = (meeting: { status?: string | null }): boolean =>
  (MEETING_PENDING_STATUSES as readonly string[]).includes(String(meeting.status || 'scheduled'));

export const pendingMeetingCount = (meetings: ReadonlyArray<{ status?: string | null }>): number =>
  meetings.filter(meeting => isMeetingPending(meeting)).length;

/** ایده‌هایی که «باز و تکمیل‌نشده» هستند. */
export const CLOSED_IDEA_STATUSES = ['implemented', 'completed', 'rejected', 'archived'] as const;

export const isIdeaOpen = (idea: { status?: string | null }): boolean =>
  !(CLOSED_IDEA_STATUSES as readonly string[]).includes(String(idea.status || ''));

export const openIdeaCount = (ideas: ReadonlyArray<{ status?: string | null }>): number =>
  ideas.filter(idea => isIdeaOpen(idea)).length;
