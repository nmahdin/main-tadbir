import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

test('chat send keeps a render-safe optimistic message when the API response is partial', async () => {
  const [context, input] = await Promise.all([
    source('../src/context/AppContext.tsx'),
    source('../src/components/chat/MessageInput.tsx'),
  ]);
  assert.match(context, /const normalized: ChatMessage/);
  assert.match(context, /Array\.isArray\(persisted\.reactions\) \? persisted\.reactions : \[\]/);
  assert.match(context, /\.\.\.newMsg,[\s\S]*\.\.\.persisted/);
  assert.match(input, /try \{[\s\S]*sendMessage\(/);
  assert.match(input, /متن پیام حفظ شد/);
});

test('department dashboard is scoped to one department with list return, edit and member badges', async () => {
  const dashboard = await source('../src/components/departments/DepartmentDashboardView.tsx');
  assert.match(dashboard, /داشبورد دپارتمان \{data\?\.department\.name/);
  assert.match(dashboard, /بازگشت به فهرست دپارتمان‌ها/);
  assert.match(dashboard, /ویرایش دپارتمان/);
  assert.match(dashboard, /members\.map\(member => <span/);
  assert.doesNotMatch(dashboard, /انتخاب دپارتمان/);
});

test('review-free stages cannot select review states and complete directly', async () => {
  const [workflow, detail, create, reviewService, sync] = await Promise.all([
    source('../src/components/content/EditWorkflowModal.tsx'),
    source('../src/components/content/ContentDetailView.tsx'),
    source('../src/components/content/CreateContentModal.tsx'),
    source('../../backend/app/Services/ContentReview.php'),
    source('../../backend/app/Services/ContentStageTaskSync.php'),
  ]);
  assert.match(workflow, /disabled=\{!stage\.reviewRequired && reviewOnlyStatuses\.includes\(status\.id\)\}/);
  assert.match(workflow, /statusWithoutReview/);
  assert.match(detail, /بدون نیاز به ارزیاب/);
  assert.match(detail, /stage\.reviewRequired === false \? 'completed' : 'pending_approval'/);
  assert.doesNotMatch(create, /user\.departmentId === stage\.departmentId \|\| user\.id === formData\.ownerId/);
  assert.match(reviewService, /مرحلهٔ بدون نیاز به ارزیاب نمی‌تواند/);
  assert.match(sync, /\(\$stage\['reviewRequired'\] \?\? true\) !== false/);
});

test('approval center previews outputs and content stages expose direct decisions', async () => {
  const [center, detail, controller] = await Promise.all([
    source('../src/components/workspace/ApprovalCenter.tsx'),
    source('../src/components/content/ContentDetailView.tsx'),
    source('../../backend/app/Http/Controllers/Api/V1/ApprovalController.php'),
  ]);
  assert.match(center, /نمایش خروجی/);
  assert.match(center, /outputRow\.outputs\.map/);
  assert.match(detail, /تأیید مستقیم/);
  assert.match(detail, /setSelectedStageForReject\(stage\)/);
  assert.match(controller, /'outputs' => array_values/);
});

test('sorting uses a criterion dropdown and one icon direction button', async () => {
  const [workspace, projectList, tables] = await Promise.all([
    source('../src/components/workspace/WorkspaceList.tsx'),
    source('../src/components/projects/ProjectListView.tsx'),
    source('../src/components/dam/DamDataTables.tsx'),
  ]);
  assert.match(workspace, /aria-label="مرتب‌سازی"/);
  assert.match(workspace, /مرتب‌سازی صعودی؛ تغییر به نزولی/);
  assert.doesNotMatch(workspace, /<Select aria-label="ترتیب"/);
  assert.match(projectList, /<select value=\{sortField\}/);
  assert.match(projectList, /setSortAsc\(value => !value\)/);
  assert.match(tables, /<select value=\{sortColumn \|\| ''\}/);
  assert.match(tables, /setSortDirection\(direction => direction === 'asc' \? 'desc' : 'asc'\)/);
});

test('attachment composer supports creating a data table or appending a row', async () => {
  const composer = await source('../src/components/common/AttachmentComposer.tsx');
  assert.match(composer, /type Mode = 'file' \| 'text' \| 'library' \| 'table'/);
  assert.match(composer, /label: 'جدول اطلاعات'/);
  assert.match(composer, /request<ApiResponse<DataTableResponse>>\('\/dam\/data-tables'/);
  assert.match(composer, /`\/dam\/data-tables\/\$\{tableId\}\/rows`/);
  assert.match(composer, /task_id/);
  assert.match(composer, /content_id/);
});

test('requested workflow, DAM, notification and comment refinements stay connected end to end', async () => {
  const [detail, composer, operations, dam, notifications, comments, taskDetail, icons] = await Promise.all([
    source('../src/components/content/ContentDetailView.tsx'),
    source('../src/components/common/AttachmentComposer.tsx'),
    source('../../backend/app/Services/TaskOperations.php'),
    source('../src/components/dam/DamLibrary.tsx'),
    source('../src/components/workspace/NotificationInbox.tsx'),
    source('../src/components/comments/CommentsView.tsx'),
    source('../src/components/tasks/TaskDetailDrawer.tsx'),
    source('../src/utils/platformIcons.ts'),
  ]);
  assert.match(detail, /defaultFolderLabel=\{`پیش‌فرض خودکار:/);
  assert.match(detail, /stageActionKey === `approve:/);
  assert.match(composer, /folderPathName\(folder\.id\)/);
  assert.match(operations, /app\(ContentReview::class\)->decide/);
  assert.match(dam, /setExpanded\(value => !value\)/);
  assert.match(dam, /role="dialog" aria-modal="true" aria-label=\{`پیش‌نمایش/);
  assert.doesNotMatch(dam, /setFullscreen/);
  assert.match(notifications, /وضعیت اعلان‌ها/);
  assert.match(notifications, /category=collaboration|collaboration/);
  assert.match(comments, /childrenByParent/);
  assert.match(comments, /depth < 3/);
  assert.match(taskDetail, /task\.subtasks\.length > 0 && <section/);
  for (const icon of ['MessageSquare', 'PlayCircle', 'Clapperboard']) assert.match(icons, new RegExp(icon));
});
