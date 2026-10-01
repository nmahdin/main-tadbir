# ممیزی آمادگی فاز چهارم — ۲۰۲۶/۰۹/۳۰

## نتیجهٔ دروازه

**ورود کامل به فاز چهارم در وضعیت فعلی تأیید نمی‌شود.** این تصمیم توقف کل بهبودها نیست؛ فقط مانع آن است که queue، automation عمومی، API token سرویس، webhook عمومی، retention خودکار یا مرکز مدیریت جدید بدون مالک و زیرساخت واقعی ساخته شوند.

شواهد باز بودن پیش‌نیازها:

1. `docs/phase-completion-status.md` هنوز مهاجرت کامل عملیات legacy در ایده، جلسه، دبیرخانه و DAM را Done نمی‌داند. `AppContext.tsx` نیز autosync انتقالی این مجموعه‌ها را نگه داشته است.
2. راهنمای `docs/operations.md` وجود دارد، اما مسئول release/backup، RPO/RTO، مقصد backup و یک restore drill واقعی هنوز تأیید نشده‌اند.
3. محیط نمونه `QUEUE_CONNECTION=sync` دارد، runner دائمی/Cron هاست تأیید نشده و job برنامه‌ای (`ShouldQueue`) یا schedule عملیاتی وجود ندارد.
4. آزمون فعلی backend روی PHP-WASM و SQLite موفق است، اما آزمون MySQL/MariaDB، migration روی کپی دادهٔ واقعی، rollback و deploy staging اجرا نشده است.
5. مالک کسب‌وکاری نام‌دار برای automation، integration، retention و عملیات خطرناک معرفی نشده است.
6. API جست‌وجو/گزارش و correlation ID در فاز ۳ اضافه شده‌اند، اما request count و p95 روی staging/production و monitoring واقعی هنوز در دسترس نیست.

بنابراین دامنهٔ اجرایی مجاز این برش، **زیرساخت کم‌ریسک و برگشت‌پذیر فاز ۴** است: قرارداد تنظیمات موجود، audit و authorization آن، بازیابی امن خطای chunk، pipeline کیفیت بدون deploy، و مستندات قابلیت/چرخهٔ عمر. هیچ automation یا integration تازه‌ای در این برش فعال نمی‌شود.

## وضعیت پیش‌نیازها

| پیش‌نیاز | شاهد | وضعیت |
|---|---|---|
| Router و API client | route resolver، deep linkهای IDدار، API client مرکزی، حفاظت session epoch | پایدار در پوشش تست فعلی؛ E2E کامل همهٔ ماژول‌ها باز |
| Server state | React Query برای فهرست‌های اصلی؛ context انتقالی و autosync محدود برای چند ماژول | **ناتمام** |
| داشبورد و فهرست‌های اصلی | workspace page API، pagination و Action Dashboard | برقرار |
| Approval و اعلان قابل اقدام | API و UI مستقل، conflict/read-all تست‌شده | برقرار در پوشش فعلی |
| جست‌وجو، گزارش و خطا | search ACL-aware، analytics summary، request ID | برقرار؛ telemetry و benchmark محیط واقعی باز |
| ACL backend | permission middleware و service-level checks موجود | برقرار در مسیرهای آزموده؛ ممیزی all-route کامل نیست |
| تست frontend/backend | Node/TypeScript، PHPUnit و E2Eهای موجود | برقرار؛ MySQL/staging باز |
| deploy/backup/rollback | مستند مشروط | **اجرا و تأیید نشده** |
| امنیت High | hardening و تست‌های منفی موجود | نبود High باز با scan/pen-test مستقل اثبات نشده |
| جداسازی demo | demo صریح و lazy؛ production build با `VITE_DEMO_MODE=false` | برقرار |

## موجودی قابلیت‌های مشترک و تکرارها

