import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { dataTableIdFromOutputValue, dataTableRowFields, dataTableRowValueSummary } from '../src/utils/dataTableRows.ts';
import { DEADLINE_CHIP_TONES, DEADLINE_ICON_TONES, deadlineToneTier } from '../src/utils/deadlineTones.ts';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

test('خروجی‌ای که ردیفی از جدول اطلاعات است، فیلدهای همان ردیف را نشان می‌دهد', async () => {
  const fields = dataTableRowFields(
    { title: 'گزارش هفته', owner: '  ', status: 'در جریان', legacy: 'دادهٔ تاریخی' },
    [{ id: 'title', name: 'عنوان' }, { id: 'owner', name: 'مسئول' }, { id: 'status', name: 'وضعیت' }],
  );
  assert.deepEqual(fields.map(field => `${field.name}=${field.value}`), ['عنوان=گزارش هفته', 'وضعیت=در جریان', 'legacy=دادهٔ تاریخی']);
  assert.deepEqual(dataTableRowFields({}, []), []);
  assert.equal(dataTableRowFields({ a: '1', b: '2' }, [{ id: 'a', name: 'الف' }, { id: 'b', name: 'ب' }], { max: 1 }).length, 1);

  const [sections, detail, tables, library, controller] = await Promise.all([
    source('../src/components/content/StageAssetSections.tsx'),
    source('../src/components/content/ContentDetailView.tsx'),
    source('../src/components/dam/DamDataTables.tsx'),
    source('../src/components/dam/DamLibrary.tsx'),
    source('../../backend/app/Http/Controllers/Api/V1/DamDataTableController.php'),
  ]);
  // دادهٔ ردیف زنده از خود جدول خوانده می‌شود، نه از متن ذخیره‌شده روی خروجی.
  assert.ok(sections.includes('dataTableRowFields(row.cells, tableRows.data?.columns || [])'));
  assert.ok(sections.includes('pinned_rows'));
  assert.ok(sections.includes('row_ids[]='));
  assert.ok(sections.includes('این مورد ردیفی از «جدول اطلاعات» است'));
  // سرور همان ردیف‌های خواسته‌شده را مستقل از صفحه‌بندی برمی‌گرداند.
  assert.ok(controller.includes("'row_ids' => 'sometimes|array|max:20'"));
  assert.ok(controller.includes("'row_ids.*' => 'integer|between:1,1000000'"));
  assert.ok(controller.includes("$payload['pinned_rows'] = empty($data['row_ids'])"));
  // شناسهٔ جدول روی خودِ خروجی ذخیره می‌شود تا پیوند از دست نرود.
  assert.ok(detail.includes('dataTableId: asset.type === \'data_table\' && asset.dataTableId ? String(asset.dataTableId) : undefined,'));
  assert.ok(detail.includes('rowIds: asset.type === \'data_table\' ? (asset.rowIds || []).map(String) : undefined,'));
});

test('خروجی‌های قدیمی‌تر جدولشان را از همان جملهٔ ساخت‌یافتهٔ سامانه پیدا می‌کنند', () => {
  assert.equal(dataTableIdFromOutputValue('یادداشت خروجی — جدول اطلاعات شماره ۱۲'), 12);
  assert.equal(dataTableIdFromOutputValue('پیوست — جدول اطلاعات شماره 12'), 12);
  assert.equal(dataTableIdFromOutputValue('جدول اطلاعات شماره 7'), 7);
  assert.equal(dataTableIdFromOutputValue('گزارش جدول اطلاعات شماره'), null);
  assert.equal(dataTableIdFromOutputValue('شرح دلخواه دربارهٔ جدول اطلاعات شماره ۳ در پرونده'), null);
  assert.equal(dataTableIdFromOutputValue(undefined), null);
  assert.equal(dataTableRowValueSummary({ a: '', b: 'دوم', c: 'سوم', d: 'چهارم' }), 'دوم • سوم • چهارم');
});

test('از مدال پیش‌نمایش می‌توان به همان جدول اطلاعات رفت', async () => {
  const [sections, detail, tables, library] = await Promise.all([
    source('../src/components/content/StageAssetSections.tsx'),
    source('../src/components/content/ContentDetailView.tsx'),
    source('../src/components/dam/DamDataTables.tsx'),
    source('../src/components/dam/DamLibrary.tsx'),
  ]);
  assert.ok(sections.includes('onOpenDataTable?: (tableId: number) => void;'));
  assert.ok(sections.includes('نمایش در جدول اطلاعات'));
  assert.ok(detail.includes('onOpenDataTable={tableId => navigate(`/dam?table=${tableId}`)}'));
  // پارامتر نشانی، صفحهٔ مخزن را روی «جدول اطلاعات» می‌برد و همان جدول را باز می‌کند.
  assert.ok(library.includes("const [tableParam] = useUrlFilter<string>('table', '');"));
  assert.ok(library.includes("setActiveView('tables');"));
  assert.ok(library.includes('<DamDataTables openTableId={tableParam} />'));
  assert.ok(tables.includes('export const DamDataTables: React.FC<{ openTableId?: string }> = ({ openTableId }) => {'));
  assert.ok(tables.includes('const requested = Number(openTableId);'));
  assert.ok(tables.includes('setSelectedId(requested);'));
  // ردیف‌های متصل به پرونده هم همین راه را در دسترس کاربر می‌گذارند.
  assert.ok(detail.includes('مشاهدهٔ جدول'));
});

