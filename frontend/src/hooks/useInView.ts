import { useEffect, useRef, useState, type RefObject } from 'react';

type InViewOptions = {
  /**
   * حاشیهٔ دیده‌شدن. مثلاً `240px` یعنی تصویر کمی **پیش از** رسیدن کارت به
   * لبهٔ صفحه هم آماده می‌شود تا با اسکرول، خالی نماند.
   */
  rootMargin?: string;
  /** فقط یک‌بار دیده شدن را ثبت کن (پیش‌فرض) یا هر بار ورود/خروج را گزارش کن. */
  once?: boolean;
};

/**
 * آیا این عنصر در دید کاربر است؟
 *
 * چرا لازم شد: در کارت‌های خروجیِ محتوا، تصویر بندانگشتی هر کارت از همان لحظهٔ
 * باز شدن صفحه درخواست می‌شد؛ اگر یک مرحله ده‌ها خروجی تصویری داشت، مرورگر
 * ده‌ها فایل را هم‌زمان می‌گرفت و تصویری که کاربر هرگز به آن نمی‌رسید هم پهنای
 * باند و حافظه می‌خورد. حالا درخواست تصویر **تا دیده شدن کارت** شروع نمی‌شود.
 *
 * اگر مرورگر `IntersectionObserver` نداشته باشد، نتیجه «دیده‌شده» است تا هیچ
 * تصویری به‌خاطر نبودِ این API پنهان نماند.
 */
export function useInView<T extends HTMLElement = HTMLDivElement>({
  rootMargin = '240px',
  once = true,
}: InViewOptions = {}): [RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver !== 'function') {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          setInView(true);
          if (once) observer.disconnect();
        } else if (!once) {
          setInView(false);
        }
      });
    }, { rootMargin, threshold: 0 });

    observer.observe(node);
    return () => observer.disconnect();
  }, [rootMargin, once]);

  return [ref, inView];
}
