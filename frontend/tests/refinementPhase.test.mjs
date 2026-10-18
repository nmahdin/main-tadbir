import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parseListQuery } from '../src/app/router/listQuery.ts';
import { sortMessagesChronologically } from '../src/shared/lib/chatMessages.ts';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');
const message = (id, createdAt) => ({ id, createdAt, timestamp: createdAt, conversationId: '1', senderId: '1', text: id, deliveryStatus: 'sent' });

test('conversation messages are rendered oldest first and preserve stable ties', () => {
  const first = message('first', '2026-01-01T08:00:00Z');
  const second = message('second', '2026-01-01T09:00:00Z');
  const same = message('same', '2026-01-01T09:00:00Z');
  assert.deepEqual(sortMessagesChronologically([second, first, same]).map(item => item.id), ['first', 'second', 'same']);
});

test('near-due task links survive URL parsing and reach the server filter', async () => {
  assert.deepEqual(parseListQuery('?due=near', 'tasks'), { due: 'near' });
  assert.deepEqual(parseListQuery('?due=near', 'projects'), {});
  const controller = await source('../../backend/app/Modules/Tasks/Http/Controllers/TaskController.php');
  assert.match(controller, /\$due === 'near'[\s\S]*addDays\(5\)/);
});

test('idea details expose and advance the custom workflow', async () => {
  const [details, create, service] = await Promise.all([
    source('../src/features/thought-room/IdeaDetailsModal.tsx'),
    source('../src/features/thought-room/CreateIdeaModal.tsx'),
    source('../../backend/app/Modules/Dam/Services/DamService.php'),
  ]);
  assert.match(details, /جریان اختصاصی ایده/);
  assert.match(details, /advanceWorkflow/);
  assert.match(details, /status: 'completed'/);
  assert.match(details, /status: 'in_progress'/);
  assert.match(create, /شناسه ایده پس از ثبت/);
  assert.match(service, /movePrecreatedIdeaAsset/);
  assert.match(service, /\$idea \? \$idea->id/);
});

test('busy modals remain closable while entity and upload requests are cancellable', async () => {
  const [modal, client, resources, idea] = await Promise.all([
    source('../src/shared/ui/Primitives.tsx'),
    source('../src/shared/api/client.ts'),
    source('../src/shared/queries/resources.ts'),
    source('../src/features/thought-room/CreateIdeaModal.tsx'),
  ]);
  assert.doesNotMatch(modal, /event\.key === 'Escape' && !busy/);
  assert.doesNotMatch(modal, /disabled=\{busy\} onClick=\{onClose\}/);
  assert.match(client, /error\.name === 'AbortError'/);
  assert.match(client, /xhr\.onabort/);
  assert.match(resources, /queryFn: async \(\{ signal \}\)/);
  assert.match(idea, /submitController\.current\?\.abort\(\)/);
  assert.match(idea, /signal: controller\.signal/);
});

test('standalone DAM file manager owns navigation, root folders, filters and sort controls', async () => {
  const dam = await source('../src/features/dam/DamLibrary.tsx');
  assert.match(dam, /data-dam-mode="file-manager"/);
  assert.match(dam, /بازگشت به پوشه بالاتر/);
  assert.match(dam, /ریشه مخزن/);
  assert.match(dam, /folders\.filter\(folder => folder\.parent_id === folderId\)/);
  assert.match(dam, /viewMode === 'explorer'\) params\.set\('folder_id'/);
  assert.match(dam, /فیلتر نوع دارایی/);
  assert.match(dam, /مرتب‌سازی فایل‌ها/);
  assert.match(dam, /temporaryLinkBusy/);
});

test('task, project and text-asset refinements remain wired', async () => {
  const [tasks, detail, project, actions, downloads] = await Promise.all([
    source('../src/features/workspace/WorkspaceList.tsx'),
    source('../src/features/tasks/TaskDetailDrawer.tsx'),
    source('../src/features/projects/ProjectDetailView.tsx'),
    source('../src/shared/ui/TextAssetActions.tsx'),
    source('../src/shared/lib/textAssetDownload.ts'),
  ]);
  assert.doesNotMatch(tasks, /sky-/);
  assert.match(tasks, /task\.estimatedHours/);
  assert.match(detail, /commentSubmitting/);
  assert.match(detail, /آخرین تغییر:/);
  assert.match(project, /overflow-visible/);
  assert.match(project, /جزئیات پروژه/);
  assert.match(actions, /bottom-full/);
  assert.match(actions, /aria-label="مشاهده متن"/);
  assert.match(downloads, /embeddedVazirmatn/);
  assert.match(downloads, /@font-face\{font-family:'Vazirmatn Download'/);
  assert.match(downloads, /font-family:'Vazirmatn Download','Vazirmatn Variable',Vazirmatn,Vazir/);
  assert.match(downloads, /26px \"Vazirmatn Variable\", Vazirmatn, Vazir/);
});
