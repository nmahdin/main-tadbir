import assert from 'node:assert/strict';
import test from 'node:test';
import { takeBalePanelToken } from '../src/auth/balePanelSession.ts';

const token = 'a'.repeat(64);

test('Bale mini-app token is read from the fragment and removed before API work', () => {
  const calls = [];
  const location = { hash: `#bale-login=${token}`, pathname: '/tasks', search: '?page=2' };
  const history = { state: { keep: true }, replaceState: (...args) => calls.push(args) };
  assert.equal(takeBalePanelToken(location, history), token);
  assert.deepEqual(calls, [[history.state, '', '/tasks?page=2']]);
});

test('malformed Bale mini-app credentials are never exchanged', () => {
  const calls = [];
  const location = { hash: '#bale-login=not-a-token', pathname: '/', search: '' };
  const history = { state: null, replaceState: (...args) => calls.push(args) };
  assert.equal(takeBalePanelToken(location, history), null);
  assert.equal(calls.length, 1);
});
