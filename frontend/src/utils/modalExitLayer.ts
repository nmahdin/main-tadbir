import { prefersReducedMotion } from '../components/common/useModalExit';

/**
 * انیمیشن خروج مدال‌های دست‌ساز.
 *
 * کامپوننت مشترک `Modal` انیمیشن خروج خودش را دارد (وضعیت `closing` پیش از
 * بسته‌شدن)، اما ده‌ها مدال در سامانه پوشش و کادر اختصاصی خودشان را می‌سازند و
 * با `{cond && …}` رندر می‌شوند؛ در نتیجه با فشردن «انصراف» یا «بستن» همان
 * لحظه از DOM حذف می‌شدند و هیچ انیمیشنی دیده نمی‌شد.
 *
 * این لایه یک شنوندهٔ سراسری در فاز capture نصب می‌کند: اگر کلیک روی یک دکمهٔ
 * بستنِ داخل یک پوشش تمام‌صفحه (پنجرهٔ مدال) باشد، اول همان کلیک متوقف می‌شود،
 * پوشش و کادرش انیمیشن خروج می‌گیرند، و بعد همان کلیک تکرار می‌شود تا رفتار
 * خود برنامه (بستن والد، پاک‌سازی فرم) دقیقاً مثل قبل اجرا شود.
 *
 * مدال‌های مشترک (`.ui-modal`) از این مسیر کنار گذاشته می‌شوند؛ آن‌ها انیمیشن
 * خروج دقیق‌تر خودشان را دارند و مدیریت دوگانه باعث پرش می‌شد.
 */
const EXIT_MS = 170;

/**
 * برچسب‌هایی که در مدال‌های دست‌ساز یعنی «بستن».
 * «بازگشت» عمداً نیست: در جریان‌های چندمرحله‌ای همین برچسب به مرحلهٔ قبل
 * برمی‌گردد و محوکردن مدال در آن حالت فقط پرش بصری می‌ساخت.
 */
const DISMISS_LABELS = new Set(['انصراف', 'بستن', 'انصراف و بستن']);

/** نزدیک‌ترین پوشش تمام‌صفحه‌ای که این دکمه داخلش است. */
const findOverlay = (element: HTMLElement): HTMLElement | null => {
  let node = element.parentElement;
  while (node && node !== document.body) {
    const style = window.getComputedStyle(node);
    if (style.position === 'fixed') {
      const rect = node.getBoundingClientRect();
      // فقط لایه‌های تمام‌صفحه؛ نوارهای چسبان کوچک نباید محو شوند.
      if (rect.width >= window.innerWidth * 0.85 && rect.height >= window.innerHeight * 0.85) return node;
    }
    node = node.parentElement;
  }
  return null;
};

const isDismissButton = (button: HTMLElement): boolean => {
  if (button.matches('[data-button-action="cancel"], [data-modal-close]')) return true;
  const label = (button.getAttribute('aria-label') || '').trim();
  if (DISMISS_LABELS.has(label)) return true;
  const text = (button.textContent || '').replace(/\s+/g, ' ').trim();
  return DISMISS_LABELS.has(text);
};

/**
 * نصب لایهٔ انیمیشن خروج؛ تابع پاک‌سازی برمی‌گرداند.
 * چند بار صدا زدنش بی‌خطر است (فقط یک شنونده نصب می‌شود).
 */
let uninstall: (() => void) | null = null;

export function installModalExitLayer(): () => void {
  if (uninstall) return uninstall;
  if (typeof document === 'undefined') return () => undefined;

  let replaying = false;
  let pending: number | null = null;

  const onClick = (event: MouseEvent) => {
    if (event.defaultPrevented) return;
    if (replaying) { replaying = false; return; }
    if (prefersReducedMotion()) return;
    const target = event.target as HTMLElement | null;
    const button = target?.closest<HTMLElement>('button, [role="button"], a');
    if (!button) return;
    // مدال مشترک انیمیشن خروج خودش را دارد.
    if (button.closest('.ui-modal')) return;
    if (!isDismissButton(button)) return;
    const overlay = findOverlay(button);
    if (!overlay) return;

    event.preventDefault();
    event.stopPropagation();
    overlay.classList.add('ui-layer-out');
    const panel = overlay.firstElementChild as HTMLElement | null;
    if (panel) panel.classList.add('ui-panel-out');
    if (pending !== null) window.clearTimeout(pending);
    pending = window.setTimeout(() => {
      pending = null;
      overlay.classList.remove('ui-layer-out');
      panel?.classList.remove('ui-panel-out');
      replaying = true;
      button.click();
      window.setTimeout(() => { replaying = false; }, 400);
    }, EXIT_MS);
  };

  document.addEventListener('click', onClick, true);
  uninstall = () => {
    document.removeEventListener('click', onClick, true);
    if (pending !== null) window.clearTimeout(pending);
    uninstall = null;
  };

  return uninstall;
}
