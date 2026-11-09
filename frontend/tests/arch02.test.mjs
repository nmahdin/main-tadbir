import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// ARCH-02 frontend ownership guards
// (docs/architecture/arch-02-module-organization.md):
//  - the pre-ARCH-02 global zones (src/components, src/api, ...) are gone
//    and must not reappear or be imported again;
//  - features compose other features only through the registered
//    composition allowlist below (frozen set; new compositions must be
//    registered here and in the architecture document, never added
//    silently);
//  - the shared layer never depends on a feature;
//  - the src import graph is acyclic;
//  - canonical Ocean token definitions live only in their two E6 homes.

const SRC = fileURLToPath(new URL('../src', import.meta.url));

const sourceFiles = [];
(function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(ts|tsx)$/.test(entry.name)) sourceFiles.push(full);
  }
})(SRC);

function resolveSpecifier(fromFile, specifier) {
  if (!specifier.startsWith('.')) return null; // package import
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.css`,
    `${base}.json`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return undefined; // relative import that does not resolve
}

const edges = new Map();
for (const file of sourceFiles) {
  const source = readFileSync(file, 'utf8');
  const targets = [];
  for (const match of source.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g)) {
    const resolved = resolveSpecifier(file, match[1]);
    if (resolved === undefined) {
      targets.push({ unresolved: match[1] });
    } else if (resolved !== null) {
      targets.push({ resolved });
    }
  }
  edges.set(file, targets);
}

const featureOf = file => {
  const match = file.slice(SRC.length).match(/^\/features\/([^/]+)\//);
  return match ? match[1] : null;
};

test('retired pre-ARCH-02 zones do not exist and are never imported', () => {
  for (const zone of ['components', 'api', 'context', 'queries', 'routing', 'utils', 'config', 'demo']) {
    assert.equal(existsSync(path.join(SRC, zone)), false, `retired zone src/${zone} must not reappear; use app/, features/ or shared/`);
  }
  assert.equal(existsSync(path.join(SRC, 'types.ts')), false, 'src/types.ts moved to src/shared/types.ts');

  for (const [file, targets] of edges) {
    for (const target of targets) {
      assert.ok(!target.unresolved, `${file} imports unresolvable specifier ${target.unresolved}`);
      const relative = target.resolved.slice(SRC.length);
      assert.ok(
        !/^\/(components|api|context|queries|routing|utils|config|demo)\//.test(relative),
        `${file} imports retired zone path ${relative}`,
      );
    }
  }
});

// Registered feature compositions (frozen; may only shrink). Any other
// feature -> feature import fails: promote the shared piece to
// src/shared or compose in src/app instead.
const REGISTERED_COMPOSITIONS = new Set([
  'contents>calendar',
  'contents>dam',
  'contents>workspace',
  'identity>messaging',
  'projects>calendar',
  'projects>dam',
  'projects>thought-room',
  'settings>activity',
  'settings>dam',
  'settings>messaging',
  'tasks>calendar',
  'thought-room>messaging',
  'workspace>tasks',
]);

test('features compose other features only through the registered allowlist', () => {
  for (const [file, targets] of edges) {
    const own = featureOf(file);
    if (!own) continue;
    for (const target of targets) {
      if (!target.resolved) continue;
      const other = featureOf(target.resolved);
      if (other && other !== own) {
        assert.ok(
          REGISTERED_COMPOSITIONS.has(`${own}>${other}`),
          `${file} imports feature [${other}] internals (${target.resolved}); register the composition or move the shared piece to src/shared`,
        );
      }
    }
  }
});

test('the shared layer never imports a feature', () => {
  for (const [file, targets] of edges) {
    if (!file.slice(SRC.length).startsWith('/shared/')) continue;
    for (const target of targets) {
      if (!target.resolved) continue;
      assert.equal(featureOf(target.resolved), null, `shared file ${file} must not import feature code (${target.resolved})`);
    }
  }
});

test('the src import graph is acyclic', () => {
  const color = new Map(); // 1 = on stack, 2 = done
  const stack = [];
  const visit = file => {
    color.set(file, 1);
    stack.push(file);
    for (const target of edges.get(file) ?? []) {
      if (!target.resolved || !edges.has(target.resolved)) continue;
      if (color.get(target.resolved) === 1) {
        const cycle = stack.slice(stack.indexOf(target.resolved)).concat(target.resolved);
        assert.fail(`import cycle: ${cycle.map(entry => entry.slice(SRC.length)).join(' -> ')}`);
      }
      if (!color.get(target.resolved)) visit(target.resolved);
    }
    stack.pop();
    color.set(file, 2);
  };
  for (const file of sourceFiles) {
    if (!color.get(file)) visit(file);
  }
});

test('canonical ocean token definitions stay in their two E6 homes', () => {
  const allowed = new Set([
    path.join(SRC, 'styles/index.css'),
    path.join(SRC, 'features/showcase/uiShowcaseThemes.css'),
  ]);
  const definitions = /--color-primary[\w-]*\s*:/;
  const offenders = [];
  (function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx|css)$/.test(entry.name) && definitions.test(readFileSync(full, 'utf8')) && !allowed.has(full)) {
        offenders.push(full.slice(SRC.length));
      }
    }
  })(SRC);
  assert.deepEqual(offenders, [], 'define --color-primary* only in src/styles/index.css or the /theme-previews mapping (E6)');
});
