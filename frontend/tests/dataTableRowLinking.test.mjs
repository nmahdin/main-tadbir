import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  dataTableRowIsLinked,
  dataTableRowLabel,
  dataTableRowLinkLabel,
  dataTableRowLinkTarget,
  dataTableRowValueSummary,
} from '../src/utils/dataTableRows.ts';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

const COLUMNS = [
  { id: 'title', name: 'عنوان' },
  { id: 'amount', name: 'مبلغ' },
  { id: 'note', name: 'یادداشت' },
];

test('برچسب ردیف جدول از نام ستون‌ها و مقادیر پر ساخته می‌شود', () => {
  const row = { id: 7, cells: { title: 'قرارداد ۱۴۰۴', amount: '۲۵۰', note: '  ' } };
  assert.equal(dataTableRowLabel(row, COLUMNS), 'عنوان: قرارداد ۱۴۰۴ · مبلغ: ۲۵۰');
  // ردیف خالی صریح گفته می‌شود و هیچ مقدار جعلی ساخته نمی‌شود.
  assert.equal(dataTableRowLabel({ id: 8, cells: {} }, COLUMNS), 'ردیف بدون مقدار');
  assert.equal(dataTableRowLabel({ id: 9 }, COLUMNS), 'ردیف بدون مقدار');
  // متن بلند بریده می‌شود تا فهرست به‌هم نریزد.
  const long = dataTableRowLabel({ id: 10, cells: { title: 'ب'.repeat(40) } }, COLUMNS, { maxLength: 12 });
  assert.equal(long.length, 12);
  assert.ok(long.endsWith('…'));
});

test('خلاصهٔ مقادیر ردیف همان قالب مشترک فهرست‌های تسک و محتوا است', () => {
  assert.equal(dataTableRowValueSummary({ a: 'یک', b: 'دو', c: '', d: 'چهار', e: 'پنج' }), 'یک • دو • چهار');
  assert.equal(dataTableRowValueSummary({}), 'ردیف بدون مقدار');
  assert.equal(dataTableRowValueSummary({ a: 'یک', b: 'دو' }, { max: 1 }), 'یک');
});

test('پیوند فعلی ردیف با زمینهٔ محتوا یا تسک مقایسه می‌شود', () => {
  const linkedToContent = { id: 1, content_id: 42, content: { id: 42, title: 'خبر هفته' } };
  const linkedToTask = { id: 2, task_id: 9, task: { id: 9, title: 'ویرایش متن' } };
  const free = { id: 3, cells: { title: 'بی‌پیوند' } };

  assert.equal(dataTableRowLinkTarget(linkedToContent, { contentId: '42' }), 'content');
  assert.equal(dataTableRowLinkTarget(linkedToContent, { taskId: '9' }), null);
  assert.equal(dataTableRowIsLinked(linkedToTask, { taskId: 9 }), true);
  assert.equal(dataTableRowIsLinked(free, { contentId: '42' }), false);
  // زمینهٔ نامعتبر (متن غیرعددی) هیچ‌وقت «متصل» تلقی نمی‌شود.
  assert.equal(dataTableRowIsLinked({ id: 4, content_id: 42 }, { contentId: 'wrong' }), false);
  assert.equal(dataTableRowLinkLabel(linkedToContent), 'محتوا: خبر هفته');
  assert.equal(dataTableRowLinkLabel(free), 'بدون پیوند');
});

test('بخش افزودن ضمیمه، «اتصال ردیف‌های موجود» را در کنار افزودن ردیف ارائه می‌کند', async () => {
  const [composer, detail, taskSection, controller] = await Promise.all([
    source('../src/components/common/AttachmentComposer.tsx'),
    source('../src/components/content/ContentDetailView.tsx'),
    source('../src/components/tasks/TaskAssetsSection.tsx'),
    source('../../backend/app/Http/Controllers/Api/V1/DamDataTableController.php'),
  ]);

  // سه حالت عملیات جدول: افزودن ردیف، ساخت جدول، اتصال ردیف موجود.
  assert.ok(composer.includes("mode: 'create' | 'append' | 'link'"));
  assert.ok(composer.includes('اتصال ردیف‌های موجود'));
  assert.ok(composer.includes("mode: 'link',"));
  assert.ok(composer.includes('rowIds: [...selectedRowIds],'));

  // «اتصال» ردیف تازه نمی‌سازد؛ همان ردیف‌های موجود را به محتوا/تسک وصل می‌کند.
  assert.match(composer, /if \(tableDraft\.mode === 'link'\) \{/);
  assert.ok(composer.includes('await request(`/dam/data-tables/${tableId}/rows/${rowId}`, { method: \'PATCH\', body: linkBody, signal: options.signal });'));
  assert.ok(composer.includes('if (relations.taskId && /^\\d+$/.test(relations.taskId)) linkBody.task_id = Number(relations.taskId);'));
  assert.ok(composer.includes('if (relations.contentId && /^\\d+$/.test(relations.contentId)) linkBody.content_id = Number(relations.contentId);'));
  assert.ok(composer.includes("if (!Object.keys(linkBody).length) throw new Error('اتصال ردیف جدول اطلاعات فقط برای محتوا یا تسک ممکن است.');"));
  // ردیفی که همین حالا به همین مورد وصل است، قابل انتخاب دوباره نیست.
  assert.ok(composer.includes('const alreadyLinked = rowLinkTarget ? dataTableRowIsLinked(row, rowLinkTarget) : false;'));

  // زمینهٔ اتصال فقط جایی داده می‌شود که رکورد واقعاً وجود دارد.
  assert.ok(composer.includes('linkTarget?: { taskId?: string; contentId?: string };'));
  assert.ok(detail.includes('linkTarget={{ contentId: content.id }}'));
  assert.ok(taskSection.includes('linkTarget={{ taskId: task.id }}'));
  assert.ok(taskSection.includes("import { dataTableRowValueSummary } from '../../utils/dataTableRows';"));

  // مسیر تاریخی ردیف‌ها همان مسیر می‌ماند و فقط «content_id» را هم می‌پذیرد.
  assert.ok(controller.includes("'content_id' => 'required_without:task_id|integer|exists:contents,id',"));
  assert.ok(controller.includes("->when(! empty($data['content_id']), fn ($query) => $query->where('content_id', $data['content_id']))"));
  assert.ok(controller.includes('abort_unless(app(ContentAccess::class)->canView($actor, \\App\\Models\\Content::findOrFail($data[\'content_id\'])), 403);'));

  // ردیف‌های متصل، در تب «فایل‌های مربوط» همین پرونده هم دیده و مدیریت می‌شوند.
  assert.ok(detail.includes('const contentLinkedRows = useQuery({'));
  assert.ok(detail.includes('/dam/data-tables/rows-by-task?content_id='));
  assert.ok(detail.includes('const unlinkContentRow = async (row: LinkedContentRow) => {'));
  assert.ok(detail.includes('body: { content_id: null }'));
  assert.ok(detail.includes('ردیف‌های جدول اطلاعات متصل به این پرونده'));

  // اجزای مشترک، بدون پیاده‌سازی موازی: فقط یک جایگاه برای منطق ردیف‌ها هست.
  assert.ok(composer.includes("import { dataTableRowIsLinked, dataTableRowLabel, dataTableRowLinkLabel } from '../../utils/dataTableRows';"));
});
