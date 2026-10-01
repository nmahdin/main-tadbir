# فاز چهارم — قرارداد قابلیت، چرخهٔ عمر داده و کیفیت انتشار

تاریخ: ۱۴۰۵/۰۷/۰۸ (2026-09-30)

این سند مکمل `docs/phase-4-audit.md` است. هدف آن ثبت قراردادهای موجود و مرزهای عملیاتی است؛ نه ادعای آمادگی کامل پلتفرم. مقادیر ناشناخته عمداً `TBD` مانده‌اند تا مالک معتبر آن‌ها را تصویب کند.

## ۱) قابلیت‌های مشترک تثبیت‌شده

| قابلیت | مصرف‌کنندگان واقعی | قرارداد مشترک | تفاوت دامنه‌ای که حفظ می‌شود | تصمیم |
|---|---|---|---|---|
| دیدگاه | task، project، content، idea، meeting | `Comment` و `CommentController` | مجوز مشاهده و مالک parent | حفظ؛ abstraction تازه ممنوع |
| فایل/ضمیمه | DAM و attachment در task/project/content/idea/meeting | `FileManager`، `FileController`، نسخهٔ asset | metadata، parent و مجوز هر دامنه | حفظ |
| آرشیو | project، task، content | `ArchiveController` و tracking | شرط آرشیو و بازیابی هر مدل | حفظ |
| اعلان | task/content و اعلان‌های مستقیم | `NotificationController` | trigger و recipient دامنه‌ای | حفظ |
| فعالیت | چند دامنه و تنظیمات سازمانی | `ActivityLog` و type/details | payload کمینه و غیرحساس هر رویداد | حفظ |
| primitiveهای فضای کار | project، task، content | serviceهای membership/access | policy هر دامنه | حفظ |

هیچ base controller، generic repository یا workflow engine تازه‌ای استخراج نشده است؛ شواهد فعلی برای حذف تفاوت‌های دامنه کافی نیست.

## ۲) تنظیمات سازمانی

منبع قرارداد backend فایل `app/Services/Organization/OrganizationSettings.php` است. storage همان جدول `system_settings` باقی مانده و هر کلید مستقل نوشته می‌شود.

### اصول قرارداد

- registry بسته شامل ۱۳ کلید است؛ کلید ناشناخته `404` می‌گیرد.
- مقدار ذخیره‌شده JSON است و قبل از write با schema کلیدمحور validate می‌شود.
- defaultها در backend تعریف شده‌اند و برای کلید ذخیره‌نشده بازگردانده می‌شوند.
- read عمومی فقط کلیدهای runtime غیرحساس را می‌بیند؛ `security` و `notifications` فقط برای admin یا `settings.manage` قابل خواندن‌اند.
- write عمومی فقط برای admin یا `settings.manage` است. `process_templates` و `workflows` علاوه بر آن به مجوزهای تخصصی موجود واگذار می‌شوند.
- هر write در همان transaction با `organization_setting_updated` audit می‌شود. audit فقط نام کلید و شکل payload را دارد و value را ذخیره نمی‌کند.
- secrets، tokenها، credentialها، driver زیرساخت و endpointهای خصوصی عضو این registry نیستند و باید در secret/config عملیاتی باقی بمانند.
- گزینه‌های UI مثل «امنیت» صرفاً configuration ذخیره‌شده‌اند؛ تا زمانی که policy runtime مشخصی آن‌ها را مصرف نکند، نباید enforcement امنیتی تلقی شوند.

### مالکیت و تغییر schema

- مالک فنی فعلی: تیم backend/API.
- مالک کسب‌وکاری: مدیر سامانه؛ نام شخص حقیقی `TBD` و پیش از rollout الزامی است.
- تغییر allowlist وضعیت‌ها نیازمند بررسی هم‌زمان backend، frontend، automation و migration داده است.
- معیار پذیرش هر کلید تازه: حداقل یک مصرف واقعی، default، validator، ACL خواندن/نوشتن، audit کمینه، تست feature و برنامهٔ سازگاری داده.

## ۳) فهرست automation و integration عملیاتی

| قابلیت | Trigger / شرط | Action و actor | زمان‌بندی و خطا | idempotency / disable / audit | مالک و تصمیم |
|---|---|---|---|---|---|
| همگام‌سازی task انتشار با content | تغییر task/content و شروط workflow موجود | `TaskAutomationProcessor` با actor درخواست فعلی/سیستم موجود | synchronous داخل جریان فعلی؛ failure به caller | guard وضعیت و پردازش تکرارپذیر موجود؛ disable عمومی ندارد؛ activity موجود | فنی: backend، کسب‌وکار: محتوا (`TBD` شخص)؛ **حفظ، async نشود** |
| automation ربات بله | update معتبر webhook و rule allowlist‌شده | system actor محدود و command declarative | outbox و retry محدود موجود؛ SLA `TBD` | dedup/revision conflict، فعال/غیرفعال‌سازی rule و audit موجود | فنی: backend/integration، کسب‌وکار: مدیر ربات (`TBD`)؛ **حفظ** |
| ارسال outbound بله | پیام تولیدشده توسط integration | `Outbox` به Bale API | retry محدود موجود؛ backoff/SLA عملیاتی `TBD` | dedup key و state outbox؛ disable با غیرفعال‌کردن integration؛ log بدون token | همان مالک بالا؛ **حفظ و پایش** |
| automation عمومی تازه | — | — | worker عملیاتی وجود ندارد | قرارداد idempotency عمومی وجود ندارد | **تعویق** |

