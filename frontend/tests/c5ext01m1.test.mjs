// C5-EXT-01 M1 — Free-plan foundation UI (ADR-0022).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workspaceDashboard = await readFile(new URL('../src/features/dashboard/WorkspaceDashboard.tsx', import.meta.url), 'utf8');
const organizationDashboard = await readFile(new URL('../src/features/dashboard/OrganizationDashboard.tsx', import.meta.url), 'utf8');
const api = await readFile(new URL('../src/features/dashboard/dashboardApi.ts', import.meta.url), 'utf8');
const widgets = await readFile(new URL('../src/features/dashboard/widgets.tsx', import.meta.url), 'utf8');

test('M1 personal subscription card renders real states without fake checkout', () => {
  assert.match(api, /\/core\/personal\/dashboard-summary/);
  assert.match(api, /pending_free_activation: boolean/);
  assert.match(workspaceDashboard, /function PersonalSubscriptionCard/);
  assert.match(workspaceDashboard, /organizationId === null && <PersonalSubscriptionCard \/>/);
  assert.match(workspaceDashboard, /در انتظار انتشار بسته توسط مدیر سامانه است؛ پس از انتشار، به‌صورت خودکار فعال می‌شود/);
  assert.match(workspaceDashboard, /سقف این مورد تکمیل شده است؛ داده‌های فعلی شما دست‌نخورده باقی می‌مانند/);
  assert.doesNotMatch(workspaceDashboard, /پرداخت|\/billing|payment/i);
});

test('M1 organization dashboard distinguishes pending free activation from legacy unassigned', () => {
  assert.match(organizationDashboard, /pending_free_activation \? 'اشتراک رایگان این سازمان در انتظار انتشار بسته/);
  assert.match(widgets, /projects: 'پروژه‌های فعال'/);
});
