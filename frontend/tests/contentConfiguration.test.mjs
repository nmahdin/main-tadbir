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
  assert.match(modal, /targetAudiences: formData\.targetAudiences/);
  assert.doesNotMatch(modal, /تأییدکننده نهایی|formData\.approverId/);
  assert.match(modal, /platformIcon\(platform\.iconName\)/);
  assert.match(settings, /setTargetAudiences/);
  assert.match(list, /target_audience/);
});

test('process template editor keeps checklists itemized and locks the first dependency off', async () => {
  const [modal, creator] = await Promise.all([
    source('../src/components/settings/ProcessTemplateModal.tsx'),
    source('../src/components/content/CreateContentModal.tsx'),
  ]);
  for (const operation of ['addChecklistItem', 'updateChecklistItem', 'removeChecklistItem', 'moveChecklistItem']) {
    assert.match(modal, new RegExp(operation));
  }
  assert.match(modal, /disabled=\{index === 0\}/);
  assert.match(modal, /dependsOnPrevious: index === 0 \? false/);
  assert.match(modal, /خروجی‌های مورد انتظار/);
  assert.match(creator, /checklist: \(stage\.checklist \|\| \[\]\)\.map/);
  assert.match(creator, /reviewerStrategy: stage\.reviewerStrategy/);
  assert.match(creator, /advanceMode: stage\.advanceMode/);
});

test('calendar keeps independent task, project, content and all tabs', async () => {
  const calendar = await source('../src/components/projects/ProjectCalendarView.tsx');
  assert.match(calendar, /type CalendarFilter = 'task' \| 'project' \| 'content' \| 'all'/);
  for (const label of ['تسک‌ها', 'پروژه‌ها', 'محتواها', 'همه']) assert.match(calendar, new RegExp(label));
  assert.match(calendar, /role="tablist"/);
  assert.match(calendar, /aria-selected=/);
});
