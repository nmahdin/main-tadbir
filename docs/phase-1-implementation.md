# گزارش اجرای فاز اول — ۲۰۲۶/۰۹/۲۹

> **به‌روزرسانی جدیدتر:** [وضعیت تجمیعی تکمیل دو فاز](phase-completion-status.md) مرجع آخرین کد، آزمون‌ها، migration و موانع باز است. اعداد و فهرست نواقص زیر گزارش تاریخی اجراهای قبلی‌اند؛ بخشی از آن‌ها اکنون رفع شده است. تکمیل صددرصد همچنان تأیید نشده است.

## وضعیت صریح

تغییرات روی `arena/01a0e7dd-main-tadbir` و بر پایهٔ `ddb954a9` اجرا شده‌اند؛ تغییرات قبلی تسک انتشار حفظ شده‌اند. **فاز اول هنوز تمام معیارهای Done را ندارد.** این گزارش پیاده‌سازی واقعیِ پایه‌ها و فاصلهٔ باقی‌مانده را تفکیک می‌کند. در این مرحله push یا deploy انجام نشده است.

## تغییرات اجراشده

### مالکیت state و API

- `AuthContext` مالک هویت/نشست و پاک‌سازی cache هنگام خروج/تعویض حساب است؛ پاسخ دیررس نباید هویت خارج‌شده را دوباره فعال کند.
- `UIContext` مالک navigation، selected ID پروژه/محتوا/تسک و flagهای modal عمومی است. `activeView` فعلاً adapter سازگاری با componentهای قدیمی است، نه منبع مستقل مسیر.
- TanStack Query مالک cache مجموعه‌ها با کلید scopeشده به کاربر است. AppContext برای مهاجرت تدریجی هنوز facade بزرگی با عملیات قدیمی است و حذف کامل نشده است.
- hookهای `useAuth`، `useProjects/useProject/useCreateProject/useUpdateProject`، `useTasks/useTask/useCreateTask/useUpdateTask`، `useContents/useContent`، `useUsers`، `useRoles`، `useNotifications` و `useSettings` ایجاد شده‌اند. fetch تکراری از طریق query key مشترک dedupe می‌شود.
- viewهای اصلی پروژه/تسک/محتوا/نقش/اعلان مستقیماً collection hook را مصرف می‌کنند. bootstrap باقی ماژول‌ها از API به همان cache می‌رود؛ خطای یک module مستقل نگه داشته می‌شود.
- snapshot حافظه‌ای پاسخ موفق، خواندن را از ویرایش واقعی جدا می‌کند تا hydration باعث انبوه PUT نشود. رکورد تازه‌ساخته‌شده نیز fingerprint می‌شود تا ویرایش بعدی در facade قدیمی گم نشود. snapshot جلسهٔ قبلی پذیرفته نمی‌شود.
- فرم عادی ایجاد/ویرایش پروژه API-first و مبتنی بر mutation hook است؛ ID واقعی دریافت می‌کند. recursion تابع close و بازشدن هم‌زمان دو modal ویرایش رفع شد. مسیر ایجاد از قالب منتظر ID واقعی پروژه می‌ماند، اما child-taskها هنوز تراکنشی نشده‌اند.
- ایجاد تسک منتظر پاسخ سرور و دارای pending/error/success است. همسان‌سازی همهٔ mutationهای قدیمی هنوز کامل نشده است.

### demo و localStorage

فایل‌های `INITIAL_*` از `src/data` به `src/demo` منتقل شدند؛ فهرست نمادها/کلیدها در audit موجود است. `runtime.ts` تنها تنظیمات API/Sanctum/dev/prod/demo را می‌خواند. `VITE_DEMO_MODE` پیش‌فرض false و فقط مقدار صریح true فعال‌کننده است. قطع API در حالت عادی دادهٔ نمونه تولید نمی‌کند. حالت demo برچسب واضح دارد و API آن مسدود است؛ تغییرات حافظه‌ای بعضی فرم‌های قدیمی هنوز امکان‌پذیر است.