حذف خودکار، تغییر نقش، پیام خارجی تازه، تغییر مالکیت حساس و تغییر دائمی سند بدون تأیید در این فاز ممنوع است.

## ۴) API، token و webhook

- API فعلی زیر `/api/v1` نسخه‌دار است و از Sanctum و throttleهای route استفاده می‌کند.
- قرارداد API عمومی/شریک هنوز اعلام نشده است؛ پوشش pagination، scope و envelope خطا در همهٔ endpointها باید جداگانه ممیزی شود.
- token موجود token نشست/کاربر است؛ service account یا service token ساخته نشده است.
- webhook بله از secret capability در URL و کنترل‌های داخلی موجود استفاده می‌کند. provider امضای مستندی ارائه نکرده؛ signature پشتیبانی‌نشده ادعا نمی‌شود.
- rotation runbook و owner نام‌دار webhook هنوز `TBD` است؛ بنابراین integration جدید مجاز نیست.

## ۵) ماتریس چرخهٔ عمر داده

هیچ retention عددی یا hard-delete خودکار در این فاز تصویب نشده است.

| داده | archive / delete فعلی | retention | مالک تصمیم | وضعیت |
|---|---|---|---|---|
| project/task/content | archive و بازیابی دامنه‌ای موجود | `TBD` | مدیریت محصول/سازمان، شخص `TBD` | hard-delete خودکار ممنوع |
| comment/activity log | storage عملیاتی | `TBD` | امنیت/حقوقی، شخص `TBD` | نیازمند سیاست حریم خصوصی |
| DAM file/version | حذف/نسخه طبق capability موجود | `TBD` | مالک محتوا + زیرساخت، اشخاص `TBD` | نیازمند هزینه‌سنجی storage |
| notification | storage عملیاتی | `TBD` | محصول، شخص `TBD` | purge خودکار ممنوع |
| Bale update/outbox | dedup/outbox عملیاتی | `TBD` | integration + امنیت، اشخاص `TBD` | token نباید log شود |
| system settings audit | activity کمینه بدون value | `TBD` | امنیت/مدیر سامانه، اشخاص `TBD` | نگهداری value در audit ممنوع |
| CI artifact | artifact نسخه‌دار بر اساس commit | پیش‌فرض repository تا تصویب owner | release engineering، شخص `TBD` | در CI تولید می‌شود؛ deploy نیست |
| backup | runbook مشروط | `TBD` | operations، شخص `TBD` | restore واقعی اثبات نشده |

شرط خروج این محور از حالت `TBD`: نام مالک، مبنای حقوقی/کسب‌وکاری، هزینه، RPO/RTO، روش archive/delete، restore و audit تصمیم.

## ۶) زیرساخت و مقیاس‌پذیری

- queue پیش‌فرض فعلی `sync` است؛ worker و پایش queue عملیاتی اثبات نشده‌اند. کار سنگین تازه نباید به request اضافه شود و queue عمومی نیز تا تأمین worker، retry/backoff، DLQ/failed-jobs handling و owner ایجاد نمی‌شود.
- cache عملیاتی فعلی file است؛ Redis یا cache دامنه‌ای بدون benchmark اضافه نمی‌شود.
- scheduler عملیاتی ثبت‌شده وجود ندارد؛ cron/scheduler حدسی اضافه نمی‌شود.
- index و archive تازه فقط پس از ثبت slow query، cardinality/حجم واقعی، query plan پیش و پس از تغییر و معیار rollback مجاز است.
- معیارهای benchmark محیط واقعی، concurrency هدف، ظرفیت storage و SLO همگی `TBD` هستند.

## ۷) quality gate انتشار

`.github/workflows/quality.yml` روی pull request و push این موارد را اجرا می‌کند:

1. نصب dependencyهای lock‌شده؛
2. frontend lint/typecheck/test/production build؛
3. validation قرارداد Composer و PHPUnit کامل backend؛
4. `migrate:fresh` روی SQLite تمیز به‌عنوان migration compatibility gate؛
5. artifact frontend با نام شامل commit SHA و فایل metadata نسخه.

این workflow **deploy نمی‌کند** و موارد زیر را اثبات نمی‌کند:

- سازگاری migration با snapshot واقعی MySQL و حجم production؛
- backup و restore واقعی؛
- deploy staging/production و health check پس از deploy؛
- rollback artifact، database و config در محیط واقعی؛
- approval و segregation محیط‌ها.

### release gate عملیاتی آینده

تا زمان اجرای ثبت‌شده، release باید دستی مسدود بماند مگر آن‌که owner عملیات این مراحل را با evidence تأیید کند: backup قابل بازیابی، migration rehearsal روی clone غیرحساس، artifact immutable، ثبت نسخهٔ config، deploy staging، smoke/health/auth check، rollout production، post-deploy check و rollback تمرین‌شده. مستندهای `operations.md` و `deployment.md` راهنما هستند، نه مدرک اجرای این مراحل.

## ۸) معیار خروج از foundation فاز چهارم

- API-first شدن مسیرهای legacy و حذف scan/compare/PUT باقیمانده با تست؛
- ownerهای فنی و کسب‌وکاری نام‌دار برای هر capability حساس؛
- restore/rollback/deploy واقعی با timestamp، نتیجه و artifact؛
- benchmark روی MySQL/host واقعی و budget مصوب؛
- تصمیم retention و privacy توسط مالکان معتبر؛
- در صورت نیاز واقعی async: worker عملیاتی، monitoring، idempotency، retry/backoff و failed-job runbook؛
- مستندسازی API عمومی تنها پس از تعیین مصرف‌کننده، scope و rotation.
