import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

test('task history, review preset, near due and calendar semantics remain wired', async () => {
  const [detail, list, backend] = await Promise.all([
    source('../src/components/tasks/TaskDetailDrawer.tsx'),
    source('../src/components/workspace/WorkspaceList.tsx'),
    source('../../backend/app/Http/Controllers/Api/V1/TaskController.php'),
  ]);
  assert.match(detail, /historyOpen/);
  assert.match(detail, /aria-expanded=\{historyOpen\}/);
  assert.match(list, /label: 'نزدیک موعد'[\s\S]*due: 'near'/);
  assert.match(list, /label: 'در صف بررسی'[\s\S]*status: 'review'/);
  assert.doesNotMatch(list.match(/tasks: \[[\s\S]*?\],\n  contents:/)?.[0] || '', /تکمیل‌شده/);
  assert.match(list, /priorityColor/);
  assert.match(list, /statusColor/);
  assert.match(backend, /addDays\(5\)/);
});

test('task editing keeps relations and editable checklist below task description', async () => {
  const edit = await source('../src/components/tasks/EditTaskModal.tsx');
  assert.match(edit, /contentId/);
  assert.match(edit, /subtasks: checklist/);
  assert.match(edit, /چک‌لیست وظیفه/);
  assert.match(edit, /تصویر ثابت از الگوی مرحله/);
  assert.match(edit, /selectableProjects/);
});

test('project detail exposes one operations menu, project members and unified domain views', async () => {
  const [detail, form] = await Promise.all([
    source('../src/components/projects/ProjectDetailView.tsx'),
    source('../src/components/projects/CreateProjectModal.tsx'),
  ]);
  assert.match(detail, />عملیات</);
  assert.match(detail, /اعضای پروژه/);
  assert.match(detail, /دسته‌بندی پروژه/);
  assert.match(detail, /اولویت پروژه/);
  assert.match(detail, /viewMode.*'list'.*'cards'/s);
  assert.doesNotMatch(detail, /برای این پروژه توضیحی ثبت نشده است/);
  assert.match(form, /انتخاب از برچسب‌های قبلی/);
  assert.match(form, /setTags/);
});

test('DAM keeps explorer, reusable folder browser, one-pass progress download and temporary links', async () => {
  const [library, browser, controller] = await Promise.all([
    source('../src/components/dam/DamLibrary.tsx'),
    source('../src/components/dam/FolderBrowserModal.tsx'),
    source('../../backend/app/Http/Controllers/Api/V1/DamAssetController.php'),
  ]);
  assert.match(library, /'explorer'/);
  assert.match(library, /downloadAssetOnce/);
  assert.match(library, /response\.body\?\.getReader/);
  assert.match(library, /temporary-link/);
  assert.match(library, /activity\.actor\?\.name/);
  assert.match(browser, /ریشه مخزن/);
  assert.match(browser, /onCreate/);
  assert.doesNotMatch(library, /folderDialog\.mode === 'move'/);
  assert.match(controller, /addHours\(2\)/);
  assert.match(controller, /temporarySignedRoute/);
});

test('table cell audits include before and after values', async () => {
  const [controller, tables] = await Promise.all([
    source('../../backend/app/Http/Controllers/Api/V1/DamDataTableController.php'),
    source('../src/components/dam/DamDataTables.tsx'),
  ]);
  assert.match(controller, /'column_id'.*'from'.*'to'/s);
  assert.match(tables, /metadata\?\.changes/);
  assert.match(tables, /change\.from/);
  assert.match(tables, /change\.to/);
});

test('chat search, pinned navigation and WebSocket-compatible presence use authorized fallback', async () => {
  const [chat, realtime, backend] = await Promise.all([
    source('../src/components/chat/ChatView.tsx'),
    source('../src/api/chatRealtime.ts'),
    source('../../backend/app/Http/Controllers/Api/V1/ChatRealtimeController.php'),
  ]);
  assert.match(chat, /searchResults/);
  assert.match(chat, /movePinned/);
  assert.match(chat, /در حال نوشتن/);
  assert.match(realtime, /new WebSocket/);
  assert.match(realtime, /polling-fallback/);
  assert.match(backend, /ChatAccess::class/);
  assert.match(backend, /typingKey/);
});
