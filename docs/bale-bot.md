# ربات بله — قرارداد جاری محصول و عملیات

آخرین بازبینی: 2026-09-30

این سند وضعیت جاری کد است. اجرای موفق تست fake یا ثبت schedule در کد، اثبات فعال‌بودن آن روی هاست تولید نیست.

## ۱) دامنهٔ قابلیت

قابلیت‌های موجود:

- نگهداری رمزگذاری‌شدهٔ توکن و آزمون واقعی `getMe`/`getWebhookInfo`؛
- دریافت پیام با Webhook دارای capability تصادفی مستقل از توکن؛
- اتصال حساب تدبیر به گفت‌وگوی خصوصی بله با کد کوتاه‌عمر و یک‌بارمصرف؛
- ورود مستقیم به پنل در قالب Mini App با credential یک‌بارمصرف، بدون واردکردن نام کاربری/رمز؛
- ورود و بازیابی رمز با کد ارسالی به حساب بلهٔ از قبل متصل؛
- اعلان داخلی و تلاش ارسال متناظر در بله؛
- منوی وظایف، جلسات و دارایی‌ها مطابق مجوز جاری کاربر؛
- گزارش و تغییر کنترل‌شدهٔ وظیفه با پیش‌نمایش، تأیید و کنترل تعارض؛
- ثبت دارایی متنی و ردیف جدول با ACL مشترک پنل/بات؛
- قواعد declarative برای فرمان یا متن دقیق و actionهای allowlist‌شده؛
- Outbox رمزگذاری‌شده، deduplication، retry محدود برای rate limit و توقف retry برای نتیجهٔ مبهم؛
- گزارش مدیریتی اتصال، heartbeat، شمارندهٔ صف و خطاهای اخیر بدون نمایش payload یا مقصد؛
- حذف best-effort پیام قبلی پس از کلیک callback و ارسال صفحهٔ تازه، برای جلوگیری از انباشته‌شدن منوها؛
- فیلتر منوی اصلی بر اساس همان permission gate مشترک با middleware مسیرهای HTTP.

محدودیت‌های آگاهانه:

- اجرای PHP/SQL/URL دلخواه در قواعد وجود ندارد.
- فایل چت مستقیماً وارد DAM نمی‌شود؛ مسیر فایل، فرم احرازهویت‌شدهٔ سامانه است.
- پیام با نتیجهٔ `unknown` خودکار تکرار نمی‌شود تا پیام تکراری ساخته نشود.
- service account، امضای provider و تضمین exactly-once ادعا نمی‌شود.
- یادآوری حساس جلسه همچنان پیش‌نمایش و تأیید مدیر می‌خواهد. حذف «حالت دستی» مربوط به transport و تخلیهٔ صف است، نه حذف تأیید عملیات حساس.
- ترجیح اعلان به تفکیک دسته هنوز مدل داده و تصمیم محصول مصوب ندارد؛ فعلاً روشن/خاموش کلی هر حساب است.

## ۲) معماری دریافت و ارسال

### دریافت

در محصول، دریافت عادی فقط با Webhook خودکار ارائه می‌شود:

1. مدیر توکن را در تب «اتصال» ذخیره می‌کند.
2. backend توکن را آزمایش می‌کند.
3. backend یک capability تصادفی ۲۵۶بیتی می‌سازد و URL کامل را خودش با `setWebhook` ثبت می‌کند.
4. مسیر بدون capability بسته می‌ماند.
5. هر update با قفل runtime، اعتبارسنجی اندازه/JSON/type و deduplication پردازش می‌شود.

توکن در URL ورودی نیست. مستند رسمی بله امضای درخواست یا secret header ارائه نکرده است؛ این طراحی URL capability است و نباید «امضای بله» نامیده شود. URL کامل نباید در access log، APM، WAF، analytics یا تیکت پشتیبانی ثبت شود.

`short_polling` فقط primitive داخلی سازگاری و تست است و کنترل دستی در UI ندارد. هنگام Webhook، runner هیچ `getUpdates` اجرا نمی‌کند.

### ارسال

اعلان ابتدا داخل تدبیر ثبت می‌شود. Outbox سپس با رعایت این قواعد ارسال می‌کند:

