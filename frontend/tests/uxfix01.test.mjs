import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { canUsePermission } from '../src/shared/lib/permissions.ts';

// CORE-UX-FIX-01 regression gates: demo access repair consistency
// (sidebar vs route guards), auth-vs-authz distinction, and the
// canonical single-palette theme alignment.

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8');
const app = read('../src/app/App.tsx');
const sidebar = read('../src/app/shell/Sidebar.tsx');
const auth = read('../src/app/providers/AuthContext.tsx');
const ds = read('../src/styles/index.css');
const previewCss = read('../src/features/showcase/uiShowcaseThemes.css');

const demoOwner = {
  status: 'active',
  roleId: null,
  roleIsActive: undefined,
  permissions: ['projects.view', 'tasks.view', 'settings.manage', 'content.view'],
};

test('permission evaluation: explicit server grants decide, status gates everything', () => {
  assert.equal(canUsePermission(demoOwner, [], 'projects.view'), true);
  assert.equal(canUsePermission(demoOwner, [], 'users.view'), false, 'ungranted administration stays denied');
  assert.equal(canUsePermission({ ...demoOwner, status: 'suspended' }, [], 'projects.view'), false);
  assert.equal(canUsePermission({ ...demoOwner, permissions: [] }, [], 'projects.view'), false, 'empty grant is a denial, not a fallback');
  // Role path: an inactive role grants nothing even with its keys listed.
  const role = { id: 'r1', key: 'demo_manager', isActive: false, permissions: ['projects.view'] };
  assert.equal(canUsePermission({ ...demoOwner, roleId: 'r1', permissions: [] }, [role], 'projects.view'), false);
});

test('sidebar visibility and route guards agree (no offered-but-blocked pages)', () => {
  // Settings: sidebar must offer exactly what the route allows.
  assert.match(sidebar, /const canViewSettings = hasPermission\('settings\.manage'\);/);
  assert.doesNotMatch(sidebar, /canViewSettings = hasPermission\('settings\.manage'\) \|\|/);
  assert.match(app, /case 'settings':\s*\n?\s*return canManageSettings \? <SettingsView \/>/);
  assert.match(app, /const canManageSettings = hasPermission\('settings\.manage'\)/);
  // User/role administration is gated identically in both places.
  assert.match(sidebar, /const canManageUsers = hasPermission\('users\.view'\)/);
  assert.match(sidebar, /const canManageRoles = hasPermission\('roles\.view'\)/);
  // Scoped settings (Core plane) stays reachable without legacy grants;
  // the server authorizes per scope.
  assert.match(sidebar, /nav-item-scoped-settings/);
  assert.match(app, /case 'scoped-settings':/);
});

test('authentication failure stays distinct from authorization failure', () => {
  // 401 while restoring a session clears to a signed-out state with
  // no error copy; permission denials are rendered by pages instead.
  assert.match(auth, /error\.status === 401 \? null/);
  assert.match(app, /شما مجوز مشاهدهٔ این صفحه را ندارید/);
});

test('canonical theme: app root and preview consume the same semantic tokens', () => {
  assert.match(ds, /--color-primary:\s*#39677c/);
  assert.match(ds, /--color-primary-hover:\s*#2b5266/);
  for (const token of ['--color-background', '--color-surface', '--color-surface-muted', '--color-border', '--color-text', '--color-text-muted']) {
    assert.ok(ds.includes(token + ':'), 'app token missing: ' + token);
    assert.ok(previewCss.includes(token + ':'), 'preview mapping missing: ' + token);
  }
  // Shared primitives consume the tokens (no parallel brand literal).
  assert.match(ds, /\.ui-button-primary\s*\{[^}]*var\(--color-primary\)/);
  assert.match(ds, /\.ui-tab\[aria-selected='true'\]\s*\{[^}]*var\(--color-primary\)/);
  // Semantic colors keep their meanings — never re-branded by the preview.
  assert.doesNotMatch(previewCss, /--color-(danger|warning|success):/);
  // Tailwind indigo utilities derive from the same primary token.
  assert.match(ds, /--color-indigo-600:\s*var\(--color-primary\)/);
});

test('portaled overlays inherit the canonical palette via the body marker', () => {
  assert.match(previewCss, /body\[data-tadbir-theme-preview='ocean'\]/);
  const preview = read('../src/features/showcase/UiShowcaseThemeComparison.tsx');
  assert.match(preview, /document\.body\.dataset\.tadbirThemePreview = 'ocean'/);
  assert.match(preview, /delete document\.body\.dataset\.tadbirThemePreview/);
  assert.match(ds, /--color-success:/);
  assert.match(ds, /--color-danger:/);
});
