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

test('content creation and detail UI keep department members, rich outputs, task list and icon return connected', async () => {
  const [create, detail, related, app] = await Promise.all([
    source('../src/components/content/CreateContentModal.tsx'),
    source('../src/components/content/ContentDetailView.tsx'),
    source('../src/components/workspace/RelatedRecords.tsx'),
    source('../src/App.tsx'),
  ]);
  assert.match(create, /department\?\.members \|\| \[\]/);
  assert.match(create, /department\?\.managerId/);
  assert.match(create, /user\.status === 'active'/);
  assert.match(create, /membersForDepartment\(stage\.departmentId\)/);
  assert.match(create, /templateStageAssignees\[assignmentKey\]/);
  assert.match(create, /stages: customFlow \|\| templateFlow/);
  assert.match(create, /مسئول اجرای هر مرحله را از اعضا و مدیر دپارتمان/);
  assert.match(detail, /variant="task-list"/);
  assert.match(detail, /خروجی‌های مرحله/);
  assert.match(detail, /ثبت‌شده در مخزن/);
  assert.match(detail, /ui-icon-button-back/);
  assert.match(related, /variant\?: 'table'\|'task-list'/);
  assert.match(related, /TaskStatusBadge/);
  assert.match(related, /moveTaskStatus\(row\.id,completed\?'backlog':'completed'\)/);
  assert.match(related, /setSelectedTaskId\(row\.id\)/);
  assert.doesNotMatch(app, /<DetailContext module="contents"/);
});

test('settings expose operational Google Meet controls and sanitize retired content statuses', async () => {
  const [settings, context, service, meeting] = await Promise.all([
    source('../src/components/settings/SettingsView.tsx'),
    source('../src/context/AppContext.tsx'),
    source('../../backend/app/Services/GoogleMeetService.php'),
    source('../src/components/thought-room/CreateMeetingModal.tsx'),
  ]);
  assert.match(settings, /گوگل میت و تقویم/);
  assert.match(settings, /googleMeetSettings\.calendarId/);
  assert.match(settings, /googleMeetSettings\.sendUpdates/);
  assert.match(settings, /defaultDurationMinutes/);
  assert.match(context, /sanitizeContentStatuses/);
  assert.match(context, /\['google_meet', persistableGoogleMeetSettings\(googleMeetSettings\)\]/);
  assert.match(service, /SystemSetting::query\(\)->where\('key', 'google_meet'\)/);
  assert.match(service, /\$settings\['calendarId'\]/);
  assert.match(meeting, /googleMeetSettings\.defaultDurationMinutes/);
  assert.match(meeting, /googleMeetSettings\.enabled/);
});

