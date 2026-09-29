import assert from 'node:assert/strict';
import test from 'node:test';
import { readDamEntryLink } from '../src/utils/damEntryLink.ts';
test('file entry navigation accepts only one known hint without a task context', () => {
  assert.equal(readDamEntryLink('?dam_entry=file'), true);
  assert.equal(readDamEntryLink('?other=1&dam_entry=file'), true);
  for (const value of ['', '?dam_entry=text', '?dam_entry=file&dam_entry=file', '?task=1&dam_entry=file', '?dam_entry=https://example.test']) assert.equal(readDamEntryLink(value), false);
});
