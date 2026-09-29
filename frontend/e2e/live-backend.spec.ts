import { test, expect, type Page } from '@playwright/test';

async function signIn(page:Page){
  const login=process.env.E2E_LOGIN, password=process.env.E2E_PASSWORD;
  if(!login||!password)throw new Error('Set E2E_LOGIN and E2E_PASSWORD for an isolated test account.');
  await page.goto('/tasks');
  await page.getByPlaceholder('username@example.com').fill(login);
  await page.getByPlaceholder('رمز عبور ورود به سامانه...').fill(password);
  await page.getByRole('button',{name:'ورود به سامانه تدبیر'}).click();
  await expect(page).toHaveURL('/tasks');
}
async function api(page:Page,path:string,method='GET',body?:unknown){
  const result=await page.evaluate(async({path,method,body})=>{
    const token=document.cookie.split('; ').find(c=>c.startsWith('XSRF-TOKEN='))?.slice('XSRF-TOKEN='.length);
    const response=await fetch('/api/v1/'+path,{method,credentials:'include',headers:{Accept:'application/json','Content-Type':'application/json',...(token?{'X-XSRF-TOKEN':decodeURIComponent(token)}:{})},body:body===undefined?undefined:JSON.stringify(body)});
    return {status:response.status,body:await response.json()};
  },{path,method,body});
  expect(result.status,`${method} ${path}`).toBeLessThan(300);
  return result.body;
}

