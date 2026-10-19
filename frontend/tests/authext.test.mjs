// AUTH-EXT-01 — public auth + account security screens (ADR-0021).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const app = await readFile(new URL('../src/app/App.tsx', import.meta.url), 'utf8');
const pages = await readFile(new URL('../src/features/auth/AuthPages.tsx', import.meta.url), 'utf8');
const security = await readFile(new URL('../src/features/auth/SecurityPage.tsx', import.meta.url), 'utf8');
const api = await readFile(new URL('../src/features/auth/api.ts', import.meta.url), 'utf8');
const dock = await readFile(new URL('../src/app/shell/ProfileDock.tsx', import.meta.url), 'utf8');

test('AUTH-EXT-01 public routes exist outside authenticated sidebars', () => {
  for (const route of ['/register', '/forgot-password', '/reset-password', '/verify-email/confirm', '/login/mobile', '/auth/step-up', '/welcome', '/account/security']) {
    assert.match(app, new RegExp(`path="${route.replace(/\//g, '\\/')}"`), route);
  }
  assert.match(pages, /data-auth-public/);
  assert.match(app, /href="\/register">ساخت حساب/);
  assert.match(app, /href="\/login\/mobile">ورود با موبایل/);
  assert.match(app, /ادامه با گوگل/);
});

test('AUTH-EXT-01 screens bind to the backend contract', () => {
  for (const endpoint of ['/auth/email/confirm', '/auth/password/forgot', '/auth/password/reset', '/auth/otp/challenge', '/auth/otp/login', '/auth/step-up', '/account/reauthenticate', '/account/security/password', '/account/security/email', '/account/security/mobile', '/account/sessions', '/account/deletion-request', '/account/welcome']) {
    assert.ok(api.includes(endpoint), endpoint);
  }
  assert.match(pages, /terms_accepted: true, terms_version: '1\.0'/);
  assert.match(pages, /ارسال دوباره کد تا/);
  assert.match(security, /data-account-security/);
  assert.match(security, /حذف حساب پس از ۱۴ روز نهایی می‌شود/);
  assert.match(security, /شناسهٔ تأییدنشده هرگز برای ورود یا بازیابی استفاده نمی‌شود/);
});

test('AUTH-EXT-01 security is discoverable and surfaces stay flat', () => {
  assert.match(dock, /id: 'account-security'/);
  assert.match(dock, /navigate\('\/account\/security'\)/);
  assert.match(pages, /bg-\[#F5F9FA\]/);
  assert.match(pages, /shadow-surface/);
});
