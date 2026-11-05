import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

test('output text editor lets the user rename the title in both paths', async () => {
  const [sections, detail, context, dam] = await Promise.all([
    source('../src/components/content/StageAssetSections.tsx'),
    source('../src/components/content/ContentDetailView.tsx'),
    source('../src/context/AppContext.tsx'),
    source('../src/api/dam.ts'),
  ]);

  // فیلد عنوان بالای ویرایشگر متن، با مقدار فعلی خروجی/دارایی.
  assert.match(sections, /const \[titleDraft, setTitleDraft\] = useState\(''\);/);
  assert.match(sections, /const suggestedTitle = \(asset\.data\?\.title \|\| view\?\.title \|\| ''\)\.trim\(\);/);
  assert.match(sections, /setTitleDraft\(suggestedTitle\);/);
  assert.match(sections, /<label className="block space-y-1\.5 text-\[10px\] font-bold text-slate-600">عنوان خروجی/);
  assert.match(sections, /aria-label="عنوان خروجی"/);
  assert.ok(sections.indexOf('عنوان خروجی') < sections.indexOf('RichTextEditor value={textDraft}'), 'عنوان بالای ویرایشگر متن می‌آید');

  // مسیر دارایی مخزن: عنوان با PATCH و متن با نسخهٔ تازه.
  assert.match(sections, /if \(titleChanged\) await damApi\.library\.updateTitle\(assetId as string, trimmedTitle\);/);
  assert.match(dam, /updateTitle\(id: string \| number, title: string\) \{/);
  assert.match(dam, /`\/dam\/library\/\$\{id\}`, \{ method: 'PATCH', body: \{ title \} \}/);
  assert.match(dam, /reviseText\(id: string \| number, body: string, changeDescription\?: string\)/);

  // مسیر خروجی جریان: عنوان به‌عنوان renameTitle می‌رود تا با «افزودن متن» قاطی نشود.
  assert.match(sections, /await onEditText\(view, plain, titleChanged \? trimmedTitle : undefined\);/);
  assert.match(detail, /const saveOutputText = async \(view: StageAssetView, plainText: string, title\?: string\) => \{/);
  assert.match(detail, /\.\.\.\(title \? \{ renameTitle: title \} : \{\}\)/);
  assert.match(context, /\.\.\.\(data\.renameTitle \? \{ name: data\.renameTitle \} : \{\}\),/);
  assert.match(context, /name: data\.title \|\| data\.renameTitle \|\| data\.fileName \|\| 'خروجی جدید',/);
  // عنوان خالی، عنوان قبلی را نگه می‌دارد و عنوان ویرایش‌شده در سربرگ مدال دیده می‌شود.
  assert.match(sections, /const titleChanged = Boolean\(trimmedTitle && trimmedTitle !== suggestedTitle\);/);
  assert.match(sections, /title=\{displayTitle \|\| 'پیش‌نمایش'\}/);
});

test('pressing a button moves inward with a softer, more tactile motion', async () => {
  const css = await source('../src/index.css');
  const pressed = css.match(/button:active:not\(:disabled\), \[role='button'\]:active:not\(:disabled\) \{([^}]*)\}/)?.[1] || '';
  assert.match(pressed, /transform: scale\(\.965\) !important/);
  assert.doesNotMatch(pressed, /translateY/);
  assert.match(pressed, /box-shadow: var\(--button-shadow-pressed\) !important/);
  // انتقال نرم‌تر با منحنی فنری، نه پرش خطی.
  assert.match(css, /transform \.14s cubic-bezier\(\.22, 1, \.36, 1\)/);
  assert.match(css, /box-shadow \.16s ease/);
});

test('buttons that carry a shadow get a layered, softer shadow with a hover lift', async () => {
  const css = await source('../src/index.css');
  assert.match(css, /--button-shadow: 0 1px 2px 0 rgb\(15 23 42 \/ \.06\), 0 2px 6px -2px rgb\(15 23 42 \/ \.12\), inset 0 1px 0 rgb\(255 255 255 \/ \.16\)/);
  assert.match(css, /--button-shadow-hover: 0 1px 2px 0 rgb\(15 23 42 \/ \.07\), 0 4px 10px -3px rgb\(15 23 42 \/ \.16\)/);
  assert.match(css, /--button-shadow-pressed: inset 0 1px 2px 0 rgb\(15 23 42 \/ \.14\), inset 0 0 0 1px rgb\(15 23 42 \/ \.05\)/);
  // هاور دکمه‌های اقدام، صفحه‌بندی و عملیات سایهٔ بلندتر می‌گیرد.
  assert.match(css, /\.ui-form-action:hover:not\(:disabled\),[\s\S]{0,240}box-shadow: var\(--button-shadow-hover\) !important;/);
  assert.match(css, /\.pagination-button:hover:not\(:disabled\) \{\s*box-shadow: var\(--button-shadow-hover\) !important;/);
  assert.match(css, /\.ui-action-button:hover:not\(:disabled\) \{\s*box-shadow: var\(--button-shadow-hover\) !important;/);
  // قاعدهٔ پایه هنوز هیچ سایه‌ای به دکمه‌های تخت نمی‌دهد.
  const base = css.match(/button, \[role='button'\] \{([^}]*)\}/)?.[1] || '';
  assert.match(base, /box-shadow: none !important/);
});

test('the workflow modal keeps the stage deadline outside the reviewer box', async () => {
  const modal = await source('../src/components/content/EditWorkflowModal.tsx');
  const deadline = modal.indexOf('label="مهلت انجام مرحله"');
  const reviewerBox = modal.indexOf('className="rounded-2xl border border-slate-200 bg-slate-50 p-4"');
  const reviewToggle = modal.indexOf('این مرحله به ارزیابی مستقل نیاز دارد');
  assert.ok(deadline > 0 && reviewerBox > 0 && reviewToggle > 0);
  // مهلت پیش از قاب ارزیابی می‌آید و در همان ردیف دپارتمان/مسئول اجرا است.
  assert.ok(deadline < reviewerBox, 'مهلت باید بالای قاب ارزیابی باشد');
  assert.ok(deadline < reviewToggle);
  assert.match(modal, /<div className="grid gap-4 md:grid-cols-3">[\s\S]{0,120}دپارتمان مسئول/);
  // قاب ارزیابی دیگر انتخابگر مهلت را در خود ندارد.
  const reviewBlock = modal.slice(reviewerBox, modal.indexOf('</article>)', reviewerBox));
  assert.doesNotMatch(reviewBlock, /PersianDatePicker/);
  assert.match(reviewBlock, /ارزیاب مرحله/);
});