| قابلیت | پیاده‌سازی‌های فعلی | تکرار/مرز | تصمیم |
|---|---|---|---|
| کاربران/نقش/مجوز | Role/User API، permission catalogue، Access services | کنترل‌ها بین middleware، controller و service توزیع شده‌اند؛ این توزیع همیشه تکرار بد نیست چون policy دامنه متفاوت است | حفظ؛ فقط inventory و تست منفی، نه ساخت God-policy |
| اعلان | `NotificationInbox`، `DomainRecord`، اعلان‌های assignment/meeting و delivery بله | اعلان داخلی و تحویل خارجی قرارداد یکسانی ندارند و نباید اجباری یکی شوند | تعویق abstraction تا تعریف channel/receipt |
| Approval/workflow | ContentReview، ApprovalController، workflowهای frontend و template | workflow محتوا با ایده/نامه یک قرارداد انتقال مصوب ندارد | حفظ تفاوت دامنه‌ای؛ موتور عمومی نسازید |
| فایل/پیوست | `AttachmentComposer` برای فرم‌ها، DAM برای فایل پایدار، task attachment legacy | دو مفهوم متفاوت «draft input» و «دارایی پایدار» وجود دارد | مستندسازی قرارداد؛ حذف اجباری legacy فقط پس از migration |
| نظر | جدول مشترک `comments` و Comment API | UI و subject policy مشترک، permission هر subject دامنه‌ای است | قابلیت مشترک معتبر و موجود |
| فعالیت/audit | `activity_logs` و logهای اختصاصی DAM/Bale | قالب type/action/details آزاد و retention نامشخص است | استاندارد حداقلی و retention نیازمند تصمیم |
| archive | status-based archive برای پروژه/تسک/محتوا و archive دارایی | hard delete و dependency rules در همهٔ دامنه‌ها یکسان نیست | بدون حذف خودکار؛ ماتریس چرخهٔ عمر لازم |
| وضعیت/اولویت | تنظیمات UI در `system_settings`؛ allowlistهای backend در services/requests | بعضی تنظیمات نمایشی‌اند و backend هنوز مقادیر hardcoded دارد | جلوگیری از ادعای status دلخواه؛ هم‌ترازی مرحله‌ای |
| جست‌وجو/فیلتر | global search سه دامنه؛ WorkspaceListRequest | search عمومی برای DAM/نامه/ایده deep link/ACL یکسان ندارد | دامنه فعلی حفظ؛ توسعه با قرارداد جدا |
| import/export | export عمومی/فرایند import قابل پایش وجود ندارد | نیاز، فرمت، مالک و retention تعیین نشده | تعویق |
| تنظیمات سازمانی | `SystemSettingController` و SettingsView | registry/schema متمرکز و audit همهٔ تغییرات کامل نیست | **اجرا در این برش** |

## وابستگی‌های hardcoded

- وضعیت تسک در `TaskOperations::STATUSES` و چند FormRequest ثابت است؛ `task_statuses` فعلاً بیشتر نقش label/order دارد و اضافه‌کردن ID دلخواه، workflow backend جدید ایجاد نمی‌کند.
- وضعیت DAM در controller allowlist ثابت است؛ وضعیت‌های تنظیمی نباید خارج از این قرارداد پذیرفته شوند.
- وزن workload در `UserResource` ثابت و موقت است؛ ظرفیت نقش/کاربر مدل داده ندارد.
- انواع اعلان، وضعیت پروژه/کاربر و ContentReview در کد allowlist شده‌اند.
- timezone گزارش از `config('app.timezone')` می‌آید؛ timezone نمایشی سازمان ساعت backend را عوض نمی‌کند.
- سقف‌های `per_page` و selectorهای ۱۰۰تایی وجود دارند؛ selector حجیم هنوز search-as-you-type سروری سراسری ندارد.
- محدودیت upload در چند request/server config است و policy سازمانی واحد و قابل تنظیم نشده است.

این موارد همگی کاندید پیکربندی نیستند. تغییر status عملیاتی یا امنیتی بدون migration داده و تعریف transition، صرفاً افزودن یک dropdown نیست.

## workflow و automation موجود

