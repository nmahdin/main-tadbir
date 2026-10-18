import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

test('task details stay in a centered overlay without replacing the current page', async () => {
  const [detail, edit, ui, workspace] = await Promise.all([
    source('../src/features/tasks/TaskDetailDrawer.tsx'),
    source('../src/features/tasks/EditTaskModal.tsx'),
    source('../src/app/providers/UIContext.tsx'),
    source('../src/features/workspace/WorkspaceList.tsx'),
  ]);

  assert.match(detail, /<Modal open onClose=\{close\}/);
  assert.match(detail, /const hasTaskDetails/);
  assert.match(detail, /hasTaskDetails\(localTask\) \? localTask : undefined/);
  assert.match(detail, /if \(editing\) return <EditTaskModal/);
  assert.doesNotMatch(detail, /ConfirmedTextField/);
  assert.match(edit, /title="ویرایش وظیفه"/);
  assert.match(edit, /<AttachmentComposer\b/);
  assert.doesNotMatch(detail, /<Drawer\b/);
  assert.match(ui, /taskOverlayId/);
  assert.match(ui, /else setTaskOverlayId\(id\)/);
  assert.match(workspace, /setSelectedTaskId\(row\.id\)/);
});

test('task workspace keeps primary tabs, secondary filters and all three views', async () => {
  const workspace = await source('../src/features/workspace/WorkspaceList.tsx');

  for (const label of ['همه وظایف', 'وظایف من', 'امروز', 'تأخیردار', 'تکمیل‌شده']) {
    assert.match(workspace, new RegExp(label));
  }
  for (const view of ["['list', 'فهرست'", "['kanban', 'کانبان'", "['calendar', 'تقویم'"]) {
    assert.ok(workspace.includes(view), `missing task view ${view}`);
  }
  assert.match(workspace, /filtersOpen/);
  assert.match(workspace, /value=\{filters\.content_id \|\| ''\}/);
  assert.doesNotMatch(workspace, /module === 'tasks' \? 'مسئول'/);
  assert.match(workspace, /const projectAdvancedFilterCount/);
  assert.match(workspace, /aria-expanded=\{filtersOpen\}/);
  assert.doesNotMatch(workspace, /next\.set\('preview'/);
  assert.doesNotMatch(workspace, /EntityPreview/);
});

test('thought room exposes only independent idea and meeting sections', async () => {
  const thoughtRoom = await source('../src/features/thought-room/ThoughtRoomMainView.tsx');
  const meetings = await source('../src/features/thought-room/ThinkTankMeetingsTab.tsx');

  assert.match(thoughtRoom, /useState<'ideas' \| 'meetings'>/);
  assert.match(thoughtRoom, /فیلترهای ایده‌ها/);
  assert.match(meetings, /فیلترهای جلسه‌ها/);
  assert.match(thoughtRoom, /\{hasPermission\('thinktank\.create_idea'\) && <Button/);
  assert.match(thoughtRoom, /\{hasPermission\('meetings\.create'\) && <Button/);
  assert.match(thoughtRoom, /inline-flex max-w-full gap-1/);
  assert.doesNotMatch(thoughtRoom, /activeTab === 'stats'|activeTab === 'favorites'/);
});

test('role management header does not show the organizational security badge', async () => {
  const roles = await source('../src/features/identity/RoleManagementView.tsx');
  assert.doesNotMatch(roles, /امنیت سازمانی/);
});

test('single-line text controls and Persian date triggers share one compact height', async () => {
  const [css, datePicker] = await Promise.all([
    source('../src/styles/index.css'),
    source('../src/shared/ui/PersianDatePicker.tsx'),
  ]);

  assert.match(css, /--control-height:\s*2\.5rem/);
  assert.match(css, /input:not\(\[type='checkbox'\]\)[\s\S]*height: var\(--control-height\)/);
  assert.match(datePicker, /h-\[var\(--control-height\)\]/);
});

test('page-level local search boxes stay removed in favor of global search', async () => {
  const pageFiles = [
    '../src/features/activity/ActivityView.tsx',
    '../src/features/archive/ArchiveView.tsx',
    '../src/features/messaging/chat/ConversationList.tsx',
    '../src/features/comments/CommentsView.tsx',
    '../src/features/contents/ContentMainView.tsx',
    '../src/features/contents/ContentPublishedView.tsx',
    '../src/features/contents/ContentPublishingView.tsx',
    '../src/features/projects/ProjectsView.tsx',
    '../src/features/identity/RoleManagementView.tsx',
    '../src/features/secretariat/SecretariatMainView.tsx',
    '../src/features/tasks/MyTasksView.tsx',
    '../src/features/identity/UserManagementView.tsx',
  ];

  const pages = await Promise.all(pageFiles.map(source));
  pages.forEach((page, index) => {
    assert.doesNotMatch(page, /placeholder="[^"]*(?:جست|search)/i, pageFiles[index]);
  });
  const globalSearch = await source('../src/app/shell/GlobalSearchModal.tsx');
  assert.match(globalSearch, /placeholder="[^"]*جستجو/);
  const chat = await source('../src/features/messaging/chat/ChatView.tsx');
  assert.match(chat, /جست‌وجو در متن پیام‌های این گفتگو/);
});

test('attachment composer is shared by task, project, content, idea and meeting forms', async () => {
  const files = [
    '../src/features/tasks/CreateTaskModal.tsx',
    '../src/features/tasks/EditTaskModal.tsx',
    '../src/features/projects/CreateProjectModal.tsx',
    '../src/features/contents/CreateContentModal.tsx',
    '../src/features/contents/EditContentModal.tsx',
    '../src/features/thought-room/CreateIdeaModal.tsx',
    '../src/features/thought-room/CreateMeetingModal.tsx',
  ];
  const forms = await Promise.all(files.map(source));
  forms.forEach((form, index) => {
    assert.match(form, /<AttachmentComposer\b/, files[index]);
    assert.match(form, /persistAttachmentDraft/, files[index]);
  });

  const composer = await source('../src/shared/ui/AttachmentComposer.tsx');
  assert.match(composer, /multiple/);
  assert.match(composer, /value\.texts/);
  assert.match(composer, /value\.assets/);
  assert.match(composer, /assets\.edit_info/);
  assert.match(composer, /onDrop=/);
  assert.match(composer, /فهرست آمادهٔ اتصال/);
  assert.match(composer, /بدون تکثیر/);
});

test('content forms keep caption and workflow stages expose complete visual states', async () => {
  const [create, edit, detail] = await Promise.all([
    source('../src/features/contents/CreateContentModal.tsx'),
    source('../src/features/contents/EditContentModal.tsx'),
    source('../src/features/contents/ContentDetailView.tsx'),
  ]);
  assert.match(create, /متن کپشن/);
  assert.match(edit, /متن کپشن/);
  assert.match(detail, /آماده شروع/);
  assert.match(detail, /نیازمند بازبینی و اصلاح/);
  assert.match(detail, /\(index \+ 1\)\.toLocaleString\('fa-IR'\)/);
  assert.doesNotMatch(detail, /بازگشت به فهرست محتوا/);
  assert.doesNotMatch(detail, /hasPermission\('assets\.view'\) \? <DamLibrary/);
  assert.match(detail, /<DamLibrary context=\{\{content_id:Number\(content\.id\)\}\} onAssetsChanged=/);
});

test('backend contracts keep meeting permissions split and remove project keys completely', async () => {
  const [routes, projectController, projectModel, projectMigration, damService, damController] = await Promise.all([
    source('../../backend/routes/api.php'),
    source('../../backend/app/Http/Controllers/Api/V1/ProjectController.php'),
    source('../../backend/app/Models/Project.php'),
    source('../../backend/database/migrations/2026_10_01_000004_drop_project_key.php'),
    source('../../backend/app/Services/DamService.php'),
    source('../../backend/app/Http/Controllers/Api/V1/DamAssetController.php'),
  ]);

  assert.match(routes, /permission:meetings\.edit/);
  assert.doesNotMatch(routes, /permission:thinktank\.manage_meetings/);
  assert.doesNotMatch(projectController, /privateKey|orWhere\('key'|\['key'\]/);
  assert.doesNotMatch(projectModel, /\n\s*'key',/);
  assert.match(projectMigration, /dropColumn\('key'\)/);
  for (const canonicalFolder of ['محتواها', 'پیوست‌ها', 'خروجی‌ها']) assert.match(damService, new RegExp(canonicalFolder));
  assert.match(damController, /\['assets\.view', 'assets\.preview', 'assets\.download'\]/);
  assert.match(damController, /DamFile::query\(\)->sum\('file_size'\)/);
});

test('shared modal headers are opaque and message composers keep a stable border', async () => {
  const [primitives, css] = await Promise.all([
    source('../src/shared/ui/Primitives.tsx'),
    source('../src/styles/index.css'),
  ]);
  assert.match(primitives, /sticky top-0[^"']*bg-white/);
  assert.match(css, /comment-composer:hover:not\(:disabled\)/);
  assert.match(css, /message-composer:focus-within/);
  assert.match(css, /border-color: var\(--color-border\) !important/);
});
