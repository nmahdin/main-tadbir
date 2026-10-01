import assert from 'node:assert/strict';
import test from 'node:test';
import { resourceUrl } from '../src/utils/resourceUrl.ts';
test('stored resource links exclude executable, temporary and malformed URL schemes',()=>{
  for(const url of ['javascript:alert(1)','data:text/html,hi','blob:https://example.test/123','//example.test/x','/\\example.test','/\n/example.test','#',undefined])assert.equal(resourceUrl(url),null);
  for(const url of ['https://example.test/file','http://example.test/file','/api/v1/dam/library/1/download'])assert.equal(resourceUrl(url),url);
});