| مورد | trigger/action | کنترل فعلی | شکاف |
|---|---|---|---|
| انتشار محتوا → تکمیل task انتشار | event `ContentPublished` → `TaskAutomationProcessor` | transaction، event_id، processed receipt و no-op تکراری | synchronous است؛ latency حجیم اندازه‌گیری نشده |
| assignment و جلسه | فرمان دامنه → اعلان داخلی/بله | permission، dedupeهای دامنه‌ای | failure خارجی با queue استاندارد یکپارچه نیست |
| Bale outbox | enqueue داخلی → tick/webhook/poll | deduplication key، status، attempt محدود، runtime lock | worker/Cron عمومی نیست؛ وضعیت unknown نیاز رسیدگی انسانی دارد |
| automation بله | command/text allowlist → action محدود | revision conflict، validation، permission در زمان اجرا، rate limit، audit | فقط دامنه بله؛ موتور automation عمومی نیست |

هیچ trigger جدید برای یادآوری SLA، escalation، حذف، تغییر مالکیت یا ارسال خارجی ایجاد نمی‌شود تا owner، runner، retry، idempotency و disable policy مصوب شود.

## API و integration

- API داخلی نسخه‌دار `/api/v1` و Sanctum session/token دارد؛ token فعلی به User وابسته است و service account سازمانی محسوب نمی‌شود.
- pagination/filter در فهرست‌های اصلی وجود دارد، اما قرارداد OpenAPI عمومی، deprecation policy و consumer registry وجود ندارد.
- integration واقعی موجود بله است. توکن رمز‌شده نگهداری می‌شود و URL webhook از secret جدا استفاده می‌کند؛ مستندات بله signature header بومی ارائه نمی‌دهد، پس URL capability نباید «امضای provider» نامیده شود.
- endpoint عمومی تازه، service token، webhook عمومی یا import در این برش ساخته نمی‌شود. نیاز مصرف‌کننده، scope، rotation owner و SLA مشخص نشده است.

## دیتابیس، زیرساخت و رشد

- ۳۵ migration و جدول‌های `jobs`/`failed_jobs` موجودند، اما وجود جدول به معنی worker عملیاتی نیست.
- جدول‌های پررشد محتمل: activity logs، comments، notifications/domain records، DAM activities/versions/files، workspace records، Bale inbox/outbox و task history.
- indexهای مرتبط با review queue، comments، DAM relations/activity، Bale dedupe/outbox و session موجودند. index تازه بدون query log/EXPLAIN MySQL اضافه نمی‌شود.
- Approval candidate scan و برخی DAM/table مسیرها هنوز نیاز benchmark حجیم دارند.
- فایل‌های private همراه DB باید backup هماهنگ شوند؛ DB-only restore کافی نیست.
- cache/session/file و queue sync برای یک هاست کوچک قابل توضیح‌اند، ولی ظرفیت هم‌زمانی و failover تعریف نشده است.

## وابستگی خارجی و قطع سرویس

| وابستگی | رفتار/ریسک | اقدام لازم |
|---|---|---|
| Bale API | timeout/rate limit/unknown send؛ بدون runner دائمی تحویل تضمین‌شده نیست | runbook قطع سرویس و تعیین owner outbox |
| دیتابیس هاست | engine و collation واقعی آزموده نشده | staging با کپی anonymized و EXPLAIN |
| filesystem خصوصی | DB به تنهایی فایل را بازیابی نمی‌کند | backup/restore هماهنگ و checksum |
| GitHub/CI پیشنهادی | availability و supply-chain action | حداقل permission و pin/بازبینی دوره‌ای |
| فونت | local bundled | وابستگی runtime خارجی ندارد |

## تصمیم‌های نیازمند محصول/سازمان

1. نام مالک release، backup، security incident و جانشین هرکدام.
2. RPO/RTO و retention برای DB، فایل، audit، comment، notification و Bale transport.
3. آیا service account/API عمومی واقعاً مصرف‌کننده دارد؛ consumer، scope و expiry آن چیست.
4. کدام SLA و escalation ارزش کسب‌وکاری دارد و actor سیستمی آن کیست.
5. آیا statusها فقط label قابل تنظیم‌اند یا transitionهای دامنه نیز باید قابل پیکربندی شوند.
6. archive/hard-delete هر دامنه، legal hold و حق export چه سیاستی دارد.
7. ظرفیت هدف: کاربران هم‌زمان، تعداد پروژه/task/content/file و رشد ماهانه.
8. staging و روش anonymization دادهٔ تولید.