ذخیره/بازیابی مجموعه‌های domain و هویت از localStorage کنار گذاشته شد. اطلاعات پروژه، تسک، محتوا، کاربران، نقش‌ها، اعلان‌ها، DAM، جلسات، ایده‌ها، دبیرخانه، آرشیو، chat و settings از API/cache جلسه مصرف می‌شوند. پیاده‌سازی‌های API این ماژول‌ها غالباً از قبل وجود داشتند؛ endpoint موازی ساخته نشده است. دادهٔ نمونهٔ task در فرم قالب و بودجه/برچسب ساختگی پروژه و قالب نیز حذف شد. preferenceهای UI مانند theme/sidebar مجاز باقی مانده‌اند. دادهٔ قدیمی مرورگر خودکار به سرور import یا از دستگاه پاک نشده است.

### Router

مسیرهای زیر ثبت شده‌اند:

`/login`, `/dashboard`, `/projects`, `/projects/:projectId`, `/tasks`, `/tasks/:taskId`, `/contents`, `/contents/:contentId`, `/contents/published`, `/archive`, `/users`, `/roles`, `/departments`, `/dam`, `/chat`, `/thought-room`, `/secretariat`, `/notifications`, `/settings`, `/profile`.

مسیرهای سازگاری اضافی `/calendar`، `/analytics`، `/reports` و `/activity` نیز نگاشت شده‌اند. IDهای entity باید عدد مثبت باشند. مسیر ناشناخته/ID نامعتبر 404 و permission ناکافی AccessDenied دارد. جزئیات خارج از صفحهٔ اول فهرست جداگانه fetch می‌شود؛ رسیدن دیرهنگام فهرست آن را حذف نمی‌کند. cache entity بعد از ویرایش هم به فهرست سازگار برمی‌گردد.

`?task=ID` و hint دارایی `asset` حفظ شده‌اند و به URL تسک می‌رسند؛ Escape نباید آن لینک را دوباره باز کند. فیلترهای اصلی view/status و تعدادی filter/search به query string منتقل شده‌اند. status=overdue برای تسک پشتیبانی شده است؛ همهٔ فیلترهای همهٔ ماژول‌ها هنوز URL-based نیستند.

### UI و خطا

- tokenهای semantic برای رنگ/سطح/متن/مرز/حالت‌ها و کاربرد تدریجی آن‌ها؛ همهٔ utilityهای رنگ قدیمی هنوز حذف نشده‌اند.
- primitives مشترک Button، IconButton، Input، Textarea، Select، FormField، Modal، Drawer، ConfirmDialog، Skeleton، EmptyState، ErrorState، LoadingState، PageHeader، StatusBadge، PriorityBadge و Avatar اضافه شده‌اند. DateInput موجود حفظ شده؛ Toast/ToastViewport موجود با dedupeKey و dismiss ادامه یافته است.
- Modal مشترک Escape، focus containment/restore و scroll lock دارد. فرم تسک، فرم پروژه و drawer جزئیات تسک از آن استفاده می‌کنند؛ همهٔ overlayهای قدیمی مهاجرت نکرده‌اند.
- فرم‌های پروژه و تسک دارای خطای خلاصه و feedback سطح فیلدهای اصلی هستند؛ پوشش تمام فیلدهای تمام فرم‌ها کامل نیست.
- parser مشترک برای خطاهای شبکه/401/403/404/419/422/429 و خطای امن سرور؛ raw SQL/trace نباید در UI نمایش داده شود. راهنمای شناخته‌شدهٔ تعمیر schema بله در قرارداد سرور allowlist شده است.

### بک‌اند

