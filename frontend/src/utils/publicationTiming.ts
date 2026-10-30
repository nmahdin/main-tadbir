/**
 * قرارداد یکتای «زمان‌بندی انتشار» در مرورگر: لحظهٔ دقیق انتشار، فاصلهٔ روز/ساعت
 * تا آن، ردهٔ رنگی و ترتیب مرتب‌سازی.
 *
 * سه جا از همین یک منبع می‌خوانند: ستون «تاریخ انتشار» فهرست محتوا، کادرهای
 * «مهلت نهایی» و «برنامه انتشار» صفحهٔ جزئیات، و مرتب‌سازی میز انتشار.
 *
 * این فایل هیچ وابستگی وارد نمی‌کند (همان الگوی `utils/publicationCommand.ts`)
 * تا آزمون‌های نود بتوانند همین منطق واقعی را اجرا کنند: روز و ساعت مانده، ردهٔ
 * رنگ و ترتیب. هیچ تاریخی جعل نمی‌شود؛ هرجا مقدار ثبت‌شده نباشد «تعیین نشده»
 * گزارش می‌شود.
 */

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const fa = (value: number | string): string => String(value).replace(/\d/g, digit => PERSIAN_DIGITS[Number(digit)]);

export type PublicationTone = 'published' | 'past' | 'today' | 'soon' | 'later' | 'unknown';

/**
 * ردهٔ رنگ زمان انتشار. رده‌ها همان واژگان مهلت مرحله‌هاست: گذشته ملایم بنفش،
 * امروز قرمز ملایم، یک روز مانده کهربایی، دورتر خنثی و منتشرشده سبز.
 */
export const PUBLICATION_TONE_CLASSES: Record<PublicationTone, string> = {
  published: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  past: 'border-violet-200 bg-violet-50 text-violet-700',
  today: 'border-rose-200 bg-rose-50 text-rose-700',
  soon: 'border-amber-200 bg-amber-50 text-amber-800',
  later: 'border-slate-200 bg-slate-50 text-slate-500',
  unknown: 'border-slate-200 bg-slate-50 text-slate-500',
};

/** همان رده با زمینهٔ ملایم‌تر برای کارت‌های اطلاعاتی صفحهٔ جزئیات. */
export const PUBLICATION_SURFACE_TONE_CLASSES: Record<PublicationTone, string> = {
  published: 'border-emerald-200 bg-emerald-50/70',
  past: 'border-violet-200 bg-violet-50/70',
  today: 'border-rose-200 bg-rose-50/70',
  soon: 'border-amber-200 bg-amber-50/70',
  later: 'border-slate-100 bg-slate-50/70',
  unknown: 'border-slate-100 bg-slate-50/70',
};

/** رنگ متن همان رده روی زمینهٔ ملایم. */
export const PUBLICATION_TEXT_TONE_CLASSES: Record<PublicationTone, string> = {
  published: 'text-emerald-700',
  past: 'text-violet-700',
  today: 'text-rose-700',
  soon: 'text-amber-800',
  later: 'text-slate-800',
  unknown: 'text-slate-800',
};

/** رنگ آیکون همان رده. */
export const PUBLICATION_ICON_TONE_CLASSES: Record<PublicationTone, string> = {
  published: 'text-emerald-500',
  past: 'text-violet-500',
  today: 'text-rose-500',
  soon: 'text-amber-500',
  later: 'text-slate-400',
  unknown: 'text-slate-400',
};

export interface PublicationSchedule {
  date?: string | null;
  time?: string | null;
  status?: string | null;
}

export interface PublicationMoment {
  /** لحظهٔ دقیق انتشار به وقت محلی کاربر. */
  moment: Date;
  /** تاریخ انتشار به شکل `YYYY-MM-DD` (همان مقداری که ذخیره شده). */
  iso: string;
  /** ساعت نرمال‌شده `HH:MM`؛ اگر ساعتی ثبت نشده باشد رشتهٔ خالی است. */
  time: string;
  hasTime: boolean;
}

/**
 * لحظهٔ انتشار از «تاریخ + ساعت» ثبت‌شده. اگر تاریخ ثبت نشده باشد `null` است و
 * هیچ تاریخ یا ساعت پیش‌فرضی ساخته نمی‌شود.
 */
