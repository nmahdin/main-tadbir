/**
 * UX-02-4 (§10): every user-facing date renders Jalali in the
 * effective display timezone (user preference `user.experience.
 * timezone`, default Asia/Tehran). Stored data stays UTC; only
 * presentation converts. Technical values (codes, IDs, ISO inputs)
 * must NOT pass through here.
 */
let displayTimeZone = 'Asia/Tehran';

export function setDisplayTimeZone(timeZone: string | null | undefined): void {
  if (timeZone && typeof timeZone === 'string') displayTimeZone = timeZone;
}

export function getDisplayTimeZone(): string {
  return displayTimeZone;
}

export const formatPersianDate = (dateStr?: string, timeZone: string = displayTimeZone) => {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return new Intl.DateTimeFormat('fa-IR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone
    }).format(d);
  } catch (e) {
    return dateStr;
  }
};

export const formatPersianDateTime = (dateStr?: string, timeZone: string = displayTimeZone) => {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return new Intl.DateTimeFormat('fa-IR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone
    }).format(d);
  } catch (e) {
    return formatPersianDate(dateStr, timeZone);
  }
};
