import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('ADR-0020 C approved semantic radius and elevation contract', () => {
  const css = read('src/styles/index.css');
  for (const declaration of ['--radius-content-primary: 24px;', '--radius-card-standalone: 20px;', '--radius-panel-nested: var(--radius-lg);', '--radius-control: var(--radius-md);', '--shadow-surface: 0 1px 3px rgb(15 23 42 / 0.035);']) assert.ok(css.includes(declaration), declaration);
  assert.ok(css.includes(".ui-page-surface[data-surface='page'] { box-shadow: none !important; }"));
  assert.ok(css.includes(".ui-primary-content[data-surface='primary-content'][data-elevation='soft'] { box-shadow: var(--shadow-surface); }"));
  assert.ok(css.includes(".ui-standalone-card[data-elevation='standalone'] { border-radius: var(--radius-card-standalone); box-shadow: var(--shadow-surface); }"));
  const surface = read('src/shared/ui/PrimaryContentContainer.tsx');
  assert.ok(surface.includes("elevation = 'none'"));
  assert.ok(surface.includes('data-surface="primary-content"'));
  assert.ok(surface.includes("data-elevation={elevation === 'soft'"));
});

test('ADR-0020 C selective classified routes, flat environments and dashboards', () => {
  for (const path of ['src/features/workspace/WorkspaceList.tsx', 'src/features/projects/ProjectDetailView.tsx', 'src/features/invitations/components/InvitationManagerPage.tsx', 'src/features/settings/components/ScopedSettingsPage.tsx']) assert.ok(read(path).includes('<PrimaryContentContainer elevation="soft"'), path);
  for (const path of ['src/features/dashboard/PlatformDashboard.tsx', 'src/features/dashboard/OrganizationDashboard.tsx', 'src/features/dashboard/WorkspaceDashboard.tsx', 'src/features/environments/SelectEnvironmentPage.tsx']) assert.ok(!read(path).includes('PrimaryContentContainer'), path);
  assert.ok(read('src/features/dashboard/widgets.tsx').includes('data-elevation="standalone"'));
  assert.ok(read('src/features/dashboard/WorkspaceDashboard.tsx').includes('<WidgetCard title="اشتراک شخصی"'));
});
