import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseListQuery, safeReturnTo, notificationDestination } from '../src/routing/listQuery.ts';
test('query parser bounds numbers, sort, views and legacy overdue links', () => {
  assert.deepEqual(parseListQuery('?page=-4&status=bogus&sort=password&direction=up', 'tasks'), {});
  assert.deepEqual(parseListQuery('?page=2&assignee=me&status=overdue', 'tasks'), {page:'2',due:'overdue',assignee:'me'});
  assert.deepEqual(parseListQuery('?status=custom&type=video&target_audience=managers', 'contents', ['custom'], ['video'], ['managers']), {status:'custom',type:'video',target_audience:'managers'});
  assert.deepEqual(parseListQuery('?target_audience=unknown', 'contents', [], [], ['managers']), {});
  assert.deepEqual(parseListQuery('?priority=urgent&type=video', 'tasks', [], ['video']), {priority:'urgent'});
  assert.deepEqual(parseListQuery('?content_id=42', 'tasks'), {content_id:'42'});
  assert.deepEqual(parseListQuery('?content_id=42', 'contents'), {});
});
test('return URLs cannot escape the permitted list routes', () => {
  for (const url of ['https://evil.example','//evil.example','/login','/tasks/0','/tasks?x=1#oops']) assert.equal(safeReturnTo(url,'/tasks'),'/tasks');
  assert.equal(safeReturnTo('/projects/45?tab=list&tasks_page=2','/tasks'),'/projects/45?tab=list&tasks_page=2');
  assert.equal(safeReturnTo('/projects?status=active&page=2','/tasks'),'/projects?status=active&page=2');
});
test('notifications navigate by ID without relying on loaded records', () => {
  assert.equal(notificationDestination({linkTaskId:'9999'}),'/tasks/9999');
  assert.equal(notificationDestination({linkTaskId:'../admin'}),null);
  assert.equal(notificationDestination({}),null);
});
