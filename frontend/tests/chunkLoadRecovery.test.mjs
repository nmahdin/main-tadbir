import assert from 'node:assert/strict';
import test from 'node:test';

import { isChunkLoadError } from '../src/utils/chunkLoadError.ts';

test('recognizes browser-specific lazy chunk failures', () => {
  assert.equal(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: /assets/old.js')), true);
  assert.equal(isChunkLoadError(new Error('Loading chunk 314 failed')), true);
  assert.equal(isChunkLoadError(new Error('ChunkLoadError: Loading CSS chunk settings failed')), true);
});

test('does not turn unrelated render or API errors into a page reload', () => {
  assert.equal(isChunkLoadError(new Error('Cannot read properties of undefined')), false);
  assert.equal(isChunkLoadError(new Error('Request failed with status code 500')), false);
  assert.equal(isChunkLoadError(null), false);
});
