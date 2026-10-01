# ممیزی فاز ۱ — 2026-09-29

## مبنا و حفاظت تغییرات
شاخه `arena/01a0e7dd-main-tadbir`؛ مبنای push قبلی `ddb954a9`. snapshot ابتدا metadata قدیمی `aefe1af7` داشت؛ با fetch و reset **mixed** به مبنای push قبلی هم‌تراز شد. تمام فایل‌های source/test/docs پیش و پس از آن با SHA256 برابر بودند؛ reset hard یا checkout بازنویس اجرا نشد. تغییرات تسک انتشار قبلی حفظ می‌شوند.

## وضعیت پیش از تغییر
- AppContext بیش از ۵۳۰۰ خط: دادهٔ سرور، نشست، modal، navigation، workflow و mutation یکجا. useState از localStorage یا INITIAL مقدار می‌گرفت؛ کاربر اولیهٔ نمایشی نقش مدیر داشت. خطای بارگذاری برخی ماژول‌ها دادهٔ قبلی/نمونه را نگه می‌داشت.
- API واقعی برای پروژه/تسک/محتوا/کاربر/نقش/دپارتمان/اعلان/تنظیمات، DAM، chat و WorkspaceRecord ایده/جلسه/دبیرخانه موجود است. loadWorkspace از Promise.allSettled استفاده می‌کند. وجود API به معنی API-first بودن همهٔ عملیات نیست؛ workflow، chat و بعضی archiveها هنوز optimistic هستند.
- دادهٔ نمونه در `src/data/initial*.ts`؛ پروژه/تسک/محتوا/کاربر/نقش/اعلان/فایل/chat ابتدا از نمونه/کش خوانده می‌شوند. ایده/جلسه/نامه از API شروع می‌شوند. defaults تنظیمات/کاتالوگ permission با دادهٔ کسب‌وکار تفکیک نشده‌اند.
- navigation با activeView و selected IDs؛ فقط task query-link قدیمی fetch مستقیم دارد. مسیرهای URL واقعی، Back و 404 برای همهٔ نماها نداریم.
- Resource و FormRequest برای CRUDهای اصلی موجودند؛ validation برخی فرمان‌ها داخل controller است. responseها data یا data/meta/links و چند پاسخ سفارشی‌اند. auth rate limit عمومی ندارد؛ health/db نام دیتابیس را برمی‌گرداند. middleware فعال بودن حساب و permission وجود دارد؛ Policies اختصاصی محدود/ناموجود؛ کنترل‌های سرویس باید حفظ شوند.
- error handling مخلوط toast/console/alert؛ ApiError مشترک موجود اما 401/419 به session وصل نیست. Feedback شامل toast، loading و error boundary موجود است. theme با تزریق ده‌ها override کلاس indigo تغییر می‌کند.
- ۲۳۳۲۰ فایل frontend/node_modules تحت Git هستند. dist برای هاست بدون SSH لازم است و طبق تصمیم قبلی **tracked artifact** می‌ماند. source تنها مرجع توسعه است.

## دسته‌بندی INITIAL
رکوردهای شخص/پروژه/تسک/محتوا/اعلان/دارایی/chat/نامه/جلسه/ایده: فقط demo، نه seed تولید. permission catalog و status/priorityهای پایه: پیکربندی مشترک؛ seedهای فعلی backend مرجع دادهٔ تولیدند. workflow/template/platform نمونه: فقط demo تا بارگذاری تنظیمات واقعی. هیچ demo به DB تولید seed نمی‌شود.

## مسیرها و modalها
App.tsx switch نماهای dashboard/projects/project-detail/my-tasks/content/content-detail/content-publishing/content-published/archive/users/roles/departments/assets/messages/thought-room/secretariat/notifications/settings/profile/calendar/analytics/activity را دارد. modalهای سراسری: GlobalSearch، Auth، TaskDetailDrawer، CreateTask/Project/Content، EditProject، MemberDetail، Templates/TemplateEditor، User و Role. migration باید لینک‌های task و asset بله را حفظ کند.