- مجوز، وضعیت حساب، اتصال، مالکیت/عضویت و ترجیح اعلان درست پیش از ارسال دوباره بررسی می‌شوند؛
- `deduplication_key` از ایجاد پیام محلی تکراری جلوگیری می‌کند؛
- 429 با `retry_after` و حداکثر تلاش موجود به `pending` برمی‌گردد؛
- خطای قطعی به `failed` می‌رود؛
- timeout یا پاسخ غیرقابل تأیید به `unknown` می‌رود و retry نمی‌شود؛
- ارسال نیمه‌تمام قدیمی به `unknown` می‌رود، نه `pending`؛
- payload و chat id از API مدیریتی خارج نمی‌شوند.

ارسال اولیه بعد از commit همان درخواست تلاش می‌شود. پیام باقی‌مانده به runner زمان‌بندی‌شده وابسته است؛ دریافت Webhook به‌تنهایی تضمین تخلیهٔ Outbox در زمان سکوت کاربران نیست.

## ۳) runner خودکار

کد دو روش هم‌ارز برای اجرای bounded tick دارد:

### روش A — Laravel Scheduler

`routes/console.php` فرمان `bale:tick` را هر دقیقه با `withoutOverlapping` ثبت می‌کند. روی سروری که Cron/CLI دارد باید scheduler استاندارد Laravel واقعاً اجرا شود، برای مثال پس از تأیید مسیرها توسط عملیات:

```cron
* * * * * cd /ABSOLUTE/PATH/TO/backend && php artisan schedule:run >> /dev/null 2>&1
```

مسیر نمونه نباید حدس زده یا بدون تأیید روی تولید ثبت شود.

### روش B — زمان‌بند HTTPS خارجی

برای هاست بدون Cron، یک secret مستقل حداقل ۳۲ نویسه‌ای در `BALE_RUNNER_SECRET` قرار می‌گیرد و سرویس زمان‌بند مورد اعتماد این درخواست را ارسال می‌کند:

```http
POST https://YOUR-API-DOMAIN/api/v1/bot/bale/tick
Authorization: Bearer <BALE_RUNNER_SECRET>
Accept: application/json
```

- secret در query string یا URL قرار نگیرد.
- توکن بات به سرویس زمان‌بند داده نشود.
- endpoint payload، update، destination یا method از caller نمی‌پذیرد.
- route دارای throttle است و tick با قفل مشترک و بودجهٔ محدود اجرا می‌شود.
- در Webhook mode فقط Outbox و cleanup انجام می‌شود و `getUpdates` فراخوانی نمی‌شود.

پنل، «ثبت runner در کد» را از «heartbeat موفق اخیر» جدا نشان می‌دهد. وضعیت سبز فقط پس از tick موفق اخیر است. نبود heartbeat یعنی retry کاملاً خودکار در محیط واقعی هنوز اثبات نشده است.

## ۴) تجربهٔ مدیر

تنظیمات ← ربات بله چهار تب دارد:

1. **وضعیت:** سلامت اتصال، تطبیق Webhook، heartbeat runner، حساب‌های متصل و آخرین دریافت/ارسال؛
2. **اتصال:** توکن، فعال/غیرفعال‌سازی، آزمون فنی و ترمیم/rotation آدرس Webhook؛
3. **خودکارسازی:** فهرست فشردهٔ قواعد، فیلتر فعال/غیرفعال، ویرایش modal، پیش‌نمایش بدون اجرا و ذخیرهٔ یکجای تغییرات؛
4. **گزارش ارسال:** شمارندهٔ وضعیت‌ها، قدیمی‌ترین pending و خطاهای اخیر با متن فارسی.

دکمهٔ «پردازش یک نوبت» یا «ارسال صف» وجود ندارد. pending را runner تخلیه می‌کند. `unknown` برای بررسی نمایش داده می‌شود و دکمهٔ retry کور ندارد.

توکن پس از شکست عملیات در input باقی می‌ماند تا مدیر مجبور به ورود دوباره نباشد؛ پس از موفقیت پاک می‌شود. توکن ذخیره‌شده هیچ‌گاه به مرورگر بازگردانده نمی‌شود.

## ۵) تجربهٔ کاربر

پروفایل ← «اتصال و اعلان‌های بله»:

1. کاربر «دریافت کد اتصال» را می‌زند.
2. کد و countdown نمایش داده می‌شود و امکان کپی دارد.
3. کاربر کد را فقط در گفت‌وگوی خصوصی ربات رسمی می‌فرستد.
4. پنل تا انقضای کد هر سه ثانیه وضعیت را خودکار بررسی می‌کند.
5. پس از اتصال، وضعیت بدون دکمهٔ refresh به «متصل» تغییر می‌کند.

