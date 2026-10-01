# تسک هوشمند انتشار — گزارش پیاده‌سازی و راهنمای استقرار

تاریخ: 2026-09-29<br>
مبنای تغییر: `ddb954a9146ef9f2aac9936af3b27e70875d967a`<br>
شاخه: `arena/01a0e7dd-main-tadbir`

## محدودهٔ تحویل

**کلیک روی انتشار ← ثبت موفق انتشار در تدبیر ← تکمیل خودکار تسک انتشارِ همان محتوا.**

لینک واقعی مقصد یا تأیید اضافه لازم نیست. این عملیات «ثبت داخلی انتشار» است؛ ارسال/تحویل به بله یا شبکهٔ دیگر را ادعا نمی‌کند و تماس خارجی ندارد. شکست ذخیره یا پردازش، وضعیت محتوا و تسک را با هم rollback می‌کند. رابط کاربری تنها پس از پاسخ موفق سرور تغییر موفقیت را نشان می‌دهد.

این نسخه **اولین برش سیستم تسک رویدادمحور** است، نه تکمیل کل درخواست. قواعد تولید متن، تحویل/بازبینی خروجی، رد و زنجیرهٔ اصلاح، صورت‌جلسه و بررسی ایده هنوز به این پردازشگر وصل نشده‌اند. [طرح معماری و باقی‌مانده‌ها](../architecture/smart-tasks-review-and-plan.md) را ببینید.

### رفتار دقیق

- تسک صریح `content_publish` به شناسهٔ واقعی محتوا/پروژه وصل می‌شود؛ از «ایجاد تسک انتشار» در میز انتشار ساخته می‌شود، نه فرم عمومی.
- تسک قدیمی `content_work` نیز فقط با `content_id` و `content_stage_id` دقیقِ مرحلهٔ ذخیره‌شدهٔ `stageKey=publish` قابل تکمیل است. تسک‌های صرفاً هم‌عنوان/هم‌برچسب، general، محتوای دیگر و مراحل تولید/بازبینی تغییر نمی‌کنند.
- تسک‌های completed/archived بازنویسی نمی‌شوند. لغو ثبت انتشار، تکمیل قبلی را برنمی‌گرداند؛ می‌توان برای دور بعد تسک جدید ساخت. تاریخچهٔ قبل باقی می‌ماند.
- تغییر دستی وضعیت تسک طبق مجوزهای موجود حفظ می‌شود؛ هرگز منبع را منتشر یا تأیید نمی‌کند. فرم عادی فیلد event/version نگرفته است.
- رویداد هم‌زمان `ContentPublished` از داخل تراکنش منبع dispatch می‌شود. `TaskAutomationProcessor` همان رسید و actor، منبع و هدف‌ها را بررسی می‌کند و از اثر مشترک `TaskOperations` استفاده می‌کند.
- actor فعال و مجوزهای `content.view` و `content.publish` لازم‌اند. ساخت تسک، `tasks.create` و `tasks.view` هم لازم دارد. پاسخ انتشار بدون `tasks.view` هیچ تسکی برنمی‌گرداند.
- رسید خصوصی آخرین رویداد در `Content.payload._publication` نگه‌داری و از Resource حذف می‌شود؛ فقط `publicationVersion` سروری نمایش داده می‌شود. ActivityLog شامل actor، event ID، شناسهٔ منبع/تسک و وضعیت قبل/بعد است.
- تکرار کلیک بعد از موفقیت یا replay همان رویداد اثر/تاریخچهٔ تکراری ندارد. رویداد قدیمی تسک تازه‌ساخته را کامل نمی‌کند. خطای listener یا نبود آن باعث rollback کامل می‌شود؛ تلاش مجدد با همان فرمان است، نه worker یا endpoint عمومی event.
- 409 باعث بازخوانی محتوا برای تلاش بعدی کاربر می‌شود؛ فرمان روی نسخهٔ جدید خودکار تکرار نمی‌شود. فرم زمان‌بندی در خطا باز می‌ماند. برنامه‌ریزی به معنی اجرای خودکار در ساعت تعیین‌شده نیست.