## وابستگی و ریسک
TanStack Query برای cache سرور و React Router برای URL لازم‌اند. هیچ dependency جدید backend لازم نیست. حذف cache قدیمی مرورگر نباید آن را به DB import کند؛ رکوردهای ذخیره‌نشدهٔ محلی بازیابی سروری ندارند. تغییر state تدریجی و adapter سازگار لازم است؛ حذف یکباره AppContext خطرناک است. routeهای SPA نیاز به Apache rewrite دارند. mutationهای optimistic قدیمی، حفظ تاریخچه archive، pagination کامل، permission سراسری و تست همزمانی کار جداگانه‌اند. تمام معیارهای Done باید جداگانه اثبات شوند، نه صرف ایجاد فایل helper.

## فهرست تمام INITIAL_* (قبل از تغییر)
```text
frontend/src/data/initialThinkTankData.ts:3:export const INITIAL_IDEAS: Idea[] = [
frontend/src/data/initialThinkTankData.ts:244:export const INITIAL_THINK_TANK_MEETINGS: ThinkTankMeeting[] = [
frontend/src/data/initialSecretariatData.ts:3:export const INITIAL_LETTERS: SecretariatLetter[] = [
frontend/src/data/initialSecretariatData.ts:265:export const INITIAL_RESOLUTIONS: SecretariatResolution[] = [
frontend/src/data/initialSecretariatData.ts:313:export const INITIAL_ARCHIVE_DOSSIERS: ArchiveDossier[] = [
frontend/src/data/initialData.ts:3:export const INITIAL_CATEGORIES: string[] = [
frontend/src/data/initialData.ts:116:export const INITIAL_ROLES: SystemRole[] = [
frontend/src/data/initialData.ts:210:export const INITIAL_USERS: User[] = [
frontend/src/data/initialData.ts:477:export const INITIAL_PROJECTS: Project[] = [
frontend/src/data/initialData.ts:570:export const INITIAL_TASKS: Task[] = [
frontend/src/data/initialData.ts:920:export const INITIAL_NOTIFICATIONS: AppNotification[] = [
frontend/src/data/initialData.ts:978:export const INITIAL_TEMPLATES: ProjectTemplate[] = [
frontend/src/data/initialData.ts:1289:export const INITIAL_ACTIVITIES: ActivityLog[] = [
frontend/src/data/initialData.ts:1374:export const INITIAL_DEPARTMENTS: Department[] = [
frontend/src/data/initialData.ts:1457:export const INITIAL_WORKFLOWS: Workflow[] = [
frontend/src/data/initialData.ts:1474:export const INITIAL_CONTENTS: Content[] = [
frontend/src/data/initialData.ts:2003:export const INITIAL_PROCESS_TEMPLATES: ContentProcessTemplate[] = [
frontend/src/data/initialData.ts:2388:export const INITIAL_PUBLISHING_PLATFORMS: PublishingPlatform[] = [
frontend/src/data/initialChatData.ts:3:export const INITIAL_CONVERSATIONS: Conversation[] = [
frontend/src/data/initialChatData.ts:239:export const INITIAL_MESSAGES: ChatMessage[] = [
frontend/src/data/initialAssets.ts:3:export const INITIAL_FOLDERS: AssetFolder[] = [
frontend/src/data/initialAssets.ts:84:export const INITIAL_ASSETS: DigitalAsset[] = [
frontend/src/context/AppContext.tsx:17:  INITIAL_USERS, INITIAL_PROJECTS, INITIAL_TASKS, INITIAL_NOTIFICATIONS, INITIAL_TEMPLATES, INITIAL_ACTIVITIES, INITIAL_ROLES, INITIAL_WORKFLOWS, INITIAL_CONTENTS, SYSTEM_PERMISSIONS, INITIAL_CATEGORIES,
frontend/src/context/AppContext.tsx:18:  INITIAL_PROCESS_TEMPLATES, INITIAL_PUBLISHING_PLATFORMS
frontend/src/context/AppContext.tsx:20:import { INITIAL_ASSETS, INITIAL_FOLDERS } from '../data/initialAssets';
frontend/src/context/AppContext.tsx:21:import { INITIAL_CONVERSATIONS, INITIAL_MESSAGES } from '../data/initialChatData';
frontend/src/context/AppContext.tsx:470:    return saved ? JSON.parse(saved) : INITIAL_USERS;
frontend/src/context/AppContext.tsx:475:    return saved ? JSON.parse(saved) : INITIAL_ROLES;
frontend/src/context/AppContext.tsx:482:    return saved ? JSON.parse(saved) : INITIAL_WORKFLOWS;
frontend/src/context/AppContext.tsx:489:    return saved ? JSON.parse(saved) : INITIAL_CONTENTS;
frontend/src/context/AppContext.tsx:494:    const found = INITIAL_USERS.find(u => u.id === savedId);
frontend/src/context/AppContext.tsx:495:    return found || INITIAL_USERS[0]; // Sarah Changizi (Admin)
frontend/src/context/AppContext.tsx:500:    return saved ? JSON.parse(saved) : INITIAL_PROJECTS;
frontend/src/context/AppContext.tsx:505:    return saved ? JSON.parse(saved) : INITIAL_TASKS;
frontend/src/context/AppContext.tsx:512:    return saved ? JSON.parse(saved) : INITIAL_NOTIFICATIONS;
frontend/src/context/AppContext.tsx:517:    return saved ? JSON.parse(saved) : INITIAL_TEMPLATES;
frontend/src/context/AppContext.tsx:520:  const INITIAL_CONTENT_TYPES = [
frontend/src/context/AppContext.tsx:532:    return saved ? JSON.parse(saved) : INITIAL_CONTENT_TYPES;
frontend/src/context/AppContext.tsx:553:    return saved ? JSON.parse(saved) : INITIAL_CATEGORIES;
frontend/src/context/AppContext.tsx:558:    return saved ? JSON.parse(saved) : INITIAL_ACTIVITIES;
frontend/src/context/AppContext.tsx:564:    return saved ? JSON.parse(saved) : INITIAL_FOLDERS;
frontend/src/context/AppContext.tsx:569:    return saved ? JSON.parse(saved) : INITIAL_ASSETS;
frontend/src/context/AppContext.tsx:904:    return saved ? JSON.parse(saved) : INITIAL_CONVERSATIONS;
frontend/src/context/AppContext.tsx:909:    return saved ? JSON.parse(saved) : INITIAL_MESSAGES;
frontend/src/context/AppContext.tsx:1002:    return saved ? JSON.parse(saved) : INITIAL_PROCESS_TEMPLATES;
frontend/src/context/AppContext.tsx:1029:    return saved ? JSON.parse(saved) : INITIAL_PUBLISHING_PLATFORMS;
frontend/src/context/AppContext.tsx:1973:    setCategories(INITIAL_CATEGORIES);
frontend/src/context/AppContext.tsx:3258:    const template = templates.find(t => t.id === templateId) || INITIAL_TEMPLATES[0];
```