کد جدید، کد قبلی را باطل می‌کند. کد خام در DB ذخیره نمی‌شود. پیام گروهی، کد منقضی، تلاش بیش از حد و تصاحب حساب دیگر رد می‌شوند.

کاربر متصل می‌تواند اعلان کلی بله را روشن/خاموش و یک اعلان آزمایشی مشخص ارسال کند. خاموش‌کردن بله، اعلان داخلی تدبیر را حذف نمی‌کند.

### ورود مستقیم و Mini App

منوی اصلی فقط بخش‌هایی را نشان می‌دهد که permission gate مشترک با middleware برای کاربر مجاز می‌داند و همیشه گزینهٔ «ورود مستقیم به پنل» دارد. دکمه از فیلد رسمی `web_app` بله استفاده می‌کند:

1. backend برای همان `bale_user_link` یک token تصادفی ۲۵۶بیتی می‌سازد؛
2. فقط HMAC token با عمر ۱۰ دقیقه در `bale_panel_sessions` ذخیره می‌شود؛
3. Outbox فقط intent داخلی مقصد را نگه می‌دارد و URL/token خام درست پیش از درخواست provider در حافظه ساخته می‌شود؛
4. token خام در fragment آدرس قرار می‌گیرد تا به web server فرانت‌اند ارسال نشود؛
5. SPA fragment را پیش از هر درخواست از address bar حذف می‌کند؛
6. token با POST و CSRF به backend تحویل، یک‌بار مصرف و حذف می‌شود؛
7. backend session را regenerate و cookie ورود را خودش تنظیم می‌کند.

ساخت منوی جدید، credential قبلی همان حساب بله را باطل می‌کند. قطع اتصال، حذف کاربر، مسدودشدن حساب، انقضا و استفادهٔ قبلی نیز ورود را رد می‌کنند. token در query string، localStorage یا DB به‌صورت خام نگهداری نمی‌شود. برای کلاینت‌های قدیمی که Mini App را باز نمی‌کنند، دکمهٔ جداگانهٔ مرورگر با همان credential یک‌بارمصرف نمایش داده می‌شود.

### رفتار پیام‌های منویی

برای callback دارای `message_id`، عملیات `deleteMessage` قبل از ارسال صفحهٔ تازه در Outbox قرار می‌گیرد. حذف پیام طبق محدودیت provider best-effort است: شکست حذف پیام قدیمی نباید صفحهٔ جدید را متوقف کند، مگر rate limit سراسری provider که کل tick را به تعویق می‌اندازد. پاسخ `answerCallbackQuery` همچنان مستقل انجام می‌شود.

## ۶) قرارداد خودکارسازی

هر قاعده شامل این موارد است:

- `id` UUID و revision برای conflict؛
- نام مدیریتی؛
- trigger از نوع command یا exact text؛
- enabled؛
- action از allowlist؛
- پارامتر محدود action مانند متن پاسخ یا جدول/دپارتمان؛
- آخرین وضعیت outbound قابل انتساب در API مدیریتی.

قواعد امنیتی:

- `/start`، `/menu`، `/cancel` و `/help` رزرو هستند.
- فرمان فقط الگوی محدود انگلیسی دارد؛ متن با یکسان‌سازی فاصله و «ی/ک» مقایسه می‌شود.
- trigger تکراری رد می‌شود.
- فرم فعال، متن را به automation جدید تفسیر نمی‌کند.
- کاربر غیرفعال یا فاقد مجوز نمی‌تواند action را اجرا کند.
- ACL جدول و عضویت دپارتمان هنگام شروع و پیش از commit دوباره بررسی می‌شود.
- تغییر یا غیرفعال‌کردن قاعده، پیام queued قدیمی وابسته به آن را نامعتبر می‌کند.
- تغییرات UI محلی‌اند و همهٔ قواعد با یک save و revision ذخیره می‌شوند.
- پیش‌نمایش UI هیچ پیام یا داده‌ای ثبت نمی‌کند؛ validation backend مرجع نهایی است.

## ۷) امنیت و audit