export const publicationMoment = (schedule?: PublicationSchedule | null): PublicationMoment | null => {
  const iso = String(schedule?.date ?? '').trim().slice(0, 10);
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!parts) return null;
  const clock = /^(\d{1,2}):(\d{1,2})/.exec(String(schedule?.time ?? '').trim());
  const hours = clock ? Math.min(23, Number(clock[1])) : 0;
  const minutes = clock ? Math.min(59, Number(clock[2])) : 0;
  const moment = new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]), hours, minutes, 0, 0);
  if (Number.isNaN(moment.getTime())) return null;
  return { moment, iso, time: clock ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}` : '', hasTime: Boolean(clock) };
};

/** فاصلهٔ روزهای تقویمی بین دو تاریخ محلی (بدون لغزش ساعت تابستانی). */
const calendarDaysBetween = (from: Date, to: Date): number =>
  Math.round((Date.UTC(to.getFullYear(), to.getMonth(), to.getDate()) - Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())) / 86_400_000);

export interface PublicationRemaining {
  tone: PublicationTone;
  /** روزهای کامل، به‌صورت قدر مطلق؛ جهت با `overdue` مشخص می‌شود. */
  days: number;
  /** ساعت‌های باقی‌ماندهٔ همان روز؛ فقط وقتی ساعت انتشار ثبت شده باشد معنا دارد. */
  hours: number;
  /** گذشته یا نرسیده. */
  overdue: boolean;
  /** آیا ساعت انتشار ثبت شده است (تعیین‌کنندهٔ دقت برچسب). */
  hasTime: boolean;
  /** برچسب فارسی: مثلاً «۳ روز و ۵ ساعت مانده» یا «۲ روز گذشته». */
  label: string;
}

/**
 * فاصلهٔ زمانی تا انتشار. اگر ساعت ثبت شده باشد محاسبه لحظه‌ای است (روز و ساعت)
 * و اگر فقط تاریخ باشد، محاسبه روزمحور است تا «امروز» هرگز «گذشته» شمرده نشود.
 */
export const publicationRemaining = (
  schedule?: PublicationSchedule | null,
  options: { now?: Date; published?: boolean } = {},
): PublicationRemaining | null => {
  const parsed = publicationMoment(schedule);
  if (!parsed) return null;
  const now = options.now ?? new Date();
  // وضعیت «منتشرشده» هم از فراخوانی و هم از خودِ برنامهٔ انتشار خوانده می‌شود تا
  // هیچ فراخوانی نتواند یک محتوای منتشرشده را «در انتظار» نشان دهد.
  if (options.published === true || schedule?.status === 'published') {
    return { tone: 'published', days: 0, hours: 0, overdue: false, hasTime: parsed.hasTime, label: 'منتشر شده است' };
  }

  const dayDifference = calendarDaysBetween(now, parsed.moment);
  const minutes = Math.round((parsed.moment.getTime() - now.getTime()) / 60_000);
  // با ساعت ثبت‌شده، ملاک همان لحظه است؛ بدون ساعت، تمام روز مهلت دارد.
  const overdue = parsed.hasTime ? minutes < 0 : dayDifference < 0;
  const absolute = Math.abs(minutes);
  const days = parsed.hasTime ? Math.floor(absolute / 1440) : Math.abs(dayDifference);
  const hours = parsed.hasTime ? Math.floor((absolute % 1440) / 60) : 0;
  // رنگ‌بندی درخواستی: گذشته بنفش، ≤۱ روز قرمز، ≤۴ روز زرد، بقیه خنثی.
  const tone: PublicationTone = overdue ? 'past' : dayDifference <= 1 ? 'today' : dayDifference <= 4 ? 'soon' : 'later';

  const label = overdue
    ? days > 0
      ? `${fa(days)} روز گذشته`
      : parsed.hasTime && hours > 0 ? `${fa(hours)} ساعت گذشته` : 'از موعد انتشار گذشته است'
    : days > 0
      ? parsed.hasTime ? `${fa(days)} روز و ${fa(hours)} ساعت مانده` : `${fa(days)} روز مانده`
      : parsed.hasTime
        ? hours > 0 ? `${fa(hours)} ساعت مانده` : 'کمتر از یک ساعت مانده'
        : 'امروز';

  return { tone, days, hours, overdue, hasTime: parsed.hasTime, label };
};

/** آیا این پرونده واقعاً منتشر شده است؟ منبع یکتای این تصمیم در مرورگر. */
export const isPublishedContent = (content: { status?: string | null; publishInfo?: PublicationSchedule | null }): boolean =>
  content.status === 'published' || content.publishInfo?.status === 'published';

export interface PublicationSortable extends PublicationSchedule {
  /** وضعیت انتشار همان پرونده (اگر محتوا منتشر شده باشد). */
  published?: boolean;
}

/**
 * ترتیب همیشگی بر اساس تاریخ انتشار:
 * ۱) موارد منتشرنشدهٔ زمان‌بندی‌شده از نزدیک‌ترین تاریخ به دورترین،
 * ۲) موارد منتشرشده از تازه‌ترین به قدیمی‌ترین،
 * ۳) موارد بدون تاریخ انتشار در پایان و با ترتیب خودشان.
 */
export const sortByPublicationMoment = <T,>(items: readonly T[], infoOf: (item: T) => PublicationSortable): T[] =>
  items
    .map((item, index) => {
      const info = infoOf(item);
      const moment = publicationMoment(info)?.moment.getTime() ?? null;
      const published = info.published === true || info.status === 'published';
      const group = moment === null ? 3 : published ? 2 : 1;
      return { item, index, moment, group };
    })
    .sort((left, right) => {
      if (left.group !== right.group) return left.group - right.group;
      if (left.group === 3) return left.index - right.index;
      const leftMoment = left.moment ?? 0;
      const rightMoment = right.moment ?? 0;
      return left.group === 2 ? rightMoment - leftMoment : leftMoment - rightMoment;
    })
    .map(entry => entry.item);
