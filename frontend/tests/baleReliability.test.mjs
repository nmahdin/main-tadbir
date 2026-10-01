import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { baleDeliveryLabel, baleErrorLabel } from '../src/components/bale/balePresentation.ts';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

test('Bale operational codes are translated into actionable Persian states', () => {
  assert.match(baleErrorLabel('webhook_mismatch'), /هماهنگ نیست/);
  assert.match(baleErrorLabel('transport_unknown'), /تکراری/);
  assert.equal(baleDeliveryLabel('pending'), 'در انتظار ارسال خودکار');
  assert.match(baleDeliveryLabel('unknown'), /نیازمند بررسی/);
});

test('Bale management separates automation and delivery while removing manual processing UX', async () => {
  const [settings, account] = await Promise.all([
    source('../src/components/bale/BaleSettingsPanel.tsx'),
    source('../src/components/bale/BaleAccountPanel.tsx'),
  ]);
  assert.match(settings, /id: 'automations'/);
  assert.match(settings, /id: 'delivery'/);
  assert.match(settings, /retry_runner_recent/);
  assert.doesNotMatch(settings, /پردازش یک نوبت|ارسال صف/);
  assert.doesNotMatch(account, /دریافت هنوز دستی|بررسی وضعیت اتصال/);
  assert.match(account, /setInterval\(\(\) => void checkConnection\(\), 3_000\)/);
});