## برنامهٔ اقدام و مالکیت

مالک‌های کسب‌وکاری زیر «نقش پاسخ‌گو» هستند و تا معرفی شخص، کارهای وابسته Done نمی‌شوند.

| اقدام | مالک فنی | مالک کسب‌وکاری | ریسک | وابستگی | معیار موفقیت | تصمیم |
|---|---|---|---|---|---|---|
| registry/schema/audit تنظیمات موجود | تیم backend/platform | مدیر سامانه | متوسط | قرارداد فعلی Settings | رد payload نامعتبر، منع کاربر عادی، log بدون مقدار حساس | **اجرا** |
| بازیابی خطای chunk frontend | تیم frontend | مالک محصول | کم | ErrorBoundary موجود | پیام قابل فهم و reload نسخه بدون loop خودکار | **اجرا** |
| CI کیفیت بدون deploy | مسئول release/DevOps | مالک release | کم | GitHub Actions | typecheck/test/build و PHPUnit قبل از merge | **اجرا** |
| مستند قابلیت‌های مشترک | tech lead | مالک محصول | کم | inventory فعلی | API/permission/ماژول/محدودیت روشن | **اجرا** |
| ماتریس چرخهٔ عمر با مقادیر TBD | data/security owner | مالکان فرایند | کم | تصمیم retention | هیچ مقدار حدسی به‌عنوان policy ثبت نشود | **اجرا** |
| حذف autosync legacy | تیم frontend/backend | مالکان ایده/دبیرخانه/DAM | بالا | commandهای API-first و تست failure | صفر mutation متکی به تغییر محلی | **تعویق تا بستن پیش‌نیاز** |
| queue عمومی و scheduler | DevOps/backend | مالک عملیات | بالا | worker/Cron، alert، runbook | retry/idempotency/failure drill | **تعویق** |
| automation SLA/escalation | backend | مالک فرایند نام‌دار | بالا | queue + قواعد مصوب | trigger/disable/audit/retry تست‌شده | **تعویق** |
| service account/API token | security/backend | مالک integration | بالا | consumer واقعی و rotation policy | scope/expiry/revoke/audit | **تعویق** |
| webhook عمومی جدید | security/backend | مالک integration | بالا | provider signature/idempotency | replay/rate/validation tests | **تعویق** |
| retention/hard delete خودکار | data owner/backend | حقوقی/مالکان داده | بسیار بالا | سیاست مصوب و restore | legal hold/audit/backup سازگار | **حذف از این برش** |
| index/cache جدید | backend/DBA | مالک ظرفیت | متوسط | query log و EXPLAIN MySQL | بهبود p95 قابل اندازه‌گیری | **تعویق** |
| مرکز مدیریت جامع | frontend/backend | مدیر سامانه | متوسط | دادهٔ job/monitoring واقعی | عملیات قابل اقدام بدون افشای secret | **تعویق** |

## معیار خروج از gate فاز چهارم کامل

- `phase-completion-status` با شواهد تازه، حذف وابستگی mutationهای legacy به autosync و تأیید مالک به‌روزرسانی شود.
- staging واقعی با دادهٔ anonymized، migration و smoke مجاز/غیرمجاز اجرا شود.
- restore هماهنگ DB+files و rollback نسخه با زمان واقعی ثبت شود.
- runner queue/Cron یا تصمیم رسمی «بدون automation async» وجود داشته باشد.
- ownerهای نام‌دار و سیاست retention/RPO/RTO ثبت شوند.
- benchmark حجم/کاربر هدف و p95 endpointهای اصلی موجود باشد.

تا آن زمان، این سند «ممیزی و اجرای foundation» است، نه اعلام Done فاز چهارم یا مجوز استقرار تولید.
