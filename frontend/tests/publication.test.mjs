import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
const source = path => readFile(new URL(path, import.meta.url), 'utf8');

test('publication command commits UI state only after the server result and never manufactures a URL', async () => {
  const context = await source('../src/context/AppContext.tsx');
  const body = context.slice(context.indexOf('  const runPublicationCommand ='), context.indexOf('  const addContentComment ='));
  assert.match(body, /async \(\) => contentsApi\[action\]/);
  assert.ok(body.indexOf('await withPublicationConflictRefresh') < body.indexOf('setContents('));
  assert.match(body, /publicationInFlight.current.has/);
  assert.match(body, /catch \(error\)/);
  assert.match(body, /return false/);
  assert.doesNotMatch(body, /publishUrl|tadbir\.gov\.ir|metrics:/);
});

test('publish API requires a server version but not an external link', async () => {
  const api = await source('../src/api/contents.ts');
  const publish = api.slice(api.indexOf('  publish:'), api.indexOf('  unpublish:'));
  assert.match(publish, /\/publish/);
  assert.match(publish, /body: \{ expectedVersion \}/);
  assert.doesNotMatch(publish, /url|link|publishUrl/i);
});

test('publication task is automatic and publish actions stay hidden until workflow completion', async () => {
  const view = await source('../src/components/content/ContentPublishingView.tsx');
  assert.doesNotMatch(view, /createPublicationTask|ایجاد تسک انتشار|addTask\(/);
  assert.match(view, /workflowReady\(schedulingContent\)/);
  const detail = await source('../src/components/content/ContentDetailView.tsx');
  assert.match(detail, /tasks.filter\(t => t.contentId === content.id\)/);
  assert.match(detail, /workflowReady && hasPermission\('content.publish'\)/);
  const manual = await source('../src/components/tasks/CreateTaskModal.tsx');
  assert.doesNotMatch(manual, /event_id|publicationVersion|expectedVersion|ContentPublished/);
});

// Executable promise-level tests of the helper used by publication, schedule and task APIs.
// These supplement source contracts; they are not browser interaction coverage.
import { withPublicationConflictRefresh } from '../src/utils/publicationCommand.ts';

test('publication helper returns the actual result without refreshing on success', async () => {
  const result = { content: { status: 'published' }, tasks: [{ status: 'completed' }] };
  assert.equal(await withPublicationConflictRefresh(async () => result, assert.fail), result);
});

test('a conflict refreshes once but never silently retries or reports success', async () => {
  const error = Object.assign(new Error('stale version'), { status: 409 });
  let commands = 0; let refreshes = 0;
  await assert.rejects(withPublicationConflictRefresh(async () => { commands++; throw error; }, async () => { refreshes++; }), value => value === error);
  assert.equal(commands, 1); assert.equal(refreshes, 1);
});

test('failed refresh preserves the original conflict error', async () => {
  const error = { status: 409 };
  await assert.rejects(withPublicationConflictRefresh(async () => { throw error; }, async () => { throw new Error('offline'); }), value => value === error);
});

test('denial, validation and server/network failures never refresh or become successful', async () => {
  for (const error of [{ status: 403 }, { status: 422 }, { status: 500 }, new Error('offline')]) {
    await assert.rejects(withPublicationConflictRefresh(async () => { throw error; }, assert.fail), value => value === error);
  }
});
