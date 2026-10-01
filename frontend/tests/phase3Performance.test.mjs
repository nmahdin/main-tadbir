import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

test('dynamic platform icons use an explicit tree-shakeable map', async () => {
  const [platforms, modal, publishing] = await Promise.all([
    source('../src/utils/platformIcons.ts'),
    source('../src/components/settings/PlatformModal.tsx'),
    source('../src/components/content/ContentPublishingView.tsx'),
  ]);
  assert.doesNotMatch(modal + publishing, /import\s+\*\s+as\s+\w+\s+from\s+['"]lucide-react['"]/);
  assert.match(platforms, /const PLATFORM_ICONS: Record<string, LucideIcon>/);
});

test('global search is server-side, cancellable and never scans context collections', async () => {
  const search = await source('../src/components/layout/GlobalSearchModal.tsx');
  assert.match(search, /request\(`\/search\?/);
  assert.match(search, /queryFn: \(\{ signal \}\)/);
  assert.match(search, /debouncedQuery\.length >= 2/);
  assert.doesNotMatch(search, /tasks\.filter|projects\.filter|contents\.filter/);
});

test('unopened overlays and workspace pages stay outside the initial route bundle', async () => {
  const [app, context] = await Promise.all([
    source('../src/App.tsx'),
    source('../src/context/AppContext.tsx'),
  ]);
  for (const component of ['WorkspaceList', 'TaskDetailDrawer', 'CreateTaskModal', 'CreateProjectModal', 'CreateContentModal', 'GlobalSearchModal']) {
    assert.match(app, new RegExp(`const ${component} = React\\.lazy`));
  }
  assert.match(app, /\{isCreateTaskOpen && <CreateTaskModal \/>\}/);
  assert.match(app, /\{isSearchOpen && <GlobalSearchModal \/>\}/);
  assert.match(app, /event\.metaKey \|\| event\.ctrlKey/);
  assert.match(context, /projects: \['tasks', 'users'\]/);
  assert.match(context, /archive: \['contents', 'projects', 'tasks', 'thinkTankMeetings', 'users'\]/);
  assert.match(context, /reports: \[\]/);
  assert.match(context, /analytics: \[\]/);
});

test('demo fixtures, celebration renderer and stable vendors stay off the application entry chunk', async () => {
  const [appContext, authContext, vite] = await Promise.all([
    source('../src/context/AppContext.tsx'),
    source('../src/context/AuthContext.tsx'),
    source('../vite.config.ts'),
  ]);
  assert.doesNotMatch(appContext + authContext, /import\s+\{\s*demo\s*\}\s+from/);
  assert.match(appContext, /import\('\.\.\/demo'\)/);
  assert.match(authContext, /import\('\.\.\/demo'\)/);
  assert.match(appContext, /import\('canvas-confetti'\)/);
  assert.match(vite, /return 'react-vendor'/);
  assert.match(vite, /return 'query-vendor'/);
});

test('mutations use one dependency-aware invalidation pass and settings autosave quickly with dirty checking', async () => {
  const [client, queryClient, resources, context] = await Promise.all([
    source('../src/api/client.ts'),
    source('../src/queries/queryClient.ts'),
    source('../src/queries/resources.ts'),
    source('../src/context/AppContext.tsx'),
  ]);
  assert.match(client, /invalidateWorkspaceModules\(responseScope\.userId, affected\)/);
  assert.match(queryClient, /predicate: query =>/);
  assert.match(queryClient, /scope === 'global-search'/);
  assert.match(queryClient, /scope === 'analytics'/);
  assert.doesNotMatch(resources, /onSuccess:\s*async[\s\S]*invalidateQueries/);
  assert.match(context, /window\.setTimeout\(\(\) => void saveSettingsNow\(\), 300\)/);
  assert.match(context, /persistSettings\(true\)/);
});
