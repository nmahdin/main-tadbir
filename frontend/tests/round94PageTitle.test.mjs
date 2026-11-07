import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PAGE_TITLE_SUFFIX } from '../src/routing/brandName.ts';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

test('عنوان تب مرورگر با نام «سامانه تدبیر» ساخته می‌شود', async () => {
  const [html, pageTitle] = await Promise.all([
    source('../index.html'),
    source('../src/routing/PageTitle.tsx'),
  ]);

  assert.equal(PAGE_TITLE_SUFFIX, 'سامانه تدبیر');
  // عنوان ثابتِ فایل ورودی هم باید همان نام را داشته باشد (پیش از بالا آمدن React).
  assert.match(html, /<title>داشبورد \| سامانه تدبیر<\/title>/);
  assert.doesNotMatch(html, /<title>[^<]*پلتفرم تدبیر/);

  // نام محصول فقط از یک جا خوانده می‌شود و در همهٔ شاخه‌های عنوان تکرار شده است.
  assert.match(pageTitle, /import \{ PAGE_TITLE_SUFFIX \} from '\.\/brandName';/);
  assert.match(pageTitle, /return `ورود \| \$\{PAGE_TITLE_SUFFIX\}`;/);
  assert.match(pageTitle, /return `جزئیات وظیفه \| \$\{PAGE_TITLE_SUFFIX\}`;/);
  assert.match(pageTitle, /return `\$\{name\} \| \$\{PAGE_TITLE_SUFFIX\}`;/);
  assert.doesNotMatch(pageTitle, /پلتفرم تدبیر/);
});