## قرارداد API

مسیرها زیر `/api/v1`، با نشست و کنترل‌های معمول برنامه هستند. `expectedVersion` یک رشتهٔ ۶۴ کاراکتری برگشتی از `ContentResource.publicationVersion` است، نه ورودی فنی فرم عادی.

| مسیر | ورودی | خروجی |
|---|---|---|
| `POST /contents/{content}/publish` | `expectedVersion` | `{data: {content, tasks}}`، بدون نیاز به URL |
| `POST /contents/{content}/unpublish` | `expectedVersion` | همان قالب؛ تسک قبلی حفظ می‌شود |
| `PUT /contents/{content}/publication-settings` | `expectedVersion`، `publishInfo`، `publisherId` اختیاری و nullable | `{data: content}` با نسخهٔ تازه |
| `POST /contents/{content}/publication-task` | `expectedVersion`؛ عنوان، توضیح، مسئول، اولویت و مهلت اختیاری | `{data: task}`؛ 201 برای ساخت، 200 برای تسک فعال تکراری |

برنامه فقط date/time/channels/caption/status را می‌پذیرد؛ status برنامه `planned` یا `ready` است. حساب مسئول/ناشر باید فعال باشد. تسک فعال explicit با مسئول متفاوت conflict می‌دهد، نه ساخت بی‌صدای تسک دوم. اطلاعات publication و رسید با PATCH عمومی جعل/بازنویسی نمی‌شوند؛ autosave کامل با همان مقادیر و نسخهٔ جاری سازگار است.

**سازگاری:** APIهای قدیمی محتوا/تسک حذف نشده‌اند، ولی تغییر انتشار/برنامه از PATCH عمومی عمداً محدود شده است. بنابراین فرانت‌اند قدیمی با بک‌اند جدید برای این عملیات سازگار نیست؛ نصب هماهنگ الزامی است. در این برش migration یا dependency جدید وجود ندارد؛ پیش‌نیازهای نسخهٔ قبلی دپارتمان/بله همچنان برقرارند.

## فایل‌های تغییرکرده

### بک‌اند

جدید:
- `backend/app/Events/ContentPublished.php`
- `backend/app/Services/ContentPublication.php`
- `backend/app/Services/TaskAutomationProcessor.php`
- `backend/tests/Feature/ContentPublicationTasksTest.php`

تغییر:
- `backend/app/Providers/AppServiceProvider.php`: ثبت listener هم‌زمان.
- `backend/app/Services/TaskOperations.php`: اثر خودکار، audit و محافظ اتصال kind جدید.
- `backend/app/Services/ContentStageTaskSync.php`: حفاظت محدود تسک‌های بستهٔ انتشار و جلوگیری از حذف review هنگام skip انتشار؛ نه بازنویسی کامل گردش‌کار.
- `backend/app/Http/Controllers/Api/V1/ContentController.php`: چهار فرمان، guard و transaction ذخیرهٔ عمومی؛ حفظ فیلدهای واقعی در PATCH ناقص.
- `backend/app/Http/Controllers/Api/V1/TaskController.php`: منع ساخت kind جدید از مسیر عمومی.
- `backend/app/Http/Requests/TaskRequest.php`: شناسایی kind انتشار.
- `backend/app/Http/Resources/ContentResource.php`: نسخهٔ سروری و مخفی‌کردن رسید.
- `backend/routes/api.php`: مسیرهای جدید با مجوز.

### فرانت‌اند و مستندات

