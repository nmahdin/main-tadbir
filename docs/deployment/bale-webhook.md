# استقرار Webhook و runner ربات بله

آخرین بازبینی: 2026-09-30

## مدل امنیتی

بله برای Webhook فعلی header امضاشدهٔ مستندی ارائه نکرده است. تدبیر از URL capability تصادفی مستقل از token استفاده می‌کند:

- route پایه بدون capability پاسخ بسته می‌دهد؛
- URL کامل فقط در backend ساخته، رمزگذاری و با `setWebhook` ثبت می‌شود؛
- URL کامل، token، payload و linking code نباید در access log، APM، WAF، analytics یا تیکت ثبت شوند؛
- تطبیق `getWebhookInfo` ثبت مقصد را ثابت می‌کند، نه دریافت واقعی پیام؛
- rotation، capability قبلی را پس از ثبت مقصد تازه از مدار خارج می‌کند.

اگر زیرساخت نمی‌تواند URL محرمانه را از log و گزارش محافظت کند، فعال‌سازی production مجاز نیست.

## پیش‌نیاز

- `APP_DEBUG=false`؛
- `APP_URL` یا `BALE_PUBLIC_BASE_URL` برابر آدرس HTTPS واقعی backend؛
- document root فقط `backend/public`؛
- خروجی HTTPS به Bale API؛
- حفظ `APP_KEY` برای token و capability رمزگذاری‌شده؛
- cache lock قابل اتکا در محیط واقعی؛
- نصب migration نشست یک‌بارمصرف پنل؛ در نبود CLI فقط پس از backup از `bale-panel-session.mysql.sql` استفاده شود؛
- backup هماهنگ DB و config پیش از تغییر.

```dotenv
BALE_PANEL_URL=https://tadbir.morvarid-daron.ir/
BALE_PUBLIC_BASE_URL=https://api-tadbir.morvarid-daron.ir
```

آدرس base نباید `/api/v1`، query، fragment یا credential داشته باشد.

## فعال‌سازی

1. با حساب فعال دارای `settings.manage` وارد شوید.
2. تنظیمات ← ربات بله ← اتصال را باز کنید.
3. token را وارد، ربات را فعال و «ذخیره و فعال‌سازی خودکار» را اجرا کنید.
4. UI باید آزمون token، ثبت Webhook و تطبیق remote را موفق نشان دهد.
5. در گفت‌وگوی خصوصی ربات `/start` ارسال کنید.
6. در تب وضعیت، «آخرین دریافت» باید بدون refresh دستی به‌روز شود.
7. در پروفایل کاربر کد اتصال بگیرید، در ربات ارسال کنید و تغییر خودکار وضعیت اتصال را بررسی کنید.

هیچ دکمهٔ دریافت دستی، پردازش یک نوبت یا تخلیهٔ دستی صف وجود ندارد.

## runner تلاش مجدد

Webhook دریافت را مستقل از Cron انجام می‌دهد، اما تخلیهٔ پیام‌هایی که پس از lock contention یا 429 در Outbox مانده‌اند به runner نیاز دارد.

### سرور دارای CLI/Cron

schedule تعریف‌شده در `backend/routes/console.php` را با scheduler استاندارد Laravel اجرا کنید:

```cron
* * * * * cd /ABSOLUTE/PATH/TO/backend && php artisan schedule:run >> /dev/null 2>&1
```

مسیر واقعی و user اجرای PHP باید توسط عملیات تأیید شود.

### هاست بدون Cron

یک secret مستقل حداقل ۳۲ نویسه‌ای در `BALE_RUNNER_SECRET` قرار دهید و زمان‌بند HTTPS مورد اعتماد را تنظیم کنید:

```http
POST https://YOUR-API-DOMAIN/api/v1/bot/bale/tick
Authorization: Bearer <BALE_RUNNER_SECRET>
Accept: application/json
```

secret را در URL/query نگذارید و token بات را به سرویس زمان‌بند ندهید. در Webhook mode این endpoint فقط Outbox/cleanup را اجرا می‌کند و `getUpdates` فراخوانی نمی‌کند.

## معیار پذیرش

- connection status متصل؛
- remote Webhook منطبق؛
- `/start` زمان آخرین دریافت را تغییر دهد؛
- runner زمان heartbeat را تغییر دهد؛
- اعلان آزمایشی به حساب متصل برسد؛
- pending کنترل‌شده پس از runner ارسال شود؛
- unknown خودکار تکرار نشود؛
- callback ابتدا حذف best-effort پیام قبلی و سپس ارسال صفحهٔ جدید را انجام دهد؛ شکست قطعی حذف نباید صفحهٔ جدید را متوقف کند؛
- «ورود مستقیم به پنل» داخل Mini App بدون رمز انجام و همان پیوند برای بار دوم/پس از ۱۰ دقیقه رد شود؛
- token، URL کامل capability، credential ورود پنل، payload و chat id در پاسخ API/log قابل مشاهده نباشند.

## عیب‌یابی

| نشانه | بررسی امن |
|---|---|
| token نامعتبر | token را از مدیریت رسمی ربات دوباره بگیرید؛ response خام را log نکنید. |
| Webhook mismatch | `BALE_PUBLIC_BASE_URL` و cache config را بررسی و از UI «ترمیم Webhook» را اجرا کنید. |
| آخرین دریافت تغییر نمی‌کند | دسترسی عمومی HTTPS، route/proxy و access log امن را بررسی کنید؛ URL کامل را در تیکت نفرستید. |
| pending باقی می‌ماند | heartbeat runner و `BALE_RUNNER_SECRET` یا Cron واقعی را بررسی کنید. |
| unknown دیده می‌شود | گفت‌وگو را بررسی کنید؛ retry کور نکنید چون provider ممکن است پیام را پذیرفته باشد. |
| 503 و lock | اجرای هم‌زمان در حال پردازش است؛ runner بعدی باید ادامه دهد. |

## rollback

- ابتدا ورودی/ارسال را متوقف و evidence بدون secret ثبت کنید.
- در صورت امکان از UI اتصال را حذف کنید تا `deleteWebhook` remote تأیید شود.
- اگر provider در دسترس نیست، حذف محلی فقط با تصمیم عملیاتی انجام شود؛ این کار token را نزد provider باطل نمی‌کند.
- token را در مدیریت رسمی ربات rotate/revoke کنید.
- code/config/DB را فقط با backup هماهنگ برگردانید؛ از دست‌رفتن `APP_KEY` credentialهای رمزگذاری‌شده را غیرقابل استفاده می‌کند.

تست fake و این راهنما اثبات نصب روی هاست نیستند؛ نتیجهٔ Webhook و runner واقعی باید با زمان، owner و release ثبت شود.