- توکن و capability با `APP_KEY` رمزگذاری می‌شوند؛ backup بدون APP_KEY برای این داده‌ها کافی نیست.
- تغییر token، اتصال، rotation Webhook، قطع اتصال و تغییر قواعد audit می‌شود.
- eventهای HTTP عمومی Laravel برای client خصوصی بله منتشر نمی‌شوند تا URL حاوی token وارد ابزارهای عمومی نشود.
- خطای remote به code امن تبدیل می‌شود؛ response body و description provider ذخیره نمی‌شوند.
- تنظیم token و automation فقط برای حساب فعال دارای `settings.manage` است. routeهای تنظیمات، یادآوری جلسه و اتصال جدول به‌ترتیب از middlewareهای `settings.manage`، `thinktank.manage_meetings` و `assets.manage_access` عبور می‌کنند.
- `UserPermissionGate` منبع مشترک coarse permission برای middleware HTTP و actionهای بله است؛ ownership، membership و transition همچنان در service دامنه کنترل می‌شوند.
- حساب و عملیات بات همیشه ACL جاری backend را دوباره بررسی می‌کنند؛ اتصال بله یا Mini App مجوز جدید نمی‌سازد و منوی فاقد مجوز نمایش داده نمی‌شود.
- raw update و متن کد اتصال وارد inbox audit نمی‌شود.

## ۸) فعال‌سازی محیط

مقادیر عمومی:

```dotenv
BALE_PANEL_URL=https://tadbir.morvarid-daron.ir/
BALE_PUBLIC_BASE_URL=https://api-tadbir.morvarid-daron.ir
# فقط برای runner HTTPS خارجی؛ یک secret تصادفی مستقل از token:
BALE_RUNNER_SECRET=
```

ترتیب پذیرش:

1. حفظ `APP_KEY` و backup هماهنگ DB/config؛
2. `APP_DEBUG=false` و document root برابر `backend/public`؛
3. HTTPS ورودی و خروجی به Bale API؛
4. اجرای migrationهای موجود، شامل `2026_09_30_000002_create_bale_panel_sessions_table`، روی clone و سپس محیط هدف طبق فرایند مصوب؛ برای هاست بدون CLI فایل `docs/deployment/bale-panel-session.mysql.sql` فقط پس از backup و بررسی schema موجود است؛
5. ثبت توکن و فعال‌سازی خودکار از UI؛
6. ارسال `/start` و مشاهدهٔ آخرین دریافت؛
7. اتصال یک حساب آزمایشی با کد و مشاهدهٔ تغییر خودکار UI؛
8. ارسال اعلان آزمایشی؛
9. اجرای runner و مشاهدهٔ heartbeat اخیر؛
10. ساخت سناریوی کنترل‌شدهٔ pending و اثبات تخلیهٔ آن؛
11. بررسی `failed` و `unknown` بدون نمایش token/payload/destination در UI یا log.

ثبت schedule در مخزن، مراحل ۶ تا ۱۰ را اثبات نمی‌کند. هاست فعلی طبق مستندات قبلی فاقد Cron/SSH فرض شده است؛ بنابراین مالک عملیات باید runner HTTPS واقعی یا قابلیت کنترل‌پنل را تأیید کند.

## ۹) تست

```bash
cd backend
php artisan test --filter=Bale
php artisan test

cd ../frontend
npm run typecheck
npm test
npm run build
```

تست backend API بله را fake می‌کند و نباید token واقعی داشته باشد. موارد کلیدی شامل ACL، عدم افشای secret، Webhook، replay، اتصال حساب، قفل، conflict، rate limit، ambiguous send، runner در حالت Webhook و automation است.

آزمون‌های زیر همچنان محیط واقعی می‌خواهند:

- Webhook با ربات واقعی؛
- heartbeat زمان‌بند واقعی هاست؛
- قفل چندفرایندی؛
- MySQL/MariaDB مقصد؛
- لاگ‌های reverse proxy/WAF/APM؛
- قطعی و rate limit کنترل‌شدهٔ provider.

## ۱۰) فایل‌های مرجع

- `backend/app/Bot/Bale/` — transport، پردازش، Outbox و automation؛
- `backend/app/Http/Controllers/Api/V1/Bale/` — API مدیریتی/کاربری؛
- `backend/routes/console.php` — فرمان و schedule؛
- `frontend/src/components/bale/` — پنل مدیر و حساب کاربر؛
- `docs/deployment/bale-webhook.md` — مدل امنیتی Webhook؛
- `docs/deployment/bale-menus-and-automations.md` — قرارداد منو و قواعد.