- `frontend/src/api/contents.ts`، `frontend/src/types.ts`: قرارداد فرمان‌ها/نسخه/نوع فعالیت.
- `frontend/src/context/AppContext.tsx`: API-first، ادغام پاسخ سرور، pending و guard انتشار عمومی.
- `frontend/src/utils/publicationCommand.ts`: بازیابی conflict بدون تکرار خودکار فرمان.
- `frontend/src/components/content/ContentPublishingView.tsx`: ذخیرهٔ برنامه قبل از فرمان و ساخت تسک مرتبط.
- `frontend/src/components/content/ContentDetailView.tsx`: انتشار اختصاصی و اتصال دقیق تسک.
- `frontend/src/components/content/ContentPublishedView.tsx`: gate و pending لغو انتشار.
- `frontend/src/components/tasks/TaskDetailDrawer.tsx`: علت تکمیل و ناوبری منبع با مجوز.
- `frontend/tests/publication.test.mjs`: قراردادهای سورس و تست اجرایی helper.
- `frontend/dist/index.html` و bundle جدید `frontend/dist/assets/index-C38u-8oo.js`؛ جایگزین bundle قبلی `index-XbSUHsQZ.js`. CSS همچنان `index-D5xjaxvb.css` و favicon بدون تغییرند. کل dist بخشی از تحویل است و ignore نشده است.
- `docs/architecture/smart-tasks-review-and-plan.md` و همین راهنما.

**Migration جدید: ندارد.** `.env`، APP_KEY، دادهٔ واقعی و وابستگی‌های پروژه تغییر نکرده‌اند.

## شواهد آزمون محلی

| بررسی | نتیجهٔ نهایی |
|---|---|
| اختصاصی انتشار | **۱۸ تست / ۱۰۹ assertion موفق** |
| کل بک‌اند | **۲۱۸ تست / ۱۰۷۰ assertion موفق** |
| Node فرانت‌اند | **۲۳ تست موفق** |
| TypeScript `tsc --noEmit` | موفق |
| Laravel Pint | ۱۲ فایل این برش؛ بررسی نهایی دو فایل اصلاح‌شده نیز موفق |
| Vite production | موفق، ۲۶۸۸ ماژول؛ هشدار اندازهٔ chunk بیش از 500KB باقی است |
| کنترل فایل‌های build | مرجع assetها و origin تولید صحیح؛ بدون source map و فایل .env؛ URL مصنوعی قبلی حذف شده |
| `git diff --check` | موفق |

بک‌اند روی **PHP 8.5.10 WASM / PHPUnit 12.5.35 / SQLite حافظه‌ای** اجرا شد. برای اجرای مجموعهٔ قبلی، `mockConsoleOutput=false` موقتاً در TestCase تنظیم و بعد دقیقاً برگردانده شد؛ کلید مصنوعی آزمون فقط در محیط فرایند بود. ابزارهای native ساخت فرانت‌اند بیرون مخزن نصب شدند؛ dependencyهای tracked تغییر نکردند.

۱۸ تست اختصاصی شامل scope محتوا/مرحله، بدون URL و بدون HTTP خارجی، تسک دستی، کلیک/replay، rollback منبع/تسک/audit/پیشرفت پروژه و تلاش مجدد، نبود listener، مجوز و حساب غیرفعال، عدم اعطای visibility، conflict نسخه، جعل انتشار/رسید/اتصال، dedup ساخت، مسئول غیرفعال، دور جدید پس از لغو، جزئیات audit، حفظ completed/archived و review، پاک‌کردن ناشر و سازگاری full-resource autosave است.

از تست‌های فرانت‌اند، ۳ تست انتشار **قرارداد ایستای سورس** هستند؛ ۴ تست **اجرایی promise** موفقیت/409/شکست refresh/سایر خطاها را برای helper پوشش می‌دهند. این‌ها تست تعامل واقعی مرورگر نیستند.

**انجام نشده:** MySQL/MariaDB زنده، رقابت چندپردازشی، مرورگر واقعی، هاست اشتراکی یا بلهٔ زنده. SQLite آزمون قفل رقابتی تولید نیست. این نتایج رفع همهٔ موارد ممیزی ACL یا تکمیل قواعد دیگر را اثبات نمی‌کنند.

