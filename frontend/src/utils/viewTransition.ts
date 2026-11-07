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

export type ViewTransitionOptions = {
  /**
   * کارهایی که باید **پیش از** گرفتن عکس اول تمام شوند.
   *
   * صفحه‌های جزئیات با `React.lazy` بار می‌شوند؛ اگر بستهٔ مقصد آماده نباشد،
   * عکس دوم به‌جای سربرگ، همان لودر Suspense را می‌گیرد و مورف انجام نمی‌شود.
   * با `prepare` بستهٔ مقصد (و هر دادهٔ لازم) پیش از شروع گذار آماده می‌شود.
   */
  prepare?: () => Promise<unknown>;
};

/**
 * اجرای یک به‌روزرسانی (ناوبری یا تغییر وضعیت) داخل گذار مرورگر.
 *
 * `flushSync` لازم است چون React به‌طور پیش‌فرض به‌روزرسانی‌ها را در میکروتسک
 * انجام می‌دهد و مرورگر باید نسخهٔ تازهٔ DOM را همان لحظه ببیند تا عکس دوم را
 * از محتوای درست بگیرد. همچنین روتر باید بدون `startTransition` تنظیم شده باشد
 * (`<BrowserRouter useTransitions={false}>`)، وگرنه این commit هم به تعویق می‌افتد.
 */
export function runViewTransition(update: () => void, options: ViewTransitionOptions = {}): void {
  if (inFlight || !viewTransitionsAvailable()) {
    // حتی وقتی گذار ممکن نیست، آماده‌سازی مقصد به تجربهٔ بعدی کمک می‌کند.
    if (options.prepare) void options.prepare().catch(() => undefined).finally(update);
    else update();
    return;
  }
  const prepare = options.prepare;
  if (prepare) {
    // قفل تا پایان آماده‌سازی: کلیک دوم نباید دو ناوبری بسازد.
    inFlight = true;
    void prepare()
      .catch(() => undefined)
      .then(() => {
        inFlight = false;
        startTransitionNow(update);
      });
    return;
  }
  startTransitionNow(update);
}

function startTransitionNow(update: () => void): void {
  if (!viewTransitionsAvailable() || inFlight) {
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
