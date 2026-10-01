import { test, expect } from '@playwright/test';
test('explicit demo is labelled, populated and makes no API calls', async ({ page }) => {
  const calls: string[] = [];
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/v1/')) calls.push(request.url()); });
  await page.goto('/projects');
  await expect(page.getByText('محیط نمایشی — داده‌های نمونه، بدون ذخیره در سرور')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'مدیریت و سبد پروژه‌ها' }).last()).toBeVisible();
  await expect(page.getByText('پروژه‌ای مطابق با فیلترها یافت نشد')).toHaveCount(0);
  expect(calls).toEqual([]);
});