## نصب بدون SSH/Cron

**در این محیط هیچ استقراری روی هاست یا تغییری در دیتابیس تولید انجام نشده است.**

1. ابتدا روی کپی دادهٔ واقعی آزمایش کنید. نسخهٔ قبلی و انتقال دپارتمان باید طبق راهنمای مربوط کامل باشد. از دیتابیس، کد، `.env` و فایل‌های خصوصی backup قابل بازیابی بگیرید؛ APP_KEY را عوض نکنید.
2. از کنترل‌پنل، دسترسی نوشتن کاربران نسخهٔ قبلی را موقتاً متوقف کنید. بک‌اند و **تمام محتوای `frontend/dist/`** را هماهنگ جایگزین کنید؛ فایل PHP عمومی برای migrate/cache-clear نسازید. SQL/migration جدیدی برای این برش لازم نیست. کل backend را در document root عمومی قرار ندهید.
3. اگر cache قبلی در `backend/bootstrap/cache/` وجود دارد، فقط فایل‌های تولیدشدهٔ `routes*.php`، `events.php` و `config.php` را با File Manager حذف و OPcache/CDN را از امکانات کنترل‌پنل تازه کنید؛ فایل اصلی bootstrap، `.env` و فایل‌های خصوصی را حذف نکنید. autoload استاندارد PSR-4 موجود کلاس‌های جدید را پیدا می‌کند؛ اگر هاست برخلاف تنظیمات مخزن از classmap-authoritative استفاده می‌کند، autoload سازگار باید خارج هاست ساخته و هماهنگ بارگذاری شود.
4. کلاینت را hard reload کنید. با حساب فعال دارای مجوز، محتوا و تسک انتشار آزمایشی بسازید. بدون واردکردن URL روی انتشار بزنید؛ منبع و همان تسک باید با پاسخ موفق تغییر کنند و فعالیت خودکار ثبت شود. نام مشابه روی محتوای دیگر و تسک general نباید تغییر کند.
5. دوباره روی انتشار بزنید/درخواست را تکرار کنید؛ فعالیت تکمیل تکراری نباید ساخته شود. لغو انتشار باید تسک قبلی را completed نگه دارد. در دور بعد تسک جدید بسازید و دوباره انتشار را آزمایش کنید. نسخهٔ قدیمی باید conflict بدهد، نه بازنویسی.
6. با حساب فاقد مجوز و در حالت قطع شبکه، عدم موفقیت ظاهری را بررسی کنید. اگر خطا باقی ماند، نصب را متوقف و لاگ امن سرور را بررسی کنید؛ token، cookie، کلید یا `.env` را در گزارش عمومی نگذارید. سپس دسترسی عادی را باز کنید.

برگشت: به دلیل ذخیرهٔ رسیدها و task kind جدید، برگشت صرفاً فرانت‌اند توصیه نمی‌شود. کد/فرانت‌اند/دیتابیس متناظر را از backup هماهنگ و پس از بررسی داده‌های ثبت‌شدهٔ جدید برگردانید؛ تغییرات جدید کاربران را بی‌بررسی از بین نبرید.

## محدودیت‌های باقی‌مانده

رسید فعلی، آخرین publication را پوشش می‌دهد؛ journal عمومی بادوام، صفحهٔ خطا و retry مستقل پردازش هنوز وجود ندارد. خطای فعلی کل فرمان را rollback می‌کند و با تکرار همان عملیات بازیابی می‌شود. سایر مراحل هنوز از autosave/گردش‌کار قدیمی استفاده می‌کنند. اصلاح زنجیره‌ای رد، حذف cascade تاریخچه هنگام حذف منبع/کاربر، قواعد جلسه/ایده و ACL سراسری همچنان کار بعدی‌اند. تسک قدیمی صرفاً با عنوان «انتشار» عمداً خودکار تبدیل نمی‌شود.
