import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

test('Vazirmatn uses the bundled variable font family emitted by Fontsource', async () => {
  const css = await source('../src/index.css');
  assert.match(css, /@fontsource-variable\/vazirmatn(?:\/wght\.css)?/);
  assert.match(css, /font-family: 'Vazirmatn Variable', 'Vazirmatn'/);
});

test('content creation keeps a configurable audience and an inline custom workflow fallback', async () => {
  const [modal, settings, list] = await Promise.all([
    source('../src/components/content/CreateContentModal.tsx'),
    source('../src/components/settings/SettingsView.tsx'),
    source('../src/components/workspace/WorkspaceList.tsx'),
  ]);
  assert.match(modal, /جریان اختصاصی جدید/);
  assert.match(modal, /stages: customFlow/);
  assert.match(modal, /targetAudiences\.map/);
  assert.match(settings, /setTargetAudiences/);
  assert.match(list, /target_audience/);
});

test('calendar keeps independent task, project, content and all tabs', async () => {
  const calendar = await source('../src/components/projects/ProjectCalendarView.tsx');
  assert.match(calendar, /type CalendarFilter = 'task' \| 'project' \| 'content' \| 'all'/);
  for (const label of ['تسک‌ها', 'پروژه‌ها', 'محتواها', 'همه']) assert.match(calendar, new RegExp(label));
  assert.match(calendar, /role="tablist"/);
  assert.match(calendar, /aria-selected=/);
});
