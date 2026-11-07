import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

test('chat send keeps a render-safe optimistic message when the API response is partial', async () => {
  const [context, input] = await Promise.all([
    source('../src/app/providers/AppContext.tsx'),
    source('../src/features/messaging/chat/MessageInput.tsx'),
  ]);
  assert.match(context, /const normalized = normalizeChatMessage\(persisted, newMsg\)/);
  assert.match(context, /reactions: Array\.isArray\(value\?\.reactions\)/);
  assert.match(context, /\.\.\.\(fallback \|\| \{\}\),[\s\S]*\.\.\.\(value \|\| \{\}\)/);
  assert.match(input, /try \{[\s\S]*sendMessage\(/);
  assert.match(input, /متن پیام حفظ شد/);
});

test('department dashboard is scoped to one department with list return, edit and member badges', async () => {
  const dashboard = await source('../src/features/departments/DepartmentDashboardView.tsx');
  assert.match(dashboard, /داشبورد دپارتمان \{data\?\.department\.name/);
  assert.match(dashboard, /بازگشت به فهرست دپارتمان‌ها/);
  assert.match(dashboard, /ویرایش دپارتمان/);
  assert.match(dashboard, /members\.map\(member => <span/);
  assert.doesNotMatch(dashboard, /انتخاب دپارتمان/);
});

test('review-free stages cannot select review states and complete directly', async () => {
  const [workflow, detail, create, reviewService, sync] = await Promise.all([
    source('../src/features/contents/EditWorkflowModal.tsx'),
    source('../src/features/contents/ContentDetailView.tsx'),
    source('../src/features/contents/CreateContentModal.tsx'),
    source('../../backend/app/Modules/Contents/Services/ContentReview.php'),
    source('../../backend/app/Modules/Contents/Services/ContentStageTaskSync.php'),
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
    source('../src/features/workspace/ApprovalCenter.tsx'),
    source('../src/features/contents/ContentDetailView.tsx'),
    source('../../backend/app/Modules/Administration/Http/Controllers/ApprovalController.php'),
  ]);
  assert.match(center, /نمایش خروجی/);
  assert.match(center, /outputRow\.outputs\.map/);
  assert.match(detail, /تأیید مستقیم/);
  assert.match(detail, /setSelectedStageForReject\(stage\)/);
  assert.match(controller, /'outputs' => array_values/);
});

test('sorting uses a criterion dropdown and one icon direction button', async () => {
  const [workspace, projectList, tables] = await Promise.all([
    source('../src/features/workspace/WorkspaceList.tsx'),
    source('../src/features/projects/ProjectListView.tsx'),
    source('../src/features/dam/DamDataTables.tsx'),
  ]);
  // UX-02-3: single-criterion dropdown superseded by the multi-sort editor
  // (allowlisted fields, explicit precedence, asc/desc cycling).
  assert.match(workspace, /مرتب‌سازی چندستونه/);
  assert.match(workspace, /cycleDraftSort/);
  assert.match(workspace, /مرتب‌سازی بر اساس/);
  assert.doesNotMatch(workspace, /<Select aria-label="ترتیب"/);
  assert.match(projectList, /<select value=\{sortField\}/);
  assert.match(projectList, /setSortAsc\(value => !value\)/);
  assert.match(tables, /<select value=\{sortColumn \|\| ''\}/);
  assert.match(tables, /setSortDirection\(direction => direction === 'asc' \? 'desc' : 'asc'\)/);
});

test('attachment composer supports creating a data table or appending a row', async () => {
  const composer = await source('../src/shared/ui/AttachmentComposer.tsx');
  assert.match(composer, /type Mode = 'file' \| 'text' \| 'library' \| 'table'/);
  assert.match(composer, /label: 'جدول اطلاعات'/);
  assert.match(composer, /request<ApiResponse<DataTableResponse>>\('\/dam\/data-tables'/);
  assert.match(composer, /`\/dam\/data-tables\/\$\{tableId\}\/rows`/);
  assert.match(composer, /task_id/);
  assert.match(composer, /content_id/);
});

test('idea attachments keep empty poll defaults, managed folders, multi-row tables and rich notes', async () => {
  const [idea, composer, richText, dam, taskAssets, controller, service] = await Promise.all([
    source('../src/features/thought-room/CreateIdeaModal.tsx'),
    source('../src/shared/ui/AttachmentComposer.tsx'),
    source('../src/shared/ui/RichTextEditor.tsx'),
    source('../src/features/dam/DamLibrary.tsx'),
    source('../src/features/tasks/TaskAssetsSection.tsx'),
    source('../../backend/app/Modules/Dam/Http/Controllers/DamAssetController.php'),
    source('../../backend/app/Modules/Dam/Services/DamService.php'),
  ]);
  assert.match(idea, /useState<string\[\]>\(\['', ''\]\)/);
  assert.match(idea, /ideaKey: createRequestId\.current/);
  assert.match(idea, /ایده‌ها \/ \$\{ideaToEdit\?\.id \|\| 'شناسه ایده پس از ثبت'\} \/ فایل/);
  assert.match(composer, /rows\?: Array<Record<string, string>>/);
  assert.match(composer, /for \(const cells of rows\)/);
  assert.match(composer, /ثبت این ردیف و افزودن ردیف دیگر/);
  assert.doesNotMatch(composer, /نام فایل اصلی:/);
  assert.match(composer, /<RichTextEditor/);
  assert.match(richText, /DROP_WITH_CONTENT/);
  assert.match(richText, /createPortal/);
  assert.match(dam, /<RichTextEditor/);
  assert.match(dam, /<TextAssetViewer/);
  assert.match(taskAssets, /<TextAssetViewer/);
  assert.match(controller, /'idea_key' => 'nullable\|uuid\|required_with:idea_title'/);
  assert.match(service, /managedFolder\('ایده‌ها'/);
  assert.match(service, /managedFolder\('فایل'/);
  assert.match(service, /DamRichText::sanitize/);
  assert.match(service, /'content_format' => 'html'/);
});

test('requested workflow, DAM, notification and comment refinements stay connected end to end', async () => {
  const [detail, composer, operations, dam, notifications, comments, taskDetail, icons] = await Promise.all([
    source('../src/features/contents/ContentDetailView.tsx'),
    source('../src/shared/ui/AttachmentComposer.tsx'),
    source('../../backend/app/Modules/Tasks/Services/TaskOperations.php'),
    source('../src/features/dam/DamLibrary.tsx'),
    source('../src/features/workspace/NotificationInbox.tsx'),
    source('../src/features/comments/CommentsView.tsx'),
    source('../src/features/tasks/TaskDetailDrawer.tsx'),
    source('../src/shared/lib/platformIcons.ts'),
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
    source('../src/features/contents/CreateContentModal.tsx'),
    source('../src/features/contents/ContentDetailView.tsx'),
    source('../src/features/workspace/RelatedRecords.tsx'),
    source('../src/app/App.tsx'),
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
    source('../src/features/settings/legacy/SettingsView.tsx'),
    source('../src/app/providers/AppContext.tsx'),
    source('../../backend/app/Modules/Integrations/Services/GoogleMeetService.php'),
    source('../src/features/thought-room/CreateMeetingModal.tsx'),
  ]);
  assert.match(settings, /اتصال یکپارچه Google Workspace/);
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
    source('../src/features/contents/EditContentModal.tsx'),
    source('../src/shared/types.ts'),
    source('../src/shared/lib/statusBadges.tsx'),
    source('../src/features/workspace/WorkspaceList.tsx'),
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
    source('../src/features/settings/legacy/SettingsView.tsx'),
    source('../src/features/thought-room/CreateMeetingModal.tsx'),
    source('../../backend/app/Modules/Integrations/Services/GoogleMeetService.php'),
    source('../../backend/app/Modules/Administration/Http/Controllers/SystemSettingController.php'),
  ]);
  assert.match(service, /public function connectionStatus\(\): array/);
  assert.match(service, /serverConfigured/);
  assert.doesNotMatch(service, /connectionStatus[\s\S]{0,1400}credentials_path.*=>/);
  assert.match(controller, /connectionStatus\(\)/);
  assert.match(settings, /اتصال سرور آماده نیست/);
  assert.match(settings, /ذخیره تنظیمات Google Workspace/);
  assert.match(meeting, /googleMeetSettings\.serverConfigured !== false/);
  assert.match(meeting, /بررسی اتصال در تنظیمات/);
});

test('user profile keeps responsive canonical labels, honest metadata and permission-aware controls', async () => {
  const profile = await source('../src/features/identity/UserProfileView.tsx');
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
    source('../src/app/providers/AppContext.tsx'),
    source('../src/features/thought-room/CreateIdeaModal.tsx'),
    source('../../backend/app/Modules/Administration/Services/OrganizationSettings.php'),
    source('../src/shared/types.ts'),
    source('../../backend/app/Modules/Tasks/Services/TaskOperations.php'),
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
    source('../src/features/settings/legacy/SettingsView.tsx'),
    source('../src/features/dam/DamActivityHistory.tsx'),
    source('../src/features/activity/ActivityView.tsx'),
    source('../../backend/app/Modules/Dam/Http/Controllers/DamAssetController.php'),
    source('../../backend/app/Modules/Administration/Services/OrganizationSettings.php'),
    source('../../backend/app/Modules/Administration/Http/Controllers/ActivityLogController.php'),
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
    source('../src/features/identity/UserModal.tsx'),
    source('../src/app/providers/AppContext.tsx'),
    source('../../backend/app/Http/Requests/UserRequest.php'),
    source('../../backend/app/Http/Requests/Auth/RegisterRequest.php'),
    source('../src/features/identity/RoleModal.tsx'),
  ]);
  assert.doesNotMatch(userModal, /۰۹۱۲۰۰۰۰۰۰۰/);
  assert.doesNotMatch(context, /۰۹۱۲۰۰۰۰۰۰۰/);
  assert.match(userModal, /phone: formData\.phone\.trim\(\) \|\| undefined/);
  assert.match(userRequest, /password\.letters.*حداقل شامل یک حرف/s);
  assert.match(registerRequest, /password\.numbers.*حداقل شامل یک عدد/s);
  assert.match(roleModal, /sticky bottom-0 z-20/);
});

test('department managers retain a dedicated dashboard without department-list permission', async () => {
  const [sidebar, dashboard, departmentsApi, departmentController, dashboardController, userResource, routes] = await Promise.all([
    source('../src/app/shell/Sidebar.tsx'),
    source('../src/features/departments/DepartmentDashboardView.tsx'),
    source('../src/shared/api/departments.ts'),
    source('../../backend/app/Modules/Departments/Http/Controllers/DepartmentController.php'),
    source('../../backend/app/Modules/Departments/Http/Controllers/DepartmentDashboardController.php'),
    source('../../backend/app/Http/Resources/UserResource.php'),
    source('../../backend/routes/api.php'),
  ]);
  assert.match(sidebar, /queryKey: \['managed-departments', currentUser\.id\]/);
  assert.match(sidebar, /id: 'departments'[\s\S]{0,180}permission: 'departments\.view'/);
  assert.match(dashboard, /departmentsApi\.managed/);
  assert.match(departmentsApi, /managed\(\)[\s\S]{0,100}\/departments\/managed/);
  assert.match(departmentController, /where\('manager_id', \$request->user\(\)->id\)/);
  assert.match(dashboardController, /\(int\) \$department->manager_id === \(int\) \$actor->id/);
  assert.match(userResource, /'managedDepartmentIds' => \$managedDepartmentIds/);
  assert.match(routes, /departments\/managed.*DepartmentController::class, 'managed'/);
});

test('delivered content outputs can be forwarded to the next stage only by the effective reviewer or assignee fallback', async () => {
  const [detail, context, api, review, controller, routes, types] = await Promise.all([
    source('../src/features/contents/ContentDetailView.tsx'),
    source('../src/app/providers/AppContext.tsx'),
    source('../src/shared/api/contents.ts'),
    source('../../backend/app/Modules/Contents/Services/ContentReview.php'),
    source('../../backend/app/Modules/Administration/Http/Controllers/ApprovalController.php'),
    source('../../backend/routes/api.php'),
    source('../src/shared/types.ts'),
  ]);
  assert.match(detail, /forwardStageOutput\(content\.id, stage\.id, output\.id\)/);
  assert.match(detail, /effectiveReviewerId/);
  assert.match(detail, /ارجاع به مرحله بعد/);
  assert.match(context, /const forwardStageOutput = async/);
  assert.match(api, /outputs\/\$\{encodeURIComponent\(output\)\}\/forward/);
  assert.match(review, /public function forwardOutput/);
  assert.match(review, /فقط ارزیاب تعیین‌شده می‌تواند خروجی را ارجاع دهد/);
  assert.match(review, /در مرحلهٔ بدون ارزیاب فقط مسئول مرحله/);
  assert.match(review, /'sourceOutputId' => \$outputId/);
  assert.match(controller, /forwardOutput\(Request \$request/);
  assert.match(routes, /outputs\/\{output\}\/forward/);
  assert.match(types, /forwardedToStageId\?: string/);
  assert.match(types, /sourceOutputId\?: string/);
});

test('route-scoped workspace loads never overwrite previously loaded collections with empty fallback data', async () => {
  const context = await source('../src/app/providers/AppContext.tsx');
  assert.match(context, /const ideasData = data\(ideaResponse, 'ideas'\); if \(ideasData !== null\) setIdeas\(ideasData\)/);
  assert.match(context, /if \(departmentData !== null\) setDepartments\(departmentData\)/);
  assert.doesNotMatch(context, /setDepartments\(departmentData \?\? \[\]\)/);
  assert.doesNotMatch(context, /setIdeas\(data\(ideaResponse, 'ideas'\) \?\? ideas\)/);
});

test('idea creation is retry-safe, starts with empty estimates and persists attachments in the create command', async () => {
  const [modal, context, controller, request, migration] = await Promise.all([
    source('../src/features/thought-room/CreateIdeaModal.tsx'),
    source('../src/app/providers/AppContext.tsx'),
    source('../../backend/app/Modules/Secretariat/Http/Controllers/WorkspaceRecordController.php'),
    source('../../backend/app/Http/Requests/WorkspaceRecordRequest.php'),
    source('../../backend/database/migrations/2026_10_01_000008_add_workspace_record_request_keys.php'),
  ]);
  assert.match(modal, /useState\(''\);\n  const \[estimatedBudget/);
  assert.match(modal, /const \[tagsInput, setTagsInput\] = useState\(''\)/);
  assert.match(modal, /attachments: \[\.\.\.\(ideaToEdit\?\.attachments \|\| \[\]\), \.\.\.newAttachments\]/);
  assert.match(modal, /clientRequestId: createRequestId\.current/);
  assert.match(modal, /: 'ثبت ایده'/);
  assert.match(modal, /availableDepartments\.map/);
  assert.match(context, /setIdeas\(prev => \[response\.data, \.\.\.prev\.filter\(item => item\.id !== response\.data\.id\)\]\)/);
  assert.match(controller, /client_request_id/);
  assert.match(controller, /setStatusCode\(\$replayed \? 200 : 201\)/);
  assert.match(request, /'clientRequestId' => \['sometimes', 'uuid'\]/);
  assert.match(migration, /uuid\('client_request_id'\)->nullable\(\)/);
  assert.match(migration, /unique\(\['client_request_id', 'kind', 'owner_id'\]/);
});

test('idea cards expose attachments and a permission-aware status badge menu with smart server transitions', async () => {
  const [card, controller] = await Promise.all([
    source('../src/features/thought-room/IdeaCard.tsx'),
    source('../../backend/app/Modules/Secretariat/Http/Controllers/WorkspaceRecordController.php'),
  ]);
  assert.match(card, /attachmentCount > 0/);
  assert.match(card, /ضمیمه/);
  assert.match(card, /aria-label=\{`تغییر وضعیت ایده/);
  assert.match(card, /thinktank\.approve_convert/);
  assert.match(controller, /private function smartIdeaStatus/);
  assert.match(controller, /return 'under_review'/);
  assert.match(controller, /return 'in_progress'/);
  assert.match(controller, /return 'completed'/);
});

test('meetings archive out of the live list and appear in the shared archive with restore', async () => {
  const [meetings, archive, context, types] = await Promise.all([
    source('../src/features/thought-room/ThinkTankMeetingsTab.tsx'),
    source('../src/features/archive/ArchiveView.tsx'),
    source('../src/app/providers/AppContext.tsx'),
    source('../src/shared/types.ts'),
  ]);
  assert.match(meetings, /meeting\.status === 'archived'\) return false/);
  assert.match(meetings, /status: 'archived', archivedFromStatus: meeting\.status/);
  assert.match(archive, /id: 'meetings'.*permission: 'meetings\.view'/);
  assert.match(archive, /archivedMeetings/);
  assert.match(archive, /updateThinkTankMeeting\(meeting\.id/);
  assert.match(context, /archive: \['contents', 'projects', 'tasks', 'ideas', 'thinkTankMeetings', 'users'\]/);
  assert.match(archive, /id: 'ideas'.*permission: 'thinktank\.view'/);
  assert.match(archive, /archivedIdeas/);
  assert.match(types, /'cancelled' \| 'archived'/);
});

test('login and sidebar never leak the real admin username or bypass explicit menu permissions', async () => {
  const [auth, sidebar, settings] = await Promise.all([
    source('../src/features/identity/AuthModal.tsx'),
    source('../src/app/shell/Sidebar.tsx'),
    source('../src/features/settings/legacy/SettingsView.tsx'),
  ]);
  assert.match(auth, /placeholder="نام کاربری"/);
  assert.doesNotMatch(auth, /mahdi\.nabavi/);
  assert.match(sidebar, /enabled: Boolean\(currentUser\.id\),/);
  assert.match(sidebar, /return hasPermission\(item\.permission as any\)/);
  assert.doesNotMatch(sidebar, /hasPermission\(item\.permission as any\) \|\| currentUser\.role === 'admin'/);
  assert.match(settings, /اعتبارنامه و توکن فقط در پیکربندی امن سرور/);
  assert.doesNotMatch(settings, /GOOGLE_(?:CALENDAR|WORKSPACE)_(?:CREDENTIALS|ACCESS_TOKEN)/);
});