## فهرست تمام localStorage (قبل از تغییر)
```text
frontend/src/context/AppContext.tsx:467:  // Load initial from localStorage if present
frontend/src/context/AppContext.tsx:469:    const saved = localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}users`);
frontend/src/context/AppContext.tsx:474:    const saved = localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}roles`);
frontend/src/context/AppContext.tsx:481:    const saved = localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}workflows`);
frontend/src/context/AppContext.tsx:488:    const saved = localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}contents`);
frontend/src/context/AppContext.tsx:493:    const savedId = localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}current_user_id`);
frontend/src/context/AppContext.tsx:499:    const saved = localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}projects`);
frontend/src/context/AppContext.tsx:504:    const saved = localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}tasks`);
frontend/src/context/AppContext.tsx:511:    const saved = localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}notifications`);
frontend/src/context/AppContext.tsx:516:    const saved = localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}templates`);
frontend/src/context/AppContext.tsx:531:    const saved = localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}content_types`);
frontend/src/context/AppContext.tsx:536:    localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}content_types`, JSON.stringify(contentTypes));
frontend/src/context/AppContext.tsx:552:    const saved = localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}categories`);
frontend/src/context/AppContext.tsx:557:    const saved = localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}activities`);
frontend/src/context/AppContext.tsx:563:    const saved = localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}folders`);
frontend/src/context/AppContext.tsx:568:    const saved = localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}assets`);
frontend/src/context/AppContext.tsx:903:    const saved = localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}conversations`);
frontend/src/context/AppContext.tsx:908:    const saved = localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}messages`);
frontend/src/context/AppContext.tsx:935:    localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}conversations`, JSON.stringify(conversations));
frontend/src/context/AppContext.tsx:939:    localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}messages`, JSON.stringify(messages));
frontend/src/context/AppContext.tsx:997:    localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}categories`, JSON.stringify(categories));
frontend/src/context/AppContext.tsx:1001:    const saved = localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}process_templates`);
frontend/src/context/AppContext.tsx:1006:    localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}process_templates`, JSON.stringify(processTemplates));
frontend/src/context/AppContext.tsx:1028:    const saved = localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}publishing_platforms`);
frontend/src/context/AppContext.tsx:1033:    localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}publishing_platforms`, JSON.stringify(publishingPlatforms));
frontend/src/context/AppContext.tsx:1113:    localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}contents`, JSON.stringify(contents));
frontend/src/context/AppContext.tsx:1996:  // Sync state changes to localStorage
frontend/src/context/AppContext.tsx:1999:      localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}workflows`, JSON.stringify(workflows));
frontend/src/context/AppContext.tsx:2000:      localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}contents`, JSON.stringify(contents));
frontend/src/context/AppContext.tsx:2001:      localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}users`, JSON.stringify(users));
frontend/src/context/AppContext.tsx:2002:      localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}roles`, JSON.stringify(roles));
frontend/src/context/AppContext.tsx:2003:      localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}current_user_id`, currentUser.id);
frontend/src/context/AppContext.tsx:2004:      localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}projects`, JSON.stringify(projects));
frontend/src/context/AppContext.tsx:2005:      localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}tasks`, JSON.stringify(tasks));
frontend/src/context/AppContext.tsx:2006:      localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}notifications`, JSON.stringify(notifications));
frontend/src/context/AppContext.tsx:2007:      localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}templates`, JSON.stringify(templates));
frontend/src/context/AppContext.tsx:2008:      localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}activities`, JSON.stringify(activities));
frontend/src/context/AppContext.tsx:2009:      localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}folders`, JSON.stringify(folders));
frontend/src/context/AppContext.tsx:2010:      localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}assets`, JSON.stringify(assets));
frontend/src/context/AppContext.tsx:3084:      return JSON.parse(localStorage.getItem(ARCHIVE_PREV_KEY) || '{}');
frontend/src/context/AppContext.tsx:3109:      localStorage.setItem(ARCHIVE_PREV_KEY, JSON.stringify(prev));
frontend/src/context/AppContext.tsx:3129:      localStorage.setItem(ARCHIVE_PREV_KEY, JSON.stringify(prev));
```

## منابع بررسی‌شده
`package.json`, `App.tsx`, `AppContext.tsx`, `src/api/*`, `src/data/*`, `types.ts`, `index.css`, `Feedback.tsx`, routes/api.php، bootstrap/app.php، Auth/Health/Project/Task/Content controllers و requests/resources و تست‌های Feature. فهرست route/API و activeView از سورس مبنا استخراج شد.


## نتیجهٔ اجرای این ممیزی

این سند inventory زمان شروع است، نه ادعای اتمام همهٔ اصلاحات. وضعیت نهایی، نتیجهٔ تست‌ها و معیارهای ناتمام در [گزارش اجرا](phase-1-implementation.md) و مراحل تحویل/rollback در [راهنمای استقرار](deployment.md) است.

- INITIALها به `src/demo` منتقل و مصرف production قطع شد؛ cacheهای domain/هویت localStorage دیگر source نیستند. referenceهای بالا برای ردگیری وضعیت قبلی باقی مانده‌اند.
- Auth/UI/Query/Router تفکیک اولیه انجام شد؛ AppContext هنوز facade و بدهی فنی مهم است.
- تمام patcherهای یک‌بارمصرف فهرست‌شده حذف شدند. node_modules از index حذف شد؛ dist طبق تصمیم هاست حفظ و بازتولید شد.
- فرم عادی پروژه، ساخت تسک و drawer تسک مهاجرت کردند؛ دادهٔ نمونهٔ task و بودجه/برچسب ساختگی فرم قالب حذف شد.
- نقص CHECK وضعیت archive در SQLite با migration مخصوص SQLite اصلاح شد؛ این تغییر در MySQL no-op است.
- صحت همهٔ APIها/مجوزهای تمام ماژول‌ها، همهٔ overlayها و MySQL/کوکی واقعی هنوز تأیید نشده است. فاز اول کامل اعلام نشده است.
