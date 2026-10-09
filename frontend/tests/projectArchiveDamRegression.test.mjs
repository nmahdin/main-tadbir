import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

test('project creation and editing share one stable modal with a fixed action footer', async () => {
  const [app, modal, primitives] = await Promise.all([
    source('../src/App.tsx'),
    source('../src/components/projects/CreateProjectModal.tsx'),
    source('../src/components/common/Primitives.tsx'),
  ]);

  assert.match(app, /\(isCreateProjectOpen \|\| isEditProjectOpen\) && <CreateProjectModal \/>/);
  assert.match(modal, /<Modal open=\{isOpen\}[^>]+size="xl" panelScroll=\{false\}/);
  assert.match(modal, /flex h-\[calc\(94dvh-66px\)\] max-h-\[760px\] min-h-0 flex-col overflow-hidden/);
  assert.match(modal, /flex-1 space-y-4\.5 overflow-y-auto/);
  assert.match(modal, /shrink-0 border-t border-slate-200/);
  assert.match(modal, /if \(isEditing && projectToEdit\)/);
  assert.match(modal, /editProject\.mutateAsync/);
  assert.match(primitives, /panelScroll \? 'overflow-auto' : 'overflow-hidden'/);
});

test('project list hides advanced filters and no longer ships a preview action or modal', async () => {
  const [workspace, app] = await Promise.all([
    source('../src/components/workspace/WorkspaceList.tsx'),
    source('../src/App.tsx'),
  ]);

  assert.match(workspace, /aria-expanded=\{filtersOpen\}/);
  assert.match(workspace, /فیلترها/);
  assert.match(workspace, /\{filtersOpen && <div/);
  assert.match(workspace, /module === 'projects' && <label/);
  assert.doesNotMatch(workspace, /next\.set\('preview'/);
  assert.doesNotMatch(app, /EntityPreview|DetailContext/);
});

test('project chat navigation is permission-aware and back controls remain icon-only by page titles', async () => {
  const [detail, series] = await Promise.all([
    source('../src/components/projects/ProjectDetailView.tsx'),
    source('../src/components/content/ContentSeriesView.tsx'),
  ]);

  assert.match(detail, /hasPermission\('messaging\.view'\)/);
  assert.match(detail, /openProjectChannel\(project\.id\)/);
  assert.match(detail, /label="بازگشت به پروژه‌ها"/);
  assert.doesNotMatch(detail, />\s*بازگشت به (?:فهرست|پروژه‌ها)\s*</);
  assert.match(series, /label="بازگشت به مجموعه‌ها"/);
  assert.doesNotMatch(series, />\s*بازگشت به مجموعه‌ها\s*</);
});

test('meeting invitees use an optional profile job title and attachments emit real idea and meeting relations', async () => {
  const [meeting, idea, composer, damApi] = await Promise.all([
    source('../src/components/thought-room/CreateMeetingModal.tsx'),
    source('../src/components/thought-room/CreateIdeaModal.tsx'),
    source('../src/components/common/AttachmentComposer.tsx'),
    source('../src/api/dam.ts'),
  ]);

  assert.match(meeting, /u\.title\?\.trim\(\)/);
  assert.match(meeting, /\{u\.title\.trim\(\)\}/);
  assert.doesNotMatch(meeting, /getRoleTitle/);
  assert.match(meeting, /persistAttachmentDraft\(attachmentDraft, \{ meetingId: created\.id \}/);
  assert.match(composer, /meeting_id/);
  assert.match(composer, /\['idea', relations\.ideaId\]/);
  assert.match(composer, /\['meeting', relations\.meetingId\]/);
  assert.match(idea, /persistedAssetIds/);
  assert.match(idea, /related_type: 'idea'/);
  assert.match(damApi, /meeting_id/);
});

test('archive exposes permission-aware idea management and irreversible deletion endpoints', async () => {
  const [archive, context, projectsApi] = await Promise.all([
    source('../src/components/archive/ArchiveView.tsx'),
    source('../src/context/AppContext.tsx'),
    source('../src/api/projects.ts'),
  ]);

  assert.match(archive, /id: 'ideas'.*permission: 'thinktank\.view'/);
  assert.match(archive, /hasPermission\('thinktank\.delete_idea'\)/);
  assert.match(archive, /hasPermission\('projects\.delete'\)/);
  assert.match(archive, /hasPermission\('assets\.delete'\)/);
  assert.match(archive, /این عملیات قابل بازگشت نیست/);
  assert.match(archive, /dam\/library\/\$\{asset\.id\}\/force/);
  assert.match(context, /const forceDeleteProject = async/);
  assert.match(projectsApi, /forceRemove\(id: string\)/);
  assert.match(projectsApi, /`\/projects\/\$\{id\}\/force`/);
});

test('sidebar keeps the requested RTL identity and grouped operational navigation', async () => {
  const sidebar = await source('../src/components/layout/Sidebar.tsx');
  for (const title of ['کار روزانه', 'برنامه‌ریزی و اجرا', 'سازمان و پایش', 'مدیریت سامانه']) {
    assert.match(sidebar, new RegExp(title));
  }
  assert.match(sidebar, /مدیریت یکپارچه کار و دانش سازمان/);
  assert.match(sidebar, /contentSubmenuItems/);
  assert.match(sidebar, /aria-label="نمایش زیرمنوی محتوا"/);
  assert.match(sidebar, /aria-expanded=\{isContentMenuOpen\}/);
});
