import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { ApiConnectionError, ApiError } from '../src/api/errors.ts';
import {
  backendState,
  backendStateLabel,
  describeBackendHealth,
  formatServerTime,
  relativeCheckLabel,
} from '../src/components/dashboard/backendStatus.ts';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

test('healthy health payloads map to a healthy state', () => {
  const payload = { ok: true, service: 'tadbir-api', version: 'v1', time: '2026-10-01T12:00:00+00:00' };
  assert.equal(backendState(payload, undefined), 'ok');

  const { api, db } = describeBackendHealth({ api: { payload }, db: { payload } });
  assert.equal(api.state, 'ok');
  assert.equal(db.state, 'ok');
  assert.match(api.detail, /tadbir-api/);
  assert.match(api.detail, /v1/);
  assert.match(db.detail, /برقرار است/);
});

test('database failures and unreachable backends are distinguished', () => {
  const apiOk = { ok: true, service: 'tadbir-api', version: 'v1' };
  const dbDown = new ApiError('Unavailable', 503);

  const degraded = describeBackendHealth({ api: { payload: apiOk }, db: { error: dbDown } });
  assert.equal(degraded.api.state, 'ok');
  assert.equal(degraded.db.state, 'down');
  assert.equal(degraded.db.label, 'قطع');

  const offline = describeBackendHealth({ api: { error: new ApiConnectionError('offline') }, db: { error: dbDown } });
  assert.equal(offline.api.state, 'unreachable');
  assert.equal(offline.api.label, 'در دسترس نیست');
  // با قطع ارتباط، هیچ داده‌ای دربارهٔ دیتابیس وجود ندارد؛ پس «قطع» گزارش نمی‌شود.
  assert.equal(offline.db.state, 'unreachable');
  assert.equal(offline.db.label, 'بررسی نشد');
});

test('unexpected payloads are flagged as invalid instead of healthy', () => {
  assert.equal(backendState({ data: [] }, undefined), 'invalid');
  assert.equal(backendState(undefined, undefined), 'invalid');
  assert.equal(backendState({ ok: false }, undefined), 'down');
  assert.equal(backendState(undefined, new ApiConnectionError('invalid json', 502)), 'invalid');
  assert.equal(backendState(undefined, new ApiError('changed', 409)), 'unknown');
  assert.equal(backendStateLabel('invalid', 'api'), 'پاسخ نامعتبر');
});

test('server time and check age are formatted in Persian', () => {
  const formatted = formatServerTime('2026-10-01T08:30:00+00:00');
  assert.match(formatted, /[۰-۹]/);
  assert.equal(formatServerTime('not-a-date'), 'نامشخص');
  assert.equal(formatServerTime(undefined), 'نامشخص');

  const now = Date.parse('2026-10-01T08:30:00+00:00');
  assert.equal(relativeCheckLabel(now - 3_000, now), 'همین حالا');
  assert.match(relativeCheckLabel(now - 45_000, now), /۴۵ ثانیه پیش/);
  assert.match(relativeCheckLabel(now - 5 * 60_000, now), /۵ دقیقه پیش/);
  assert.match(relativeCheckLabel(now - 3 * 60 * 60_000, now), /۳ ساعت پیش/);
  assert.equal(relativeCheckLabel(0, now), 'هنوز بررسی نشده');
});

test('dashboard backend panel is wired to the health endpoints without polling', async () => {
  const [dashboard, panel, api, index] = await Promise.all([
    source('../src/components/dashboard/DashboardView.tsx'),
    source('../src/components/dashboard/BackendStatusPanel.tsx'),
    source('../src/api/health.ts'),
    source('../src/api/index.ts'),
  ]);

  assert.match(dashboard, /<BackendStatusPanel \/>/);
  assert.match(panel, /healthApi\.api\(\)/);
  assert.match(panel, /healthApi\.db\(\)/);
  assert.match(panel, /enabled: !runtime\.demoMode/);
  assert.match(panel, /بررسی مجدد/);
  // بررسی خودکار دوره‌ای روی هاست اشتراکی بار اضافه می‌کند و عمداً وجود ندارد.
  assert.doesNotMatch(panel, /refetchInterval/);
  assert.match(api, /request<HealthPayload>\('\/health', \{ cache: 'no-store' \}\)/);
  assert.match(api, /request<HealthPayload>\('\/health\/db', \{ cache: 'no-store' \}\)/);
  assert.match(index, /export \* from '\.\/health';/);
});