// Opt-in: use only an isolated, migrated test database and an explicit test account.
// This file does not intercept requests or seed/alter any production database.
test('real Sanctum cookie, durable task edit, checklist, archive and restore', async ({page,context}) => {
  test.setTimeout(90_000);
  page.on('dialog',dialog=>dialog.accept());
  await signIn(page);
  const cookies=await context.cookies();
  expect(cookies.some(c=>c.name==='XSRF-TOKEN')).toBe(true);
  expect(cookies.some(c=>c.httpOnly)).toBe(true);
  const title=`آزمون یکپارچه ${Date.now()}`;
  await page.getByRole('button',{name:'وظیفه جدید',exact:true}).click();
  await page.getByPlaceholder('مثلاً: طراحی و پیاده‌سازی فرم ورود').fill(title);
  await page.getByRole('dialog').getByRole('button',{name:'ایجاد وظیفه جدید'}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('link',{name:title,exact:true}).click();
  await expect(page.getByLabel('عنوان وظیفه',{exact:true})).toHaveValue(title);
  const route=page.url();
  await page.getByLabel('عنوان وظیفه',{exact:true}).fill(title+' اصلاح');
  await page.getByLabel('عنوان وظیفه',{exact:true}).press('Tab');
  await expect(page.getByRole('button',{name:'بایگانی وظیفه',exact:true})).toBeEnabled();
  await page.getByPlaceholder('عنوان زیرفعالیت یا چک‌لیست جدید...').fill('کنترل پایدار');
  await page.getByRole('button',{name:'افزودن',exact:true}).click();
  await expect(page.getByText('کنترل پایدار',{exact:true})).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('عنوان وظیفه',{exact:true})).toHaveValue(title+' اصلاح');
  await expect(page.getByText('کنترل پایدار',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'بایگانی وظیفه',exact:true}).click();
  await expect(page.getByRole('button',{name:'بازیابی از بایگانی',exact:true})).toBeVisible();
  await page.reload();
  await page.getByRole('button',{name:'بازیابی از بایگانی',exact:true}).click();
  await expect(page.getByRole('button',{name:'بایگانی وظیفه',exact:true})).toBeVisible();
  await page.goto(route);
  await expect(page.getByLabel('عنوان وظیفه',{exact:true})).toHaveValue(title+' اصلاح');
});
test('real rejection creates one correction and notification read-all survives reload',async({page})=>{
  test.setTimeout(90_000); await signIn(page);
  const user=(await api(page,'auth/me')).data;
  const title=`بازبینی یکپارچه ${Date.now()}`;
  const content=(await api(page,'contents','POST',{title,type:'article',status:'in_progress',ownerId:user.id,stages:[{id:'check',title:'کنترل',status:'pending_approval',assigneeId:user.id,reviewerId:user.id}]})).data;
  const tasks=(await api(page,`tasks?content_id=${content.id}`)).data;
  const work=tasks.find((row:any)=>row.kind==='content_work');
  await api(page,`tasks/${work.id}/status`,'PATCH',{status:'completed'});
  await page.goto(`/approvals?content=${content.id}`);
  await page.getByRole('button',{name:'عودت برای اصلاح',exact:true}).click();
  await page.getByLabel('علت عودت (الزامی)').fill('اصلاح منبع');
  await page.getByRole('button',{name:'ثبت تصمیم',exact:true}).click();
  await expect(page.getByText('بررسی‌ای در انتظار شما نیست.')).toBeVisible();
  const after=(await api(page,`tasks?content_id=${content.id}`)).data;
  const corrections=after.filter((row:any)=>row.kind==='content_correction');
  expect(corrections).toHaveLength(1);expect(corrections[0].parentTaskId).toBe(work.id);
  expect(after.find((row:any)=>row.id===work.id).status).toBe('completed');
  await page.goto(`/tasks/${corrections[0].id}?display=page`);
  await expect(page.getByRole('link',{name:'وظیفهٔ قبلی این اصلاح'})).toHaveAttribute('href',`/tasks/${work.id}?display=page`);
  await page.goto('/notifications');
  await page.getByRole('button',{name:'خواندن همه',exact:true}).click();
  await expect(page.getByRole('button',{name:'خواندن همه',exact:true})).toBeDisabled();
  await page.reload(); await expect(page.getByRole('button',{name:'خواندن همه',exact:true})).toBeDisabled();
  expect((await api(page,'notifications')).meta.unread_count).toBe(0);
});
test('real template creation through the form persists its child tasks atomically',async({page})=>{
  test.setTimeout(90_000);await signIn(page);
  const name=`الگوی یکپارچه ${Date.now()}`;
  const template=(await api(page,'project-templates','POST',{name,tasks:[{title:'کار اول الگو',relativeDueDays:0,subtasks:['بررسی خروجی']},{title:'کار دوم الگو',relativeDueDays:2}]})).data;
  await page.goto('/projects');await page.reload();
  await page.getByRole('button',{name:'ایجاد پروژه جدید',exact:true}).click();
  await page.getByRole('dialog').locator('select').filter({has:page.locator(`option[value="${template.id}"]`)}).first().selectOption(template.id);
  const title=`پروژهٔ یکپارچه ${Date.now()}`;
  await page.getByPlaceholder('مثال: تولید مستند تحلیلی ویژه نوروز').fill(title);
  await page.getByPlaceholder('DOC',{exact:true}).fill('T'+Date.now().toString().slice(-8));
  await page.getByRole('button',{name:'ایجاد پروژه با الگو و تسک‌ها',exact:true}).click();
  await expect(page).toHaveURL(/\/projects\/\d+$/);
  await expect(page.getByRole('region',{name:'وظایف مرتبط'}).getByRole('link',{name:'کار اول الگو',exact:true})).toBeVisible();
  const id=new URL(page.url()).pathname.split('/').pop();
  const rows=(await api(page,`tasks?project_id=${id}`)).data;
  expect(rows).toHaveLength(2);expect(rows.find((row:any)=>row.title==='کار اول الگو').subtasks[0].title).toBe('بررسی خروجی');
  await page.reload(); await expect(page.getByText(title,{exact:true})).toBeVisible();
});
test('content form retains a real 422 and creates canonical stage tasks only after success',async({page})=>{
  test.setTimeout(90_000);await signIn(page);
  await api(page,'settings/process_templates','PUT',{value:[{id:'integration-process',name:'فرایند آزمون',stages:[{id:'stage-1',title:'تولید',order:1,inputs:[],outputs:[]},{id:'stage-2',title:'تحویل',order:2,inputs:[],outputs:[]}]}]});
  const count=(await api(page,'tasks?per_page=1')).meta.total;
  await page.goto('/contents');await page.reload();
  await page.getByRole('button',{name:'ایجاد محتوای جدید',exact:true}).click();
  const field=page.getByPlaceholder('مثال: موشن گرافیک معرفی گزارش عملکرد...');
  await field.fill('الف'.repeat(100));
  await page.getByRole('button',{name:'ایجاد پرونده و راه‌اندازی فرایند',exact:true}).click();
  await expect(page.getByText('تغییر ذخیره نشد',{exact:true})).toBeVisible();
  await expect(field).toHaveValue('الف'.repeat(100));
  expect((await api(page,'tasks?per_page=1')).meta.total).toBe(count);
  const title=`پروندهٔ یکپارچه ${Date.now()}`;await field.fill(title);
  await page.getByRole('button',{name:'ایجاد پرونده و راه‌اندازی فرایند',exact:true}).click();
  await expect(page).toHaveURL(/\/contents\/\d+$/);
  const id=new URL(page.url()).pathname.split('/').pop();
  const tasks=(await api(page,`tasks?content_id=${id}`)).data;
  expect(tasks).toHaveLength(2);expect(tasks.every((row:any)=>row.kind==='content_work'&&row.contentId===id)).toBe(true);
  await page.reload();await expect(page.getByText(title,{exact:true}).first()).toBeVisible();
});
test('real task asset unlink preserves the asset and another task relation',async({page})=>{
  test.setTimeout(90_000);await signIn(page);page.on('dialog',dialog=>dialog.accept());
  const first=(await api(page,'tasks','POST',{title:'تسک اول دارایی'})).data;
  const second=(await api(page,'tasks','POST',{title:'تسک دوم دارایی'})).data;
  const title=`دارایی مشترک ${Date.now()}`;
  const asset=(await api(page,'dam/library','POST',{title,body:'متن آزمون واقعی',task_id:Number(first.id)})).data;
  await api(page,`dam/library/${asset.id}/relations`,'POST',{related_type:'task',related_id:Number(second.id)});
  await page.goto(`/tasks/${first.id}?display=page`);
  await page.getByRole('button',{name:`قطع اتصال دارایی ${title}`,exact:true}).click();
  await expect(page.getByText(title,{exact:true})).toHaveCount(0);
  const saved=(await api(page,`dam/library/${asset.id}`)).data;
  expect(saved.title).toBe(title);expect(saved.relations).toHaveLength(1);
  expect(Number(saved.relations[0].related_id)).toBe(Number(second.id));
  await page.reload();await expect(page.getByText('هیچ فایلی برای این وظیفه ثبت نشده است.')).toBeVisible();
});
