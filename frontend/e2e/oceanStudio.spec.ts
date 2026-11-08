import {test,expect} from '@playwright/test';

test('SPEC-ODL-02 direct routes, back/forward and persistent Studio shell',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/theme-previews');
 await expect(page.getByRole('heading',{name:'نمای کلی استودیو'})).toBeVisible();
 const shell=page.getByTestId('ocean-studio-shell');
 await expect(shell).toHaveCount(1);
 await shell.evaluate(el=>{(el as HTMLElement & {__mountProbe?:string}).__mountProbe='same';});
 await page.getByRole('link',{name:'دکمه‌ها'}).click();
 await expect(page).toHaveURL(/\/theme-previews\/components\/buttons$/);
 await expect(page.getByRole('heading',{name:'نوع دکمه‌ها'})).toBeVisible();
 expect(await shell.evaluate(el=>(el as HTMLElement & {__mountProbe?:string}).__mountProbe)).toBe('same');
 await page.reload();
 await expect(page.getByRole('heading',{name:'نوع دکمه‌ها'})).toBeVisible();
 await page.getByRole('link',{name:'کنترل‌های ورودی'}).click();
 await expect(page).toHaveURL(/\/components\/inputs$/);
 await page.goBack();
 await expect(page).toHaveURL(/\/components\/buttons$/);
 await page.goForward();
 await expect(page).toHaveURL(/\/components\/inputs$/);
});
test('SPEC-ODL-02 sidebar collapses, shows active page and expands groups',async({page})=>{
 await page.setViewportSize({width:1440,height:900});await page.goto('/theme-previews/components/forms');
 await expect(page.locator('.ods-menu-link[aria-current="page"]')).toHaveCount(1);
 await expect(page.getByRole('link',{name:'فرم‌های کامل'})).toHaveAttribute('aria-current','page');
 await page.getByRole('button',{name:'جمع کردن سایدبار'}).click();
 await expect(page.getByTestId('ocean-studio-shell')).toHaveAttribute('data-collapsed','true');
 await page.getByRole('button',{name:'باز کردن سایدبار'}).click();
 await page.getByRole('button',{name:/اجزای رابط کاربری/}).click();
 await expect(page.locator('#ods-menu-components')).toBeHidden();
 await page.getByRole('button',{name:/اجزای رابط کاربری/}).click();
 await expect(page.locator('#ods-menu-components')).toBeVisible();
});
test('SPEC-ODL-02 mobile focus trap, Escape dismissal and no page-level overflow',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/theme-previews/foundations/radius');
 await expect(page.getByTestId('ocean-studio-shell')).toBeVisible();
 const open=page.getByRole('button',{name:'بازکردن فهرست استودیو'});
 await open.click();
 await expect(page.getByRole('dialog',{name:'فهرست صفحات استودیو'})).toBeVisible();
 await page.keyboard.press('Tab');
 expect(await page.getByRole('dialog',{name:'فهرست صفحات استودیو'}).evaluate(el=>el.contains(document.activeElement))).toBe(true);
 await page.keyboard.press('Escape');
 await expect(page.getByRole('dialog',{name:'فهرست صفحات استودیو'})).toHaveCount(0);
 await expect(open).toBeFocused();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
test('SPEC-ODL-02 approved and proposed static shadows remain equal on hover',async({page})=>{
 await page.setViewportSize({width:834,height:1112});await page.goto('/theme-previews/foundations/radius');
 const accepted=page.getByTestId('studio-radius-24'),proposed=page.getByTestId('studio-radius-28');
 await expect(accepted).toBeVisible();await expect(proposed).toBeVisible();
 expect(await accepted.evaluate(el=>getComputedStyle(el).borderRadius)).toBe('24px');
 expect(await proposed.evaluate(el=>getComputedStyle(el).borderRadius)).toBe('28px');
 const shadow=await proposed.evaluate(el=>getComputedStyle(el).boxShadow);
 await proposed.hover();
 expect(await proposed.evaluate(el=>getComputedStyle(el).boxShadow)).toBe(shadow);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
test('SPEC-ODL-02 prototypes and mixed-direction examples remain directly reachable',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/theme-previews/prototypes/shell');
 await expect(page.getByRole('heading',{name:'پوستهٔ آزمایشی'})).toBeVisible();
 await expect(page.locator('[data-lab="shell"]')).toBeVisible();
 await page.goto('/theme-previews/prototypes/tour');
 await expect(page.locator('.odl-tour-prototype')).toBeVisible();
 await page.goto('/theme-previews/prototypes/layout');
 await expect(page.locator('.odl-layout-editor')).toBeVisible();
 await page.goto('/theme-previews/components/locale');
 await expect(page.locator('bdi[dir="ltr"]').first()).toBeVisible();
});
test('SPEC-ODL-02 mobile/tablet/desktop layouts and reduced motion',async({page})=>{
 for(const viewport of [{width:1440,height:900},{width:834,height:1112},{width:390,height:844}]){
  await page.setViewportSize(viewport);await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/theme-previews/components/data');
  await expect(page.getByRole('heading',{name:'جدول قابل جست‌وجو و صفحه‌بندی'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 }
});

test('SPEC-ODL-02 filtering reopens collapsed groups while retaining the selected demo',async({page})=>{
 await page.setViewportSize({width:1440,height:900});await page.goto('/theme-previews/components/forms');
 await page.getByRole('button',{name:/اجزای رابط کاربری/}).click();
 await expect(page.locator('#ods-menu-components')).toBeHidden();
 await page.getByRole('searchbox',{name:'جست‌وجو در صفحات استودیو'}).fill('دکمه‌ها');
 await expect(page.getByRole('link',{name:'دکمه‌ها'})).toBeVisible();
 await page.getByRole('link',{name:'دکمه‌ها'}).click();
 await expect(page.getByRole('heading',{name:'دکمه‌ها',exact:true})).toBeFocused();
});
test('SPEC-ODL-02 mobile navigation focuses destination instead of closed drawer opener',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/theme-previews/components/forms');
 const trigger=page.getByRole('button',{name:'بازکردن فهرست استودیو'});
 await trigger.click();
 await page.getByRole('dialog',{name:'فهرست صفحات استودیو'}).getByRole('link',{name:'دکمه‌ها'}).click();
 await expect(page).toHaveURL(/\/theme-previews\/components\/buttons$/);
 await expect(page.getByRole('heading',{name:'دکمه‌ها',exact:true})).toBeFocused();
 await expect(trigger).not.toBeFocused();
});
