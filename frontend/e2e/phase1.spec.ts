import { test, expect, type Page } from '@playwright/test';
const user = { id: '1', name: 'کاربر آزمون', email: 'test@example.test', avatar: '', role: 'admin', status: 'active', title: '', department: '', activeProjectsCount: 0, completedTasksCount: 0, workloadPercentage: 0, skills: [], createdAt: '', permissions: ['projects.view', 'projects.create', 'projects.edit', 'tasks.view', 'tasks.create', 'tasks.edit', 'tasks.status', 'content.view', 'assets.view'] };
const project = { id: '123', name: 'پروژهٔ واقعی آزمون', key: 'TEST', description: '', projectManagerId: '1', memberIds: ['1'], startDate: '2026-09-01', deadline: '2026-10-01', status: 'active', progress: 0, priority: 'medium', tags: [], color: '#4f46e5', category: '', createdAt: '' };
async function api(page: Page, options: { signedIn?: boolean; denied?: boolean; projectError?: boolean; delay?: number } = {}) {
  let signedIn = options.signedIn ?? true;
  let tasks: any[] = [];
  let projects: any[] = [];
  await page.route('**/sanctum/csrf-cookie', route => route.fulfill({ status: 204 }));
  await page.route('**/api/v1/**', async route => {
    const req = route.request(); const path = new URL(req.url()).pathname.replace('/api/v1/', '');
    let data: any = [];
    if (path === 'auth/login') { signedIn = true; data = user; }
    else if (path === 'auth/logout') { signedIn = false; return route.fulfill({ json: { message: 'خروج موفق' } }); }
    else if (path === 'auth/me') {
      if (!signedIn) return route.fulfill({ status: 401, json: { message: 'Unauthenticated.' } });
      data = options.denied ? { ...user, role: 'member', permissions: [] } : user;
    }
    else if (path === 'projects/123') data = project;
    else if (path === 'projects' && req.method() === 'POST') { data = { ...project, ...req.postDataJSON(), id: '789' }; projects.push(data); }
    else if (path === 'projects/789') { data = projects[0]; if (req.method() !== 'GET') Object.assign(data, req.postDataJSON()); }
    else if (path === 'projects') {
      if (options.delay) await new Promise(resolve => setTimeout(resolve, options.delay));
      if (options.projectError) return route.fulfill({ status: 500, json: { message: 'SQLSTATE PRIVATE DATABASE DETAIL' } });
      data = projects;
    }
    else if (path === 'settings') data = {};
    else if (path === 'users/directory' || path === 'users') data = [user];
    else if (path === 'tasks' && req.method() === 'POST') {
      data = { ...req.postDataJSON(), id: '456', subtasks: [], attachments: [], comments: [], activityHistory: [], tags: [], description: '' }; tasks.push(data);
    }
    else if (path === 'tasks') data = tasks;
    else if (path.startsWith('tasks/')) {
      data = tasks.find(t => t.id === path.split('/')[1]);
      if (!data) return route.fulfill({ status: 404, json: { message: 'Not Found' } });
      if (path.endsWith('/restore')) {data.status=data.previousStatus || 'todo';data.previousStatus=null;}
      else if (req.method() !== 'GET') {const body=req.postDataJSON();if(body.status==='archived')data.previousStatus=data.status;Object.assign(data,body);}
    }
    return route.fulfill({ json: { data, meta: { current_page: 1, last_page: 1, total: Array.isArray(data) ? data.length : 1 } } });
  });
}
test('production ignores poisoned local storage and protects a direct route', async ({ page }) => {
  await api(page, { signedIn: false });
  await page.addInitScript(() => localStorage.setItem('tadbir-v3-projects', JSON.stringify([{ name: 'دادهٔ جعلی' }])));
  await page.goto('/projects/123');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText('دادهٔ جعلی')).toHaveCount(0);
  await expect(page.locator('input[type="password"]')).toBeVisible();
});
test('direct entity outside first list hydrates, survives refresh and navigation back', async ({ page }) => {
  await api(page);
  await page.goto('/projects/123');
  await expect(page.getByText('پروژهٔ واقعی آزمون').first()).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/\/projects\/123$/);
  await expect(page.getByText('پروژهٔ واقعی آزمون').first()).toBeVisible();
  await page.goto('/tasks?status=todo');
  await page.goBack();
  await expect(page).toHaveURL(/\/projects\/123$/);
});
test('unknown paths and malformed IDs show 404 rather than dashboard', async ({ page }) => {
  await api(page);
  for (const path of ['/not-a-page', '/projects/not-an-id']) {
    await page.goto(path);
    await expect(page.getByText('۴۰۴ — صفحهٔ مورد نظر پیدا نشد.')).toBeVisible();
  }
});
test('permission denied is not replaced by dashboard', async ({ page }) => {
  await api(page, { denied: true }); await page.goto('/projects');
  await expect(page.getByText('شما مجوز مشاهدهٔ این صفحه را ندارید.')).toBeVisible();
});
test('API failure stays an error and never reveals raw SQL or demo records', async ({ page }) => {
  await api(page, { projectError: true }); await page.goto('/projects');
  await expect(page.getByText('SQLSTATE PRIVATE DATABASE DETAIL')).toHaveCount(0);
  await expect(page.getByRole('alert').filter({hasText:'عملیات انجام نشد'}).first()).toBeVisible();
  await expect(page.getByText('پروژهٔ واقعی آزمون')).toHaveCount(0);
});
test('task modal traps focus, closes with Escape and restores scroll at mobile width', async ({ page }) => {
  await api(page); await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/tasks');
  await page.getByRole('button', { name: /وظیفه جدید|تسک جدید/ }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
  await page.keyboard.press('Tab');
  expect(await page.getByRole('dialog').evaluate(el => el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('initial loading is explicit and an empty successful response stays empty', async ({ page }) => {
  await api(page, { delay: 1200 }); await page.goto('/projects');
  await expect(page.getByRole('status').filter({ hasText: 'در حال بارگذاری' }).first()).toBeVisible();
  await expect(page.getByText(/موردی مطابق فیلترها یافت نشد./).first()).toBeVisible();
});

test('login returns to the requested route, logout clears the protected workspace', async ({ page }) => {
  await api(page, { signedIn: false }); await page.goto('/projects/123');
  await page.getByPlaceholder('username@example.com').fill('test');
  await page.getByPlaceholder('رمز عبور ورود به سامانه...').fill('password123');
  await page.getByRole('button', { name: 'ورود به سامانه تدبیر' }).click();
  await expect(page).toHaveURL(/\/projects\/123$/);
  await expect(page.getByText('پروژهٔ واقعی آزمون').first()).toBeVisible();
  await page.getByRole('button', { name: 'کآ کاربر آزمون' }).click();
  await page.getByRole('button', { name: 'خروج از حساب' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText('پروژهٔ واقعی آزمون')).toHaveCount(0);
});
test('creating a task shows success, persists through refresh and opens its URL', async ({ page }) => {
  await api(page); await page.goto('/tasks');
  await page.getByRole('button', { name: /وظیفه جدید|تسک جدید/ }).first().click();
  await page.getByPlaceholder('مثلاً: طراحی و پیاده‌سازی فرم ورود').fill('وظیفهٔ آزمون سرور');
  await page.getByRole('dialog').getByRole('button', { name: 'ایجاد وظیفه جدید' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('وظیفهٔ آزمون سرور').first()).toBeVisible();
  await page.reload(); await expect(page.getByText('وظیفهٔ آزمون سرور').first()).toBeVisible();
  await page.goto('/tasks/456');
  await expect(page.getByRole('dialog')).toBeVisible();
  const title = page.getByRole('dialog').locator('input').first();
  await title.fill('وظیفهٔ ویرایش‌شده');
  await expect(title).toHaveValue('وظیفهٔ ویرایش‌شده');
  await title.press('Tab');
  await expect(page.getByRole('button', {name:'بایگانی وظیفه',exact:true})).toBeEnabled();
  page.on('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'بایگانی وظیفه', exact: true }).click();
  await expect(page.getByRole('button', { name: 'بازیابی از بایگانی', exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'بازیابی از بایگانی', exact: true }).click();
  await expect(page.getByRole('button', { name: 'بایگانی وظیفه', exact: true })).toBeVisible();
});

test('project create/edit uses server ID, successful toast and persistent API values', async ({ page }) => {
  await api(page); await page.goto('/projects');
  await page.getByRole('button', { name: 'ایجاد پروژه جدید', exact: true }).click();
  await page.getByPlaceholder('مثال: تولید مستند تحلیلی ویژه نوروز').fill('پروژهٔ ایجادشده در آزمون');
  await page.getByPlaceholder('DOC', { exact: true }).fill('E2E');
  await page.getByRole('dialog').getByRole('button', { name: 'ایجاد پروژه جدید', exact: true }).click();
  await expect(page).toHaveURL(/\/projects\/789$/);
  await expect(page.getByText('پروژه با موفقیت ایجاد شد.', { exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByText('پروژهٔ ایجادشده در آزمون').first()).toBeVisible();
  await page.getByRole('button', { name: /ویرایش/ }).first().click();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await page.getByPlaceholder('مثال: تولید مستند تحلیلی ویژه نوروز').fill('پروژهٔ ویرایش‌شده در آزمون');
  await page.getByRole('button', { name: 'ذخیره تغییرات پروژه' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('پروژهٔ ویرایش‌شده در آزمون').first()).toBeVisible();
  await page.reload(); await expect(page.getByText('پروژهٔ ویرایش‌شده در آزمون').first()).toBeVisible();
});

test('legacy task links keep asset hints and close without reopening', async ({ page }) => {
  await api(page); await page.goto('/tasks');
  await page.getByRole('button', { name: /وظیفه جدید|تسک جدید/ }).first().click();
  await page.getByPlaceholder('مثلاً: طراحی و پیاده‌سازی فرم ورود').fill('لینک قدیمی');
  await page.getByRole('dialog').getByRole('button', { name: 'ایجاد وظیفه جدید' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goto('/?task=456&asset=file');
  await expect(page).toHaveURL(/\/tasks\/456\?task=456&asset=file$/);
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/tasks$/);
});
test('a late failed mutation from an old login cannot expire the new session',async({page})=>{
  await api(page);
  let release!:()=>void, started!:()=>void;
  const blocked=new Promise<void>(resolve=>release=resolve), pending=new Promise<void>(resolve=>started=resolve);
  const task={id:'41',title:'عنوان نشست تازه',status:'todo',assigneeId:'1',priority:'medium',subtasks:[],attachments:[],comments:[],activityHistory:[],tags:[]};
  await page.route('**/api/v1/tasks/41',async route=>{
    if(route.request().method()==='PUT'){started();await blocked;return route.fulfill({status:401,json:{message:'Old session expired'}});}
    return route.fulfill({json:{data:task}});
  });
  await page.goto('/tasks/41?display=page');
  await page.getByLabel('عنوان وظیفه',{exact:true}).fill('درخواست نشست قبلی');
  await page.getByLabel('عنوان وظیفه',{exact:true}).press('Tab');await pending;
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('tadbir:session-expired')));
  await expect(page).toHaveURL(/\/login$/);
  await page.getByPlaceholder('username@example.com').fill('test');
  await page.getByPlaceholder('رمز عبور ورود به سامانه...').fill('password123');
  await page.getByRole('button',{name:'ورود به سامانه تدبیر'}).click();
  await expect(page).toHaveURL(/\/tasks\/41/);
  const response=page.waitForResponse(r=>r.url().endsWith('/tasks/41')&&r.request().method()==='PUT');release();
  await (await response).finished();await page.waitForLoadState('networkidle');
  await expect(page).toHaveURL(/\/tasks\/41/);
  await expect(page.getByLabel('عنوان وظیفه',{exact:true})).toHaveValue('عنوان نشست تازه');
});
test('role permission failure never changes grants and successful retry persists',async({page})=>{
  await api(page);let fail=true;
  const grants=['roles.view','roles.edit','roles.manage_permissions','projects.view'];
  const actorRole={id:'1',key:'manager',name:'مدیر آزمون',isActive:true,isSystem:false,permissions:grants,userCount:1};
  let role={id:'2',key:'custom_role',name:'نقش آزمایشی',isActive:true,isSystem:false,permissions:[] as string[],userCount:0};
  await page.route('**/api/v1/auth/me',r=>r.fulfill({json:{data:{...user,role:'manager',roleId:'1',roleIsActive:true,permissions:grants}}}));
  await page.route('**/api/v1/roles',r=>r.fulfill({json:{data:[actorRole,role]}}));
  await page.route('**/api/v1/roles/2',r=>{
    if(fail)return r.fulfill({status:500,json:{message:'Unavailable'}});
    const body=r.request().postDataJSON();expect(Object.keys(body)).toEqual(['permissions']);
    role={...role,...body};return r.fulfill({json:{data:role}});
  });
  await page.goto('/roles');
  const toggle=page.getByRole('checkbox',{name:'نقش آزمایشی: مشاهده پروژه‌ها',exact:true});
  await expect(toggle).not.toBeChecked();await toggle.click();
  await expect(page.getByText('تغییر ذخیره نشد',{exact:true})).toBeVisible();await expect(toggle).not.toBeChecked();
  fail=false;await toggle.click();await expect(toggle).toBeChecked();
  await page.reload();await expect(toggle).toBeChecked();
});