- health و db health بدون جزئیات اتصال/استثناء؛ حتی در APP_DEBUG پاسخ 5xx API scrub می‌شود. پیام شناخته‌شدهٔ `OperationsSchema::MESSAGE` تنها استثنای صریح و بدون trace است.
- throttle ورود/ثبت‌نام و مسیرهای reset موجود؛ webhook limiter موجود حفظ شده است.
- FormRequestهای دستور انتشار/تنظیمات انتشار/تسک انتشار و کنترل سمت سرور حفظ و تست شده‌اند. انتشار مجاز و ذخیره‌شده بدون الزام لینک، فقط تسک انتشار مرتبط را اتمیک و idempotent تکمیل می‌کند.
- قراردادهای موجود Resource و pagination پروژه/تسک تست شده‌اند؛ تمام endpointهای قدیمی در این مرحله بازنویسی نشده‌اند.
- migration SQLite محدودیت status آرشیو را تعمیر می‌کند و روی MySQL no-op است. تست حفظ دادهٔ موجود، عضویت و FK اجرا شده است. down عمداً status را تنگ/داده را تبدیل نمی‌کند.

### پاک‌سازی و تحویل فایل

- ۲۳٬۳۲۰ فایل dependency از index Git حذف شدند؛ اکنون `git ls-files '*node_modules*'` صفر است. فایل‌های واقعی env نیز track نمی‌شوند؛ فقط مثال‌ها هستند. تاریخچهٔ Git بازنویسی نشده است.
- source patcherهای یک‌بارمصرف `frontend/fix*.{js,cjs}`، `patch*.{js,cjs}` و `update_content_detail_publish.cjs` پس از بررسی حذف شدند؛ patcher جایگزین ساخته نشد.
- `frontend/dist` عمداً ignore نشده و build نهایی با API تولید و demo=false ساخته شد. `.htaccess` از public به dist کپی می‌شود. bundle JS حدود ۲٫۸۴MB است و هشدار chunk بزرگ باقی است.
- `.env.example` فرانت‌اند از تنظیمات AI نامرتبط پاک و تنظیمات فعلی مستند شد. مثال بک‌اند و فایل واقعی محافظت‌شده حفظ شدند.

## فایل‌ها و dependencyهای مهم

جدید: `docs/phase-1-audit.md`، همین گزارش، `docs/deployment.md`، `frontend/src/config/{runtime,permissions}.ts`، `context/{AuthContext,UIContext}.tsx`، `queries/*`، `routing/*`، `api/errors.ts`، `components/common/Primitives.tsx`، `src/demo/*`، `public/.htaccess`، Playwright config، `e2e/*` و `tests/phase1.test.mjs`؛ در بک‌اند دو کلاس تست PhaseOne و migration تعمیر SQLite.

اصلاح‌شده: App/AppContext، client API، فایل‌های view اصلی و فرم‌های پروژه/تسک/قالب، drawer تسک، CSS، package/lock، bootstrap/routing/auth/health بک‌اند و dist. فایل‌های publication/event/automation و تست اختصاصی انتشار متعلق به slice قبلیِ حفظ‌شده‌اند و همراه این تغییرات تست شدند.

افزوده‌شده: `@tanstack/react-query`، `react-router-dom` و dev dependency `@playwright/test`؛ نسخه‌های دقیق در package-lock هستند. composer dependency جدید نصب نشد. مسیر canonical نصب/build در این تحویل npm/package-lock است.

## نتیجهٔ اجرای تست

| اجرا | نتیجه |
|---|---|
| `npm ci` | موفق؛ ۲۶۹ package نصب، audit صفر آسیب‌پذیری گزارش کرد |
| `npm run lint` | موفق؛ اسکریپت فعلی مخزن **tsc --noEmit** است، نه ESLint |
| `npm test` | ۲۹ تست Node موفق |
| `npm run build`، demo=false و API تولید | موفق؛ هشدار chunk بزرگ باقی |
| Playwright عادی | ۱۱ سناریو موفق؛ API mocked |
| Playwright demo جدا | ۱ سناریو موفق؛ برچسب/دادهٔ نمایشی و عدم درخواست API |
| کل PHPUnit با PHP-WASM 8.5.10/SQLite حافظه‌ای | **۲۲۶ تست، ۱۱۳۸ assertion، همه موفق** |
| route:list --path=api/v1 | ۱۶۴ route |
| optimize:clear در محیط testing با cache/session آرایه‌ای | موفق |
| git diff --check | بدون ایراد whitespace |

