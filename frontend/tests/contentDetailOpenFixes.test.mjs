import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { STALE_BUILD_COOLDOWN_MS, shouldRecoverStaleBuild } from '../src/utils/staleBuildRecovery.ts';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

/**
 * «صفحهٔ جزئیات محتوا باز نمی‌شود» دو ریشهٔ واقعی دارد که هر دو در همین آزمون
 * قفل می‌شوند:
 *  ۱) پرونده در صفحهٔ نخست فهرست نباشد (بیش از ۱۰۰ محتوا، دسترسی محدود یا ورود
 *     مستقیم با پیوند) و صفحه به‌جای باز شدن، «یافت نشد» نشان دهد.
 *  ۲) مرورگر نسخهٔ کهنهٔ سامانه را باز نگه داشته باشد و فایل بخش صفحه با خطای
 *     بارگذاری شکست بخورد.
 */
test('content detail opens for records that are not inside the loaded list page', async () => {
  const detail = await source('../src/components/content/ContentDetailView.tsx');

  assert.match(detail, /const listedContent = contents\.find\(c => sameId\(c\.id, selectedContentId\)\)/);
  assert.match(detail, /const content = listedContent \?\? directContent\.data\?\.data/);
  assert.match(detail, /contentsApi\.get\(String\(selectedContentId\), signal\)/);
  assert.match(detail, /enabled: Boolean\(selectedContentId\) && !listedContent && !runtime\.demoMode/);
  assert.doesNotMatch(detail, /const content = contents\.find\(c => c\.id === selectedContentId\)/);
});

test('the not-found state waits for the direct fetch and stays actionable', async () => {
  const detail = await source('../src/components/content/ContentDetailView.tsx');

  assert.match(detail, /const contentFallbackLoading = directContent\.isLoading/);
  assert.match(detail, /if \(contentFallbackLoading\)/);
  assert.match(detail, /در حال بارگذاری پروندهٔ محتوا…/);
  assert.match(detail, /شناسهٔ درخواستی/);
  assert.match(detail, /onClick=\{\(\) => void directContent\.refetch\(\)\}/);
  assert.match(detail, /onClick=\{goBack\}/);
});

test('a stale browser build self-heals once instead of blocking the page', async () => {
  const [main, recovery] = await Promise.all([
    source('../src/main.tsx'),
    source('../src/utils/staleBuildRecovery.ts'),
  ]);

  assert.match(main, /installStaleBuildRecovery\(\)/);
  assert.match(recovery, /'vite:preloadError'/);
  assert.match(recovery, /window\.location\.reload\(\)/);
  assert.match(recovery, /sessionStorage/);
  assert.match(recovery, /event\.preventDefault\(\)/);
});

test('stale build recovery never loops: one reload per cooldown window', () => {
  const store = new Map();
  const previousWindow = globalThis.window;
  globalThis.window = {
    sessionStorage: {
      getItem: key => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
    },
  };

  try {
    const start = 1_000_000;

    assert.equal(shouldRecoverStaleBuild(start), true);
    assert.equal(shouldRecoverStaleBuild(start + 1_000), false);
    assert.equal(shouldRecoverStaleBuild(start + STALE_BUILD_COOLDOWN_MS - 1), false);
    assert.equal(shouldRecoverStaleBuild(start + STALE_BUILD_COOLDOWN_MS + 1), true);
  } finally {
    globalThis.window = previousWindow;
  }
});

test('stale build recovery still reloads when session storage is unavailable', () => {
  const previousWindow = globalThis.window;
  globalThis.window = {
    sessionStorage: {
      getItem: () => { throw new Error('storage disabled'); },
      setItem: () => { throw new Error('storage disabled'); },
    },
  };

  try {
    assert.equal(shouldRecoverStaleBuild(), true);
  } finally {
    globalThis.window = previousWindow;
  }
});
