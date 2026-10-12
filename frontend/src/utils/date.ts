import { toPersianDigits } from './jalali.ts';

const toAsciiDigits = (value: string) => value.replace(/[۰-۹٠-٩]/g, digit => String('۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩'.indexOf(digit) % 10));

function parseDisplayDate(value: string): Date {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) {
    // Date-only values represent a calendar day, not midnight UTC. Parse locally
    // so the Jalali display never shifts a stored date by the browser's timezone.
    return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  }
  return new Date(value);
}

export const formatPersianDate = (dateStr?: string) => {
  if (!dateStr) return '';
  try {
    const date = parseDisplayDate(dateStr);
    if (Number.isNaN(date.getTime())) return dateStr;
    return new Intl.DateTimeFormat('fa-IR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(date);
  } catch {
    return dateStr;
  }
};

export const formatPersianTime = (time?: string) => {
  if (!time?.trim()) return '';
  const normalized = toAsciiDigits(time.trim());
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(normalized);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return toPersianDigits(time.trim());
  return toPersianDigits(`${match[1].padStart(2, '0')}:${match[2]}`);
};

/** Display an ISO calendar date and optional clock time in Persian without altering stored values. */
export const formatPersianDateTime = (date?: string, time?: string) => {
  const dateLabel = formatPersianDate(date);
  let timeLabel = formatPersianTime(time);
  if (!timeLabel && date && /[T ]\d{1,2}:\d{2}/.test(date)) {
    try {
      const parsed = new Date(date);
      if (!Number.isNaN(parsed.getTime())) {
        timeLabel = new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(parsed);
      }
    } catch {
      // Keep a valid date-only label if a timestamp's time component is malformed.
    }
  }
  if (dateLabel && timeLabel) return `${dateLabel}، ساعت ${timeLabel}`;
  return dateLabel || (timeLabel ? `ساعت ${timeLabel}` : '');
};