test('content editing saves publisher only through publication settings and retires legacy content statuses', async () => {
  const [edit, types, badges, workspace, resource] = await Promise.all([
    source('../src/components/content/EditContentModal.tsx'),
    source('../src/types.ts'),
    source('../src/utils/statusBadges.tsx'),
    source('../src/components/workspace/WorkspaceList.tsx'),
    source('../../backend/app/Http/Resources/ContentResource.php'),
  ]);
  assert.match(edit, /publicationSettingsChanged/);
  assert.match(edit, /scheduleContentPublication\(content\.id/);
  assert.match(edit, /publisherId: publisherId \|\| null/);
  const genericUpdate = edit.match(/const saved = await updateContent\(content\.id, \{([\s\S]*?)\n    \}\);/)?.[1] || '';
  assert.doesNotMatch(genericUpdate, /publisherId/);
  const contentStatus = types.match(/export type ContentStatus = ([^;]+);/)?.[1] || '';
  assert.doesNotMatch(contentStatus, /in_progress|completed/);
  assert.doesNotMatch(badges, /case 'in_progress'|case 'completed'/);
  assert.match(workspace, /label: 'در حال تولید',[\s\S]*status: 'producing'/);
  assert.match(resource, /'in_progress' => 'producing'/);
  assert.match(resource, /'completed' => 'approved'/);
});

test('Google Meet exposes safe server readiness and explains unavailable creation', async () => {
  const [settings, meeting, service, controller] = await Promise.all([
    source('../src/components/settings/SettingsView.tsx'),
    source('../src/components/thought-room/CreateMeetingModal.tsx'),
    source('../../backend/app/Services/GoogleMeetService.php'),
    source('../../backend/app/Http/Controllers/Api/V1/SystemSettingController.php'),
  ]);
  assert.match(service, /public function connectionStatus\(\): array/);
  assert.match(service, /serverConfigured/);
  assert.doesNotMatch(service, /connectionStatus[\s\S]{0,1400}credentials_path.*=>/);
  assert.match(controller, /connectionStatus\(\)/);
  assert.match(settings, /اتصال سرور آماده نیست/);
  assert.match(settings, /ذخیره تنظیمات Google Meet/);
  assert.match(meeting, /googleMeetSettings\.serverConfigured !== false/);
  assert.match(meeting, /بررسی اتصال در تنظیمات/);
});

test('user profile keeps responsive canonical labels, honest metadata and permission-aware controls', async () => {
  const profile = await source('../src/components/users/UserProfileView.tsx');
  assert.match(profile, /const roleLabel = userRole\?\.name \|\| 'نقش سازمانی'/);
  assert.match(profile, /const departmentLabel = userDepartment\?\.name/);
  assert.match(profile, /const canEditUser = isSelf \|\| hasPermission\('users\.edit'\)/);
  assert.match(profile, /const canChangeStatus = hasPermission\('users\.status'\)/);
  assert.match(profile, /aria-label=\{hasPermission\('users\.view'\)/);
  assert.match(profile, /PriorityPill/);
  assert.match(profile, /TaskStatusBadge/);
  assert.doesNotMatch(profile, /TADBIR \/ PEOPLE|۱۴۰۳\/۰۱\/۱۵|همین امروز|userRole\?\.name \|\| user\.role/);
});

test('new settings autosave, idea categories and task status retirement stay enforced', async () => {
  const [context, idea, organization, types, taskOps, migration] = await Promise.all([
    source('../src/context/AppContext.tsx'),
    source('../src/components/thought-room/CreateIdeaModal.tsx'),
    source('../../backend/app/Services/Organization/OrganizationSettings.php'),
    source('../src/types.ts'),
    source('../../backend/app/Services/TaskOperations.php'),
    source('../../backend/database/migrations/2026_10_01_000007_retire_todo_task_status.php'),
  ]);
  assert.match(context, /window\.setTimeout\(\(\) => void saveSettingsNow\(\), 300\)/);
  assert.ok([...context.matchAll(/\}, 200\);/g)].length >= 2);
  assert.match(idea, /addIdeaCategory/);
  assert.match(idea, /category: category \|\| undefined/);
  assert.match(organization, /\$key === 'idea_categories'.*thinktank\.create_idea/s);
  const taskStatus = types.match(/export type TaskStatus = ([^;]+);/)?.[1] || '';
  assert.doesNotMatch(taskStatus, /todo/);
  assert.doesNotMatch(taskOps.match(/public const STATUSES = ([^;]+);/)?.[1] || '', /todo/);
  assert.match(migration, /where\('status', 'todo'\)->update\(\['status' => 'backlog'\]\)/);
  assert.match(migration, /\(\$stage\['id'\] \?\? null\) !== 'todo'/);
});

test('DAM drafts categories locally, supports configurable statuses and paginates dated activity', async () => {
  const [settings, history, feed, damController, organization, activityController] = await Promise.all([
    source('../src/components/settings/SettingsView.tsx'),
    source('../src/components/dam/DamActivityHistory.tsx'),
    source('../src/components/activity/ActivityView.tsx'),
    source('../../backend/app/Http/Controllers/Api/V1/DamAssetController.php'),
    source('../../backend/app/Services/Organization/OrganizationSettings.php'),
    source('../../backend/app/Http/Controllers/Api/V1/ActivityLogController.php'),
  ]);
  assert.match(settings, /id: -Date\.now\(\)/);
  assert.match(settings, /persistPendingDamCategories/);
  assert.match(settings, /window\.setTimeout\(\(\) => void persistPendingDamCategories\(\), 250\)/);
  assert.match(settings, /handleAddDamStatus/);
  assert.match(settings, /حذف وضعیت/);
  assert.match(organization, /'dam_statuses' => \$this->orderedOptionsRules\(minItems: 1, maxIdLength: 30\)/);
  assert.match(damController, /private function allowedStatuses\(\): array/);
  for (const sourceText of [history, feed]) {
    assert.match(sourceText, /fromDate/);
    assert.match(sourceText, /toDate/);
    assert.match(sourceText, /lastPage/);
    assert.match(sourceText, /صفحه بعد/);
  }
  assert.match(activityController, /whereDate\('created_at', '>=', \$from\)/);
  assert.match(damController, /whereDate\('created_at', '<=', \$to\)/);
});

test('password messages, optional phone and sticky role actions remain user-safe', async () => {
  const [userModal, context, userRequest, registerRequest, roleModal] = await Promise.all([
    source('../src/components/users/UserModal.tsx'),
    source('../src/context/AppContext.tsx'),
    source('../../backend/app/Http/Requests/UserRequest.php'),
    source('../../backend/app/Http/Requests/Auth/RegisterRequest.php'),
    source('../src/components/roles/RoleModal.tsx'),
  ]);
  assert.doesNotMatch(userModal, /۰۹۱۲۰۰۰۰۰۰۰/);
  assert.doesNotMatch(context, /۰۹۱۲۰۰۰۰۰۰۰/);
  assert.match(userModal, /phone: formData\.phone\.trim\(\) \|\| undefined/);
  assert.match(userRequest, /password\.letters.*حداقل شامل یک حرف/s);
  assert.match(registerRequest, /password\.numbers.*حداقل شامل یک عدد/s);
  assert.match(roleModal, /sticky bottom-0 z-20/);
});