تست‌های مرورگر: localStorage مسموم، محافظت direct route، جزئیات خارج از فهرست، refresh/Back، 404، AccessDenied، 500 امن بدون demo، loading/empty، modal موبایل و Escape/Tab/scroll، ورود/خروج، ساخت/ویرایش/refresh پروژه با ID واقعی، ساخت/ویرایش/archive/restore تسک و لینک legacy/asset. Cookie واقعی Sanctum یا عملیات durable DB در این مرورگرها تست نشده است.

تست‌های جدید سرور: health/debug، token login/me/logout، invalid/inactive/بدون مجوز، 422/403/404، pagination، archive/restore، محدودیت ورود/ثبت‌نام و حفظ داده در تعمیر schema. برای محدودیت CLI-WASM، mock خروجی کنسول TestCase فقط هنگام اجرای تست موقتاً خاموش و بعد بازگردانده شد؛ این workaround وارد source نشده است.

## معیارهای باقی‌مانده — مانع اعلام Done

1. migration کامل mutationهای optimistic/autosave در AppContext به عملیات API-first؛ همهٔ ماژول‌ها هنوز خطا/rollback همسان ندارند. AppContext هنوز حدود ۵۲۰۰ خط است.
2. جایگزینی تدریجی بارگیری همهٔ مجموعه‌ها با pagination/query وابسته به route؛ fetch اولیهٔ تعدادی ماژول هنوز گسترده است.
3. استانداردسازی و استفادهٔ واقعی از Tabs، DataTable، FilterBar، Pagination، DropdownMenu و Tooltip؛ همچنین مهاجرت باقی modal/drawerها و تمام فرم‌ها به field error مشترک.
4. تکمیل semantic tokenها و حذف overrideهای گستردهٔ رنگ؛ visual/a11y regression همهٔ صفحات هنوز انجام نشده است.
5. حفظ وضعیت دقیق پیش از archive در سرور: پس از refresh، restore قدیمی به default active/todo/idea می‌رود. تست فعلی صحت restore صریح را تأیید می‌کند، نه حفظ خودکار هر وضعیت قبلی.
6. ساخت پروژه از template هنوز child-taskهای اتمیک/rollback کامل ندارد.
7. یکسان‌سازی قرارداد پاسخ/Policy و ACL تمام ماژول‌ها، به‌ویژه exceptionهای granular شخصی/دپارتمانی، کامل نشده است.
8. تست مرورگر با Laravel واقعی، نشست cookie واقعی، MySQL و هاست Apache/HTTPS بدون SSH/Cron لازم است. PHP-WASM/SQLite جای آن‌ها نیست.
9. تست همهٔ فرم‌ها در خطای 422، دوبارکلیک، slow network و تمامی اندازه‌های موبایل تکمیل نشده است.
10. شکستن bundle و حذف وابستگی اجرایی به facade قدیمی؛ smart-taskهای خارج از publication (اصلاح پس از رد، خروجی متنی/جدولی و جریان‌های جلسه/ایده) کار جداگانه و انجام‌نشده‌اند.

## ترتیب ادامهٔ پیشنهادی

ابتدا mutation و archive/restore پروژه/تسک/محتوا و آزمون یکپارچهٔ واقعی را کامل کنید؛ سپس shared table/filter/menu و مهاجرت فرم‌ها، بعد قرارداد/Policy بقیهٔ ماژول‌ها و کاهش bundle. کار workflow جدید یا بازطراحی ظاهری گسترده قبل از بستن این باقی‌مانده‌ها توصیه نمی‌شود. مراحل production، backup و rollback در `docs/deployment.md` است.
