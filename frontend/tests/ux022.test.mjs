import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// UX-02-2 regression gates:
//  - /dashboard resolves by UX-02-1 environment context to the four
//    redesigned dashboards; the legacy dashboards are no longer
//    rendered by any route or fallback;
//  - management sections come from the permission-gated summary
//    endpoints and render honest unavailable states (null section),
//    never fabricated numbers;
//  - the workspace dashboard keeps UX-02-1 K2 honesty (existing
//    access rules, no claimed workspace data isolation);
//  - only canonical Ocean tokens — no legacy indigo utilities.

const read = relative => readFileSync(new URL(relative, import.meta.url), 'utf8');

test('dashboard route resolves by environment context, legacy dashboards unrouted', () => {
  const app = read('../src/app/App.tsx');
  assert.match(app, /import\('\.\.\/features\/dashboard\/ContextDashboard'\)/);
  assert.equal((app.match(/<ContextDashboard \/>/g) || []).length, 2, 'dashboard case + fallback');
  assert.doesNotMatch(app, /<DashboardView \/>|<ActionDashboard \/>/);
  assert.doesNotMatch(app, /features\/dashboard\/DashboardView|features\/workspace\/ActionDashboard/);

  const context = read('../src/features/dashboard/ContextDashboard.tsx');
  assert.match(context, /current\.kind === 'platform'/);
  assert.match(context, /<PlatformDashboard \/>/);
  assert.match(context, /current\.kind === 'organization' && current\.id !== null/);
  assert.match(context, /<OrganizationDashboard organizationId=\{current\.id\} \/>/);
  assert.match(context, /<WorkspaceDashboard \/>/);
});

test('summary clients hit the permission-gated backend endpoints', () => {
  const api = read('../src/features/dashboard/dashboardApi.ts');
  assert.match(api, /'\/core\/platform\/dashboard-summary'/);
  assert.match(api, /`\/core\/organizations\/\$\{organizationId\}\/dashboard-summary`/);
});

test('platform dashboard: real KPIs, attention, audit, honest OPS-01 deferral', () => {
  const page = read('../src/features/dashboard/PlatformDashboard.tsx');
  assert.match(page, /dashboardApi\.platformSummary\(\)/);
  assert.match(page, /<BackendStatusPanel \/>/);
  // OPS-01 is deferred: explicit not-available copy, no fabricated health.
  assert.match(page, /OPS-01/);
  assert.match(page, /هیچ وضعیت ساختگی‌ای نمایش داده نمی‌شود/);
  // Forbidden sections show permission explanations, not zeros.
  assert.match(page, /مجوز «مشاهدهٔ سازمان‌های پلتفرم» لازم است/);
  assert.match(page, /<UnavailableWidget/);
});

test('organization dashboard: management-only data, real subscription, honest missing state', () => {
  const page = read('../src/features/dashboard/OrganizationDashboard.tsx');
  assert.match(page, /dashboardApi\.organizationSummary\(organizationId\)/);
  // Missing subscription is its own honest state (server 'missing').
  assert.match(page, /subscription\.state === 'missing'/);
  assert.match(page, /هنوز اشتراکی برای این سازمان ثبت نشده است/);
  // Quotas render from the server payload (limit + measured usage).
  assert.match(page, /limit\.limit_value/);
  assert.match(page, /limit\.usage/);
  assert.match(page, /<ActivityList items=\{summary\.recent_activity\} \/>/);
  assert.match(page, /\/invitations\/manage/);
});

test('workspace dashboard: live lists, permission widgets, K2 honesty, demo adapter', () => {
  const page = read('../src/features/dashboard/WorkspaceDashboard.tsx');
  assert.match(page, /useWorkspacePage\('tasks', \{ assignee: 'me', due: 'today'/);
  assert.match(page, /useWorkspacePage\('tasks', \{ assignee: 'me', due: 'overdue'/);
  assert.match(page, /can\('content\.approve'\)/);
  // K2: selection never claims to re-scope workspace data.
  assert.match(page, /انتخاب محیط، دامنهٔ داده‌ها را تغییر نمی‌دهد/);
  // Organization extras appear only when the server returns sections.
  assert.match(page, /summary\.members === null && summary\.invitations === null/);
  assert.match(page, /runtime\.demoMode/);
  // Quick actions link to real routes only.
  for (const target of ['/tasks?assignee=me', '/projects', '/contents', '/notifications', '/select-environment']) {
    assert.ok(page.includes(target), `quick action missing: ${target}`);
  }
});

test('new dashboards use only the canonical Ocean token system', () => {
  for (const file of ['widgets.tsx', 'WorkspaceDashboard.tsx', 'PlatformDashboard.tsx', 'OrganizationDashboard.tsx', 'ContextDashboard.tsx']) {
    const source = read(`../src/features/dashboard/${file}`);
    assert.doesNotMatch(source, /indigo|violet|purple/, `${file} must not use legacy accent palettes`);
    assert.doesNotMatch(source, /#39677c/i, `${file} must consume tokens, not hardcode the primary hex`);
  }
  const widgets = read('../src/features/dashboard/widgets.tsx');
  assert.match(widgets, /var\(--color-primary\)/);
  assert.match(widgets, /هنوز در دسترس نیست/);
});
