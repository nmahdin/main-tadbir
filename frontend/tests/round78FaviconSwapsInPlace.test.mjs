import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * آزمون رفتاریِ فاوآیکون (دور ۷۸): به‌جای تطبیق متن، خودِ `applyFavicon` روی یک
 * DOM کوچک اجرا می‌شود.
 *
 * چرا: دو دور پشت سر هم «فاوآیکون بارگذاری‌شده نمایش داده نمی‌شود» گزارش شد و
 * آزمون‌های متنیِ قبلی منطق را فقط توصیف می‌کردند. قرارداد واقعی این است:
 *
 *  - همان لینک آیکونِ `index.html` بازاستفاده می‌شود و `href`ش عوض می‌شود
 *    (لینک حذف/بازسازی نمی‌شود، چون بعضی مرورگرها فقط لینکِ سند اولیه را
 *    جدی می‌گیرند).
 *  - هرگز بیش از یک لینک آیکون در سند نمی‌ماند.
 *  - با خطای بارگیری (پس از یک تلاش دوباره) آیکون پیش‌فرض برمی‌گردد.
 */
const source = new URL('../src/utils/favicon.ts', import.meta.url);

const bundle = async () => {
  const esbuild = await import('esbuild');
  const result = await esbuild.build({
    entryPoints: [source.pathname],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    write: false,
    logLevel: 'silent',
  });
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'favicon-')), 'favicon.mjs');
  writeFileSync(file, result.outputFiles[0].text);
  return import(pathToFileURL(file).href);
};

/* ------------------------------- DOM کوچک ------------------------------- */

class FakeNode {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.dataset = {};
    this.attributes = {};
    this.parentNode = null;
    this.rel = '';
    this.type = '';
    this.href = '';
  }

  removeAttribute(name) {
    delete this.attributes[name];
    if (name === 'type') this.type = '';
  }

  remove() {
    if (this.parentNode) {
      const index = this.parentNode.children.indexOf(this);
      if (index >= 0) this.parentNode.children.splice(index, 1);
      this.parentNode = null;
    }
  }
}

const matches = (node, selector) => {
  const attr = selector.match(/\[rel(~?)=["']([^"']+)["']\]/);
  if (!attr) return false;
  const [, operator, value] = attr;
  if (operator === '~') return node.rel.split(/\s+/).includes(value);
  return node.rel === value;
};

class FakeHead {
  constructor() {
    this.children = [];
  }

  appendChild(node) {
    node.remove();
    node.parentNode = this;
    this.children.push(node);
    return node;
  }

  querySelectorAll(selector) {
    return this.children.filter(node => node.tagName === 'LINK' && matches(node, selector));
  }
}

const installDom = ({ failing = [] } = {}) => {
  const head = new FakeHead();
  globalThis.document = {
    head,
    createElement: tag => new FakeNode(tag),
  };

  class FakeImage {
    set src(value) {
      this._src = value;
      queueMicrotask(() => {
        const broken = failing.some(prefix => value.startsWith(prefix));
        const handler = broken ? this.onerror : this.onload;
        if (typeof handler === 'function') handler.call(this);
      });
    }

    get src() {
      return this._src;
    }
  }

  globalThis.Image = FakeImage;

  // همان نشانه‌گذاری `index.html`.
  const initial = new FakeNode('link');
  initial.rel = 'icon';
  initial.type = 'image/svg+xml';
  initial.href = '/favicon.svg';
  initial.dataset.tadbirFavicon = 'default';
  head.appendChild(initial);

  return { head, initial };
};

const icons = (head) => head.querySelectorAll('link[rel~="icon"]');
const tick = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));

/* --------------------------------- آزمون -------------------------------- */

test('فاوآیکون سفارشی همان لینک سند را بازاستفاده می‌کند و لینک دومی نمی‌سازد', async () => {
  const { applyFavicon } = await bundle();
  const { head, initial } = installDom();

  const cleanup = applyFavicon('/storage/brand/favicon-a.png');
  await tick();

  assert.equal(icons(head).length, 1);
  assert.equal(icons(head)[0], initial, 'لینک آیکون سند اولیه باید بازاستفاده شود');
  assert.match(initial.href, /^\/api\/v1\/media\/brand\/favicon-a\.png\?v=/);
  assert.equal(initial.type, 'image/png');
  assert.equal(initial.dataset.tadbirFavicon, 'custom');
  // آیکون موبایل هم با همان فایل هم‌گام می‌شود.
  const apple = head.querySelectorAll('link[rel="apple-touch-icon"]');
  assert.equal(apple.length, 1);
  assert.match(apple[0].href, /favicon-a\.png\?v=/);

  cleanup();
});

test('بارگذاری فاوآیکون تازه نشانی را روی همان لینک به‌روز می‌کند و لینک تکرار نمی‌شود', async () => {
  const { applyFavicon } = await bundle();
  const { head, initial } = installDom();

  const first = applyFavicon('/storage/brand/favicon-a.png');
  await tick();
  const before = initial.href;
  first();

  const second = applyFavicon('/storage/brand/favicon-b.png');
  await tick();

  assert.equal(icons(head).length, 1);
  assert.equal(icons(head)[0], initial);
  assert.notEqual(initial.href, before);
  assert.match(initial.href, /favicon-b\.png\?v=/);

  second();
});

test('حذف فاوآیکون سفارشی آیکون پیش‌فرض را برمی‌گرداند', async () => {
  const { applyFavicon } = await bundle();
  const { head, initial } = installDom();

  applyFavicon('/storage/brand/favicon-a.png');
  await tick();
  applyFavicon('');

  assert.equal(icons(head).length, 1);
  assert.equal(initial.href, '/favicon.svg');
  assert.equal(initial.type, 'image/svg+xml');
  assert.equal(initial.dataset.tadbirFavicon, 'default');
  assert.equal(head.querySelectorAll('link[rel="apple-touch-icon"]').length, 0);
});

test('خطای دائمی بارگیری فاوآیکون، آیکون پیش‌فرض را نگه می‌دارد', async () => {
  const { applyFavicon } = await bundle();
  const { head, initial } = installDom({ failing: ['/api/v1/media/brand/broken'] });

  applyFavicon('/storage/brand/broken.png');
  await tick(40);
  // شکست اول → یک تلاش دوباره؛ تست صبر می‌کند تا نتیجهٔ نهایی روشن شود.
  await tick(1100);

  assert.equal(icons(head).length, 1);
  assert.equal(initial.href, '/favicon.svg');
  assert.equal(initial.dataset.tadbirFavicon, 'default');
  assert.equal(head.querySelectorAll('link[rel="apple-touch-icon"]').length, 0);
});

test('پاک‌سازی افکت نتیجهٔ دیررس را نادیده می‌گیرد', async () => {
  const { applyFavicon } = await bundle();
  const { head, initial } = installDom();

  const cleanup = applyFavicon('/storage/brand/favicon-late.png');
  cleanup(); // پیش از این‌که probe پاسخ دهد
  await tick(30);

  assert.equal(initial.href, '/favicon.svg');
  assert.equal(icons(head).length, 1);
});
