import assert from 'node:assert/strict';
import test from 'node:test';
import { followTaskLink, readTaskLink, taskLink, readTaskAssetLink } from '../src/utils/taskDeepLink.ts';
const settle = () => new Promise(resolve => setImmediate(resolve));

test('only one positive decimal task ID is accepted, without number precision loss', () => {
  assert.equal(readTaskLink('?task=123'), '123');
  assert.equal(readTaskLink('?task=999999999999999999'), '999999999999999999');
  for (const query of ['', '?task=0', '?task=-1', '?task=1.2', '?task=123&task=456', '?task=https://evil.example', '?task=abc', '?task=9999999999999999999']) assert.equal(readTaskLink(query), null);
});

test('copy links preserve deployment path but contain no previous query or hash', () => {
  assert.equal(taskLink('https://tadbir.morvarid-daron.ir/?old=secret#section', '123'), 'https://tadbir.morvarid-daron.ir/?task=123');
  assert.equal(taskLink('https://example.test/panel/', '12'), 'https://example.test/panel/?task=12');
  assert.equal(taskLink('https://example.test/', 'task-temp'), null);
  assert.equal(taskLink('https://user:password@example.test/', '12'), null);
});

test('wait for login/workspace, then load the specific task independently of any list', async () => {
  const seen = [];
  const options = { id: '123', signedIn: false, loading: false, load: async id => { seen.push(id); return { id }; }, open: task => seen.push(task), failed: assert.fail };
  followTaskLink(options);
  followTaskLink({ ...options, signedIn: true, loading: true });
  assert.deepEqual(seen, []);
  followTaskLink({ ...options, signedIn: true });
  await settle();
  assert.deepEqual(seen, ['123', { id: '123' }]);
});

test('API denial opens no cached task and surfaces failure', async () => {
  let opened = false; let failed = false;
  followTaskLink({ id: '123', signedIn: true, loading: false, load: async () => { throw new Error('403'); }, open: () => { opened = true; }, failed: () => { failed = true; } });
  await settle();
  assert.equal(opened, false); assert.equal(failed, true);
});

test('navigation/signout cancels late responses and stale errors', async () => {
  for (const reject of [false, true]) {
    let complete; let signal; let callback = false;
    const cancel = followTaskLink({ id: '123', signedIn: true, loading: false,
      load: (id, receivedSignal) => { signal = receivedSignal; return new Promise((ok, fail) => { complete = reject ? fail : ok; }); },
      open: () => { callback = true; }, failed: () => { callback = true; } });
    cancel(); complete(reject ? new Error('old session') : { id: '123' }); await settle();
    assert.equal(signal.aborted, true); assert.equal(callback, false);
  }
});

test('asset-form hints are bounded, unique and tied to the authenticated task link', () => {
  for (const kind of ['create', 'text', 'file', 'row', 'link']) assert.equal(readTaskAssetLink(`?task=123&asset=${kind}`, '123'), kind);
  for (const query of ['?task=123&asset=file&asset=text', '?task=123&task=456&asset=file', '?task=123&asset=https://evil.test', '?asset=file', '?task=456&asset=file']) assert.equal(readTaskAssetLink(query, '123'), null);
  assert.equal(taskLink('https://example.test/?task=123&asset=file', '123'), 'https://example.test/?task=123');
});