test('خروجی‌های متنی از همان‌جا قابل ویرایش‌اند', async () => {
  const [sections, detail, api] = await Promise.all([
    source('../src/components/content/StageAssetSections.tsx'),
    source('../src/components/content/ContentDetailView.tsx'),
    source('../src/api/dam.ts'),
  ]);
  // ویرایش متن یعنی ذخیرهٔ همان متن، با همان ویرایشگر و همان دکمه در هر دو مسیر.
  assert.ok(sections.includes('onEditText?: (view: StageAssetView, plainText: string) => Promise<void>;'));
  assert.ok(sections.includes('ویرایش متن'));
  assert.ok(sections.includes('RichTextEditor value={textDraft}'));
  assert.ok(sections.includes("await damApi.library.reviseText(assetId as string, clean, textNote.trim() || undefined);"));
  assert.ok(api.includes('reviseText(id: string | number, body: string, changeDescription?: string)'));
  assert.ok(api.includes('`/dam/library/${id}/versions`'));
  // متن خروجیِ بدون دارایی در خود جریان ذخیره می‌شود و به مجوز مخزن گره نمی‌خورد.
  assert.ok(detail.includes('const saveOutputText = async (view: StageAssetView, plainText: string) => {'));
  assert.ok(detail.includes('addStageDeliverable(content.id, stage.id, view.outputId, { value: plainText })'));
  assert.ok(detail.includes("canEditTextAsset={hasPermission('assets.edit_info')}"));
  assert.ok(detail.includes('onEditText={saveOutputText}'));
});

test('مهلت وظیفه رنگ زمان‌دار و زمان باقی‌مانده دارد', async () => {
  const drawer = await source('../src/components/tasks/TaskDetailDrawer.tsx');
  assert.ok(drawer.includes('deadlineDaysLabel(deadlineInfo)'));
  assert.ok(drawer.includes('deadlineToneTier(deadlineInfo?.tier, deadlineSettled)'));
  assert.ok(drawer.includes('DEADLINE_CHIP_TONES[deadlineTone]'));
  assert.ok(drawer.includes('زمان باقی‌مانده:'));
  assert.ok(drawer.includes("['completed', 'archived', 'cancelled'].includes(String(task.status || ''))"));
  // رنگ‌ها یک منبع دارند و کار تعیین‌تکلیف‌شده خنثی می‌ماند.
  assert.equal(deadlineToneTier('past', true), 'later');
  assert.equal(deadlineToneTier('past'), 'past');
  assert.equal(deadlineToneTier(undefined), 'unknown');
  assert.ok(DEADLINE_CHIP_TONES.past.includes('violet'));
  assert.ok(DEADLINE_CHIP_TONES.today.includes('rose'));
  assert.ok(DEADLINE_ICON_TONES.soon.includes('amber'));
});

test('«کارتابل من» تسک‌های موعد نزدیک را بر پایهٔ موعد نشان می‌دهد', async () => {
  const [dashboard, controller, list, myTasks] = await Promise.all([
    source('../src/components/workspace/ActionDashboard.tsx'),
    source('../../backend/app/Http/Controllers/Api/V1/TaskController.php'),
    source('../src/components/workspace/WorkspaceList.tsx'),
    source('../src/components/tasks/MyTasksView.tsx'),
  ]);
  assert.ok(dashboard.includes("title: 'تسک‌های موعد نزدیک'"));
  assert.ok(dashboard.includes("due: 'near', sort: 'deadline', direction: 'asc'"));
  assert.ok(dashboard.includes('/tasks?assignee=me&due=near'));
  assert.ok(!dashboard.includes("title: 'تسک‌های عقب‌افتاده'"));
  // یک معنا برای «موعد نزدیک» در سرور: عقب‌افتاده + هفت روز آینده.
  assert.ok(controller.includes("$query->whereDate('deadline', '<=', today()->addDays(7)->toDateString());"));
  assert.ok(!controller.includes("addDays(5)"));
  assert.ok(list.includes("label: 'نزدیک موعد'"));
  assert.ok(myTasks.includes('const nearEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7);'));
});
