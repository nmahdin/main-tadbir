import { flushSync } from 'react-dom';

/**
 * گذار بین صفحه‌ها با View Transitions (دور ۹۶).
 *
 * با کلیک روی یک ردیف/کارت فهرست، به‌جای تعویض ناگهانی صفحه، مرورگر از صفحهٔ
 * فعلی و صفحهٔ بعد عکس می‌گیرد و عنوانِ کارت را به سربرگ صفحهٔ مقصد مورف می‌کند.
 * هر دو طرف باید `viewTransitionName` یکسان داشته باشند؛ نامش از `morphName`
 * می‌آید تا در فهرست و در صفحات جزئیات دقیقاً یکی باشد.
 *
 * قواعد ایمنی:
 * - اگر مرورگر `startViewTransition` نداشته باشد (فایرفاکس تا امروز)، یا کاربر
 *   `prefers-reduced-motion` را روشن کرده باشد، همان ناوبری ساده انجام می‌شود؛
 *   هیچ رفتاری از دست نمی‌رود و هیچ خطایی گرفته نمی‌شود.
 * - تا وقتی یک گذار در جریان است، گذار دوم باز نمی‌شود (کلیک پشت‌سرهم).
 * - در طول گذار، انیمیشن ورود صفحه‌ها فوراً تمام می‌شود؛ وگرنه عکس «صفحهٔ
 *   بعد» در حالت شفاف ثبت می‌شد و محتوا بی‌رنگ به‌نظر می‌رسید.
 */

type TransitionDocument = Document & {
  startViewTransition?: (update: () => void) => { finished: Promise<void> };
};

/** پرچم روی `<html>` تا CSS بداند گذار در جریان است. */
export const VIEW_TRANSITION_ATTRIBUTE = 'data-view-transition';

let inFlight = false;

const reducedMotion = () =>
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function viewTransitionsAvailable(): boolean {
  if (typeof document === 'undefined') return false;
  if (typeof (document as TransitionDocument).startViewTransition !== 'function') return false;
  return !reducedMotion();
}

/**
 * نام یکتای عنصر برای مورف شدن. فقط حروف/ارقام لاتین مجاز است (مقدارهای دیگر
 * با `-` جایگزین می‌شوند) تا نام CSS معتبر بماند.
 */
export function morphName(kind: 'content' | 'project' | 'task', id: string | number): string {
  return `tadbir-${kind}-${String(id ?? '').replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}

/**
 * اجرای یک به‌روزرسانی (ناوبری یا تغییر وضعیت) داخل گذار مرورگر.
 *
 * `flushSync` لازم است چون React به‌طور پیش‌فرض به‌روزرسانی‌ها را در میکروتسک
 * انجام می‌دهد و مرورگر باید نسخهٔ تازهٔ DOM را همان لحظه ببیند تا عکس دوم را
 * از محتوای درست بگیرد.
 */
export function runViewTransition(update: () => void): void {
  if (inFlight || !viewTransitionsAvailable()) {
    update();
    return;
  }
  const start = (document as TransitionDocument).startViewTransition!;
  inFlight = true;
  const root = document.documentElement;
  root.setAttribute(VIEW_TRANSITION_ATTRIBUTE, 'true');
  let transition: { finished: Promise<void> };
  try {
    transition = start(() => {
      flushSync(update);
    });
  } catch {
    // اگر مرورگر نپذیرفت، ناوبری باید انجام شود؛ انیمیشن لوکس است، نه لازم.
    root.removeAttribute(VIEW_TRANSITION_ATTRIBUTE);
    inFlight = false;
    update();
    return;
  }
  void transition.finished.finally(() => {
    root.removeAttribute(VIEW_TRANSITION_ATTRIBUTE);
    inFlight = false;
  });
}
