/**
 * پیش‌بارگذاری بستهٔ صفحه‌های جزئیات (دور ۹۷).
 *
 * مسیرهای `import` عیناً همان مسیرهای `React.lazy` در `App.tsx` هستند تا Vite
 * همان chunk را بدهد و «پیش‌بارگذاری» به معنای دانلود دوباره نباشد.
 *
 * چرا لازم است: گذار مورف (دور ۹۶) عکس دوم را بلافاصله بعد از commit می‌گیرد؛
 * اگر بستهٔ مقصد هنوز نرسیده باشد، آن عکس لودر Suspense است و عنوان به سربرگ
 * کشیده نمی‌شود. با `preloadContentDetail()` / `preloadProjectDetail()` پیش از
 * شروع گذار، سربرگ مقصد در همان اولین رنگ‌آمیزی وجود دارد.
 */
let contentDetail: Promise<unknown> | null = null;
let projectDetail: Promise<unknown> | null = null;

const remember = (promise: Promise<unknown>, reset: () => void) => {
  promise.catch(reset);
  return promise;
};

export const preloadContentDetail = (): Promise<unknown> => {
  if (!contentDetail) {
    contentDetail = remember(import('../components/content/ContentDetailView'), () => { contentDetail = null; });
  }
  return contentDetail;
};

export const preloadProjectDetail = (): Promise<unknown> => {
  if (!projectDetail) {
    projectDetail = remember(import('../components/projects/ProjectDetailView'), () => { projectDetail = null; });
  }
  return projectDetail;
};
