import { test, expect, type Page } from '@playwright/test';
const user = {id:'1',name:'کاربر آزمون',username:'test.account',role:'member',status:'active',permissions:['projects.view','tasks.view','content.view','content.approve'],skills:[],avatar:''};
const project = (id: number) => ({id:String(id),name:`پروژه ${id}`,key:`P${id}`,status:id % 2 ? 'active':'planning',priority:'medium',deadline:'2026-10-10',description:'شرح ثبت‌شده',memberIds:[],tags:[],progress:0,createdAt:'2026-09-29T00:00:00Z'});
const task = {id:'41',title:'کار امروز سرور',status:'todo',priority:'medium',assigneeId:'1',deadline:'2026-09-29',description:'شرح کار',subtasks:[],tags:[],comments:[],attachments:[],activityHistory:[]};
async function api(page: Page, options: {widgetFailure?:boolean; denied?:boolean; readFailure?:boolean; reviewFailure?:boolean; missingTarget?:boolean; empty?:boolean} = {}) {
  const calls: string[] = []; let failRead = !!options.readFailure; let failReview = !!options.reviewFailure;
  let notices = [{id:'91',title:'اعلان واقعی',message:'نیاز به اقدام روی تسک',type:'assignment',read:false,timestamp:'2026-09-29T10:00:00Z',linkTaskId: options.missingTarget ? '999' : '41'}];
  let approvals = [{id:'81',title:'پروندهٔ بررسی',stageTitle:'کنترل کیفیت',contentId:'51',stageId:'review',status:'pending_approval',createdAt:'2026-09-29T10:00:00Z',expectedVersion:'a'.repeat(64)}];
  await page.route('**/sanctum/csrf-cookie', route => route.fulfill({status:204}));
  await page.route('**/api/v1/**', async route => {
    const req = route.request(); const url = new URL(req.url()); const path = url.pathname.replace('/api/v1/',''); const q = url.searchParams;
    calls.push(`${req.method()} ${path}${url.search}`);
    let data: any = []; let meta: any = {current_page:1,last_page:1,total:0,per_page:20};
    if (path === 'auth/me') data = options.denied ? {...user,permissions:[]} : user;
    else if (path === 'settings') data = {};
    else if (path === 'users/directory') data = [user];
    else if (path === 'projects') {
      let rows = Array.from({length:45}, (_,i) => project(i+1)); if(q.has('status')) rows = rows.filter(row => row.status === q.get('status'));
      if(q.has('search')) rows = rows.filter(row => row.name.includes(q.get('search')!));
      const n = Number(q.get('page') || 1), per = Number(q.get('per_page') || 20);
      meta = {current_page:n,last_page:Math.max(1,Math.ceil(rows.length/per)),total:rows.length,per_page:per}; data = rows.slice((n-1)*per,n*per);
    } else if (/^projects\/\d+$/.test(path)) data = project(Number(path.split('/')[1]));
    else if (path === 'tasks') {
      if(options.widgetFailure && q.get('due') === 'today') return route.fulfill({status:500,json:{message:'SQLSTATE hidden'}});
      data = q.get('due') === 'overdue' ? [{...task,id:'42',title:'کار عقب‌افتادهٔ سرور'}] : [task]; meta.total = 1;
    } else if (path === 'tasks/41') data = task;
    else if (path === 'tasks/999') return route.fulfill({status:404,json:{message:'Not found'}});
    else if (path === 'contents') data = [{id:'51',title:'محتوای جاری من',status:'in_progress',deadline:'2026-10-01'}];
    else if (path === 'notifications') {
      meta.unread_count = notices.filter(n => !n.read).length; meta.types = ['assignment'];
      data = q.get('read') === 'unread' ? notices.filter(n => !n.read) : q.get('read') === 'read' ? notices.filter(n => n.read) : notices;
      meta.total = data.length;
    } else if (path === 'notifications/91' || path === 'notifications/read-all') {
      if(failRead) return route.fulfill({status:500,json:{message:'database secret'}});
      notices = notices.map(n => ({...n,read:true})); data = notices[0];
    } else if (path === 'approvals') {data = approvals; meta.total = approvals.length;}
    else if (path === 'contents/51/stages/review/decision') {
      if(failReview) return route.fulfill({status:422,json:{message:'Validation',errors:{note:['توضیح را بررسی کنید.']}}});
      approvals = []; data = {id:'51'};
    }
    if (options.empty && ['projects','tasks','contents','approvals','notifications'].includes(path) && req.method() === 'GET') { data=[]; meta={...meta,total:0,last_page:1,unread_count:0}; }
    return route.fulfill({json:{data,meta}});
  });
  return {calls, allowRead:()=>{failRead=false;}, allowReview:()=>{failReview=false;}};
}
test('dashboard isolates widget errors and links real actions', async ({page}) => {
  const {calls} = await api(page,{widgetFailure:true}); await page.goto('/dashboard');
  await expect(page.getByRole('region',{name:'کارهای امروز من'}).getByRole('alert')).toBeVisible();
  await expect(page.getByRole('link',{name:'کار عقب‌افتادهٔ سرور'})).toHaveAttribute('href','/tasks/42');
  await expect(page.getByRole('link',{name:'محتوای جاری من'})).toHaveAttribute('href','/contents/51');
  await expect(page.getByText('SQLSTATE hidden')).toHaveCount(0);
  expect(calls.filter(c=>c.startsWith('GET tasks?')).every(c=>c.includes('assignee=me') && c.includes('per_page=5'))).toBe(true);
  await page.reload(); await expect(page.getByRole('heading',{name:'کارهای امروز من'})).toBeVisible();
});
test('denied modules are not fetched or hidden after receiving private data', async ({page}) => {
  const {calls} = await api(page,{denied:true}); await page.goto('/dashboard');
  await expect(page.getByRole('heading',{name:'اعلان‌های نخوانده'})).toBeVisible();
  expect(calls.some(c=>/^GET (tasks|contents|projects|approvals)(\?|$)/.test(c))).toBe(false);
  await page.goto('/approvals'); await expect(page.getByText('شما مجوز بررسی محتوا را ندارید.')).toBeVisible();
  expect(calls.some(c=>c.startsWith('GET approvals'))).toBe(false);
});
test('filters, paging, reload, back and forward use the server URL contract', async ({page}) => {
  const {calls} = await api(page); await page.goto('/projects?status=active&page=2');
  await expect(page.getByRole('link',{name:'پروژه 41',exact:true})).toBeVisible();
  expect(calls.some(c=>c.includes('projects?') && c.includes('per_page=20') && c.includes('page=2'))).toBe(true);
  expect(calls.some(c=>c.includes('projects?per_page=100'))).toBe(false);
  await page.reload(); await expect(page.getByLabel('فیلتر وضعیت',{exact:true})).toHaveValue('active');
  await page.getByLabel('فیلتر وضعیت',{exact:true}).selectOption('planning'); await expect(page).not.toHaveURL(/page=2/);
  await expect(page.getByRole('link',{name:'پروژه 2',exact:true})).toBeVisible();
  await page.goBack(); await expect(page.getByLabel('فیلتر وضعیت',{exact:true})).toHaveValue('active');
  await expect(page.getByRole('link',{name:'پروژه 41',exact:true})).toBeVisible();
  await page.goForward(); await expect(page.getByLabel('فیلتر وضعیت',{exact:true})).toHaveValue('planning');
  await page.getByRole('button',{name:'صفحه بعد'}).click(); await expect(page).toHaveURL(/page=2/);
});
test('invalid query becomes safe defaults and views switch both ways', async ({page}) => {
  const {calls} = await api(page); await page.goto('/projects?page=-2&status=bad&sort=password&view=bad');
  await expect(page.getByRole('link',{name:'پروژه 1',exact:true})).toBeVisible();
  expect(calls.some(c=>c.includes('password') || c.includes('page=-2'))).toBe(false);
  await page.getByLabel('نما',{exact:true}).selectOption('cards'); await expect(page.locator('main article')).toHaveCount(20);
  await page.getByLabel('نما',{exact:true}).selectOption('list'); await expect(page.locator('main table')).toHaveCount(1);
});
test('preview survives reload, closes with context and opens full detail with return URL', async ({page}) => {
  await api(page); await page.setViewportSize({width:390,height:844}); await page.goto('/projects?status=active&page=2');
  await page.getByRole('button',{name:'پیش‌نمایش'}).first().click(); await expect(page).toHaveURL(/preview=41/);
  await page.reload(); await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL('/projects?status=active&page=2');
  await page.getByRole('button',{name:'پیش‌نمایش'}).first().click();
  await page.getByRole('link',{name:'بازکردن صفحهٔ کامل'}).click(); await expect(page).toHaveURL(/\/projects\/41\?/);
  await page.reload(); await page.getByRole('link',{name:'بازگشت به فهرست',exact:true}).click();
  await expect(page).toHaveURL('/projects?status=active&page=2');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('task full page and list context are independently deep-linkable', async ({page}) => {
  await api(page); await page.goto('/tasks?assignee=me&due=today');
  await page.getByRole('link',{name:task.title,exact:true}).click();
  await expect(page).toHaveURL(/display=page/); await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload(); await expect(page.locator('input[value="کار امروز سرور"]')).toBeVisible();
  await page.getByRole('link',{name:'بازگشت به فهرست',exact:true}).click(); await expect(page).toHaveURL('/tasks?assignee=me&due=today');
});
test('notification read failure preserves unread state; success persists and links outside list', async ({page}) => {
  const control = await api(page,{readFailure:true}); await page.goto('/notifications');
  await page.getByRole('button',{name:'علامت خوانده‌شده',exact:true}).click(); await expect(page.locator('main').getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button',{name:'علامت خوانده‌شده',exact:true})).toBeVisible();
  await page.reload(); await expect(page.getByRole('button',{name:'علامت خوانده‌شده',exact:true})).toBeVisible();
  control.allowRead(); await page.getByRole('button',{name:'علامت خوانده‌شده',exact:true}).click();
  await expect(page.getByRole('button',{name:'علامت خوانده‌شده',exact:true})).toHaveCount(0);
  await page.reload(); await expect(page.locator('main').getByRole('listitem').getByText('خوانده‌شده',{exact:true})).toBeVisible();
  await page.getByRole('link',{name:'بازکردن مورد مرتبط'}).click(); await expect(page).toHaveURL(/\/tasks\/41(?:\?|$)/); await expect(page.getByRole('dialog')).toBeVisible();
});
test('deleted notification target is a controlled 404', async ({page}) => {
  await api(page,{missingTarget:true}); await page.goto('/notifications'); await page.getByRole('link',{name:'بازکردن مورد مرتبط'}).click();
  await expect(page.getByText('رکورد یا صفحهٔ مورد نظر پیدا نشد.')).toBeVisible();
});
test('approval validation preserves notes then success refreshes the queue', async ({page}) => {
  const control = await api(page,{reviewFailure:true}); await page.goto('/approvals?item=81');
  await page.getByRole('button',{name:'عودت برای اصلاح',exact:true}).click();
  await page.getByLabel('علت عودت (الزامی)').fill('لطفاً توضیح را کامل کنید');
  await page.getByRole('button',{name:'ثبت تصمیم'}).click(); await expect(page.getByText('توضیح را بررسی کنید.')).toBeVisible();
  await expect(page.getByLabel('علت عودت (الزامی)')).toHaveValue('لطفاً توضیح را کامل کنید');
  control.allowReview(); await page.getByRole('button',{name:'ثبت تصمیم'}).click(); await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('بررسی‌ای در انتظار شما نیست.')).toBeVisible(); await page.reload(); await expect(page.getByText('بررسی‌ای در انتظار شما نیست.')).toBeVisible();
});

test('content filter uses real API status and Persian labels', async ({page}) => {
  const {calls} = await api(page); await page.goto('/contents?status=reviewing');
  await expect(page.getByLabel('فیلتر وضعیت',{exact:true})).toHaveValue('reviewing');
  await expect(page.getByLabel('فیلتر وضعیت',{exact:true}).locator('option:checked')).toHaveText('در انتظار بازبینی');
  expect(calls.some(c=>c.startsWith('GET contents?') && c.includes('status=reviewing') && c.includes('per_page=20'))).toBe(true);
});
test('mark all persists count and approval accept uses one official command at mobile width', async ({page}) => {
  const {calls} = await api(page); await page.setViewportSize({width:390,height:844}); await page.goto('/notifications?read=unread');
  await page.getByRole('button',{name:'خواندن همه',exact:true}).click(); await expect(page.getByText('اعلانی در این فهرست نیست.')).toBeVisible();
  await page.reload(); await expect(page.getByRole('button',{name:'خواندن همه',exact:true})).toBeDisabled();
  await page.goto('/approvals'); await page.getByRole('button',{name:'تأیید',exact:true}).click();
  await page.getByRole('button',{name:'ثبت تصمیم'}).click(); await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('بررسی‌ای در انتظار شما نیست.')).toBeVisible();
  expect(calls.filter(c=>c.startsWith('POST contents/51/stages/review/decision'))).toHaveLength(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('notification bell is keyboard actionable and marks read before navigating', async ({page}) => {
  const {calls} = await api(page); await page.goto('/notifications');
  await page.locator('#top-notifications-bell').click();
  await page.getByRole('button',{name:/اعلان واقعی نیاز به اقدام/}).focus(); await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/tasks\/41(?:\?|$)/);
  expect(calls.some(c=>c === 'PUT notifications/91')).toBe(true);
});

test('dashboard empty states do not invent demo records', async ({page}) => {
  await api(page,{empty:true}); await page.goto('/dashboard');
  await expect(page.getByText('در این بخش کاری در انتظار شما نیست.')).toHaveCount(6);
  await expect(page.getByRole('link',{name:'کار امروز سرور'})).toHaveCount(0);
});
test('out of range list page is corrected to the last server page', async ({page}) => {
  await api(page); await page.goto('/projects?page=999'); await expect(page).toHaveURL('/projects?page=3');
  await expect(page.getByRole('link',{name:'پروژه 41',exact:true})).toBeVisible();
});
for (const width of [390, 768]) {
  test(`task detail actions remain reachable at ${width}px`, async ({page}) => {
    await api(page); await page.setViewportSize({width,height:844});
    await page.goto('/tasks/41?display=page&returnTo=%2Ftasks%3Fassignee%3Dme');
    const close = page.getByRole('button',{name:'بستن جزئیات',exact:true});
    await expect(close).toBeVisible();
    for (const label of ['بستن جزئیات','حذف وظیفه','بایگانی وظیفه']) {
      const box = await page.getByRole('button',{name:label,exact:true}).boundingBox();
      expect(box).not.toBeNull(); expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    }
    await close.click(); await expect(page).toHaveURL('/tasks?assignee=me');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
test('related tasks beyond the first hundred restore their source page', async ({page}) => {
  await api(page);
  await page.route('**/api/v1/tasks?**', async route => {
    const q=new URL(route.request().url()).searchParams;
    if(q.get('project_id')!=='121')return route.fallback();
    const n=Number(q.get('page')||1);
    const rows=Array.from({length:121},(_,i)=>({...task,id:String(i+21),projectId:'121',title:`وظیفهٔ مرتبط ${i+1}`}));
    await route.fulfill({json:{data:rows.slice((n-1)*20,n*20),meta:{current_page:n,last_page:7,per_page:20,total:121}}});
  });
  await page.route('**/api/v1/tasks/141',route=>route.fulfill({json:{data:{...task,id:'141',projectId:'121',title:'وظیفهٔ مرتبط 121'}}}));
  await page.setViewportSize({width:390,height:844});
  await page.goto('/projects/121?tab=list&tasks_page=7');
  const related=page.getByRole('region',{name:'وظایف مرتبط'});
  await expect(related.getByRole('link',{name:'وظیفهٔ مرتبط 121',exact:true})).toBeVisible();
  await page.reload();
  await related.getByRole('link',{name:'وظیفهٔ مرتبط 121',exact:true}).click();
  await expect(page.getByLabel('عنوان وظیفه',{exact:true})).toHaveValue('وظیفهٔ مرتبط 121');
  await page.getByRole('button',{name:'بستن جزئیات',exact:true}).click();
  await expect(page).toHaveURL('/projects/121?tab=list&tasks_page=7');
  await expect(related.getByRole('link',{name:'وظیفهٔ مرتبط 121',exact:true})).toBeVisible();
});
test('failed task edits retain drafts and never fake archive success',async({page})=>{
  await api(page); let failure=true; let stored={...task}; let writes=0;
  await page.route('**/api/v1/auth/me',route=>route.fulfill({json:{data:{...user,permissions:[...user.permissions,'tasks.edit']}}}));
  await page.route(/\/api\/v1\/tasks\/41(?:\/status)?$/,async route=>{
    if(route.request().method()!=='GET') {
      writes++;
      if(failure)return route.fulfill({status:500,json:{message:'SQLSTATE hidden'}});
      stored={...stored,...route.request().postDataJSON()};
    }
    return route.fulfill({json:{data:stored}});
  });
  await page.goto('/tasks/41?display=page');
  const title=page.getByLabel('عنوان وظیفه',{exact:true});
  await title.fill('پیش‌نویس قابل بازیابی'); expect(writes).toBe(0);
  await title.press('Tab'); await expect(page.getByText('تغییر ذخیره نشد',{exact:true})).toBeVisible();
  await expect(title).toHaveValue('پیش‌نویس قابل بازیابی');
  expect(stored.title).toBe(task.title);
  await page.getByRole('button',{name:'بایگانی وظیفه',exact:true}).click();
  await expect(page.getByRole('button',{name:'بایگانی وظیفه',exact:true})).toBeEnabled();
  await expect(page.getByRole('button',{name:'بازیابی از بایگانی',exact:true})).toHaveCount(0);
  failure=false; await title.focus(); await title.press('Tab');
  await expect(page.getByRole('button',{name:'بایگانی وظیفه',exact:true})).toBeEnabled();
  await page.reload(); await expect(title).toHaveValue('پیش‌نویس قابل بازیابی');
});
test('task assets and table rows page independently, retain URL and never turn failure into empty',async({page})=>{
  await api(page);let fail=true;
  await page.route('**/api/v1/auth/me',route=>route.fulfill({json:{data:{...user,permissions:[...user.permissions,'assets.view']}}}));
  await page.route('**/api/v1/dam/library?**',route=>{
    const q=new URL(route.request().url()).searchParams;
    if(q.get('task_id')!=='41')return route.fallback();
    if(fail)return route.fulfill({status:500,json:{message:'Unavailable'}});
    const n=Number(q.get('page')||1);
    return route.fulfill({json:{data:[{id:100+n,title:`دارایی صفحه ${n}`,type:'content',created_at:'2026-09-29'}],current_page:n,last_page:2,total:21}});
  });
  await page.route('**/api/v1/dam/data-tables/rows-by-task?**',route=>{
    const n=Number(new URL(route.request().url()).searchParams.get('page')||1);
    return route.fulfill({json:{data:[{id:200+n,table_id:7,cells:{text:`ردیف صفحه ${n}`},can_edit:false,data_table:{id:7,name:'جدول مجاز'}}],meta:{current_page:n,last_page:2,total:21}}});
  });
  await page.goto('/tasks/41?display=page&task_assets_page=2&task_rows_page=2');
  await expect(page.getByText('ردیف صفحه 2',{exact:true})).toBeVisible();
  await expect(page.getByText('هیچ فایلی برای این وظیفه ثبت نشده است.')).toHaveCount(0);
  fail=false;await page.getByRole('button',{name:'تلاش مجدد',exact:true}).click();
  await expect(page.getByText('دارایی صفحه 2',{exact:true})).toBeVisible();
  await page.getByRole('region',{name:'صفحه‌بندی دارایی‌های تسک',exact:true}).getByRole('button',{name:'صفحه قبل'}).click();
  await expect(page).toHaveURL(/task_assets_page=1/);
  await expect(page.getByText('دارایی صفحه 1',{exact:true})).toBeVisible();
  await expect(page.getByText('ردیف صفحه 2',{exact:true})).toBeVisible();
  await page.reload();await expect(page.getByText('دارایی صفحه 1',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'ویرایش ردیف',exact:true})).toBeDisabled();
  await page.goBack();await expect(page.getByText('دارایی صفحه 2',{exact:true})).toBeVisible();
});
test('content output retry reuses the associated DAM asset after a failed stage save',async({page})=>{
  await api(page);let assetsCreated=0;let failStage=true;
  let content:any={id:'51',title:'محتوای خروجی',type:'article',status:'in_progress',priority:'medium',ownerId:'1',creatorId:'1',tags:[],comments:[],attachments:[],stages:[{id:'writing',title:'نگارش',status:'in_progress',assigneeId:'1',outputs:[],inputs:[]}]};
  await page.route('**/api/v1/auth/me',r=>r.fulfill({json:{data:{...user,permissions:[...user.permissions,'content.edit','assets.view','assets.upload']}}}));
  await page.route('**/api/v1/contents/51',r=>{
    if(r.request().method()==='PATCH'){
      if(failStage)return r.fulfill({status:500,json:{message:'Unavailable'}});
      content={...content,...r.request().postDataJSON()};
    }
    return r.fulfill({json:{data:content}});
  });
  await page.route('**/api/v1/dam/library',r=>{
    expect(r.request().method()).toBe('POST');expect(r.request().postDataJSON().content_id).toBe('51');assetsCreated++;
    return r.fulfill({status:201,json:{data:{id:901,title:'خروجی ماندگار',type:'content'}}});
  });
  await page.goto('/contents/51');await page.getByRole('button',{name:'ثبت خروجی',exact:true}).click();
  const dialog=page.getByRole('dialog');await dialog.getByPlaceholder('مثلاً: فایل رندر نهایی تیزر').fill('خروجی ماندگار');
  await dialog.getByRole('button',{name:'ثبت خروجی',exact:true}).click();
  await expect(dialog.getByRole('alert')).toContainText('اتصال خروجی');
  await expect(dialog.getByPlaceholder('مثلاً: فایل رندر نهایی تیزر')).toHaveValue('خروجی ماندگار');
  failStage=false;await dialog.getByRole('button',{name:'ثبت خروجی',exact:true}).click();
  await expect(dialog).toHaveCount(0);expect(assetsCreated).toBe(1);
  await page.reload();await expect(page.getByText('خروجی ماندگار',{exact:true})).toBeVisible();
});
