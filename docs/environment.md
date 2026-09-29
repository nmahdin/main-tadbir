# فایل‌های محیط تدبیر

## کدام فایل را استفاده کنم؟

| کاربرد | نمونهٔ قابل‌پوش | نام فایل در محل اجرا |
|---|---|---|
| بک‌اند هاست واقعی، MySQL و HTTPS | `backend/.env.example` | `.env` کنار `artisan` |
| بک‌اند محلی Windows/Linux با SQLite | `backend/.env.local.example` | `.env` کنار `artisan` |
| build فرانت‌اند برای دامنه‌های واقعی | `frontend/.env.production.example` | `frontend/.env.production` روی دستگاه build |
| توسعهٔ فرانت‌اند با proxy محلی | `frontend/.env.example` | `frontend/.env` |

مثال‌ها عمداً فاقد secret هستند. `.env` واقعی، نسخه‌های محیطی و backupهای آن در Git نادیده گرفته می‌شوند؛ فقط فایل‌های با پسوند `.example` عمومی‌اند. هیچ رمز ثابت مشترک یا APP_KEY عمومی برای نصب‌ها وجود ندارد.

**اگر `.env` دارید، آن را جایگزین نکنید.** APP_KEY، اتصال DB و تنظیمات نصب را حفظ و فقط مقادیر لازم را اضافه/اصلاح کنید. قرار دادن نمونه در Git، فایل خصوصیِ هاست را خودکار نمی‌سازد یا تغییر نمی‌دهد.

## رفع خطای سیدر در محیط محلی فعلی شما

اگر مثل خطای گزارش‌شده از SQLite روی Windows استفاده می‌کنید، نمونهٔ محلی مناسب شماست؛ نمونهٔ production به دیتابیس MySQL نیاز دارد. در `.env` موجود، سه مقدار زیر را خصوصی و با رمزهای متفاوت پر کنید:

- `SEED_MAHDI_PASSWORD` برای مهدی نبوی، نام کاربری `mahdi.nabavi`
- `SEED_EMAD_PASSWORD` برای عماد هندی، نام کاربری `emad.hendi`
- `SEED_AMIRALI_PASSWORD` برای امیرعلی شیرازی، نام کاربری `amirali.shirazi`

حداقل ۱۲ نویسه و حداکثر ۷۲ بایت؛ با رعایت قالب dotenv داخل کوتیشن قرار دهید. مقدار خالی/placeholder را به‌عنوان رمز استفاده نکنید. برای حساب‌های از قبل موجود، سیدر رمز یا نقش را بازنویسی نمی‌کند.

سپس در ترمینال محلی، پوشهٔ دارای `artisan`:

```bash
php artisan config:clear
php artisan db:seed
```

این فرمان‌ها جدول‌های موجود را حذف نمی‌کنند. برای این خطا `migrate:fresh` یا تغییر APP_KEY لازم نیست. توضیح کامل: [seeders.md](seeders.md).

### اگر واقعاً نصب تازه است و `.env` ندارید

در پوشهٔ `backend`، روی PowerShell:

```powershell
if (Test-Path .env) { throw '.env already exists; preserve its key and database settings.' }
Copy-Item .env.local.example .env
```

روی Linux/macOS:

```bash
cp -n .env.local.example .env
```

کپی Linux فایل موجود را بازنویسی نمی‌کند؛ اگر از قبل وجود داشته، ادامهٔ مراحل نصب تازه را روی آن اجرا نکنید. **فقط برای نصب تازهٔ فاقد کلید**، روی دستگاه دارای PHP سازگار:

```bash
php artisan key:generate
php -r "file_exists('database/database.sqlite') || touch('database/database.sqlite');"
# رمزهای اولیه را اکنون در .env خصوصی تنظیم کنید.
php artisan config:clear
php artisan migrate
php artisan db:seed
```

در نمونهٔ محلی DB_DATABASE عمداً تعریف نشده تا مسیر خودکار Laravel به `database/database.sqlite` استفاده شود؛ برای DB موجود مسیر دقیق آن را نگه دارید. mail محلی از `array` استفاده می‌کند و ایمیل را ارسال یا لینک بازیابی رمز را در log ثبت نمی‌کند. برای آزمایش ارسال واقعی، SMTP آزمایشی خود را خصوصی تنظیم کنید.

## هاست واقعی

نمونهٔ production برای این دامنه‌ها آماده است:

- پنل: `https://tadbir.morvarid-daron.ir/`
- Laravel/API: `https://api-tadbir.morvarid-daron.ir`

APP_DEBUG خاموش، cookie امن و HttpOnly، دامنهٔ مشترک `.morvarid-daron.ir`، فهرست دقیق Sanctum و CORS موجودِ محدود به پنل با هم سازگارند. document root بک‌اند باید فقط `public/` باشد. timezone کد فعلاً UTC است؛ متغیر بی‌اثر/حدسی APP_TIMEZONE اضافه نشده است.

مواردی که باید فقط در محیط خصوصی تکمیل شوند:

1. **APP_KEY**: کلید نصب موجود را حفظ کنید. برای نصب کاملاً تازه، یک کلید مستقل روی محیط توسعهٔ امن تولید و منتقل کنید؛ هرگز کلید عمومی مشترک در Git قرار ندهید.
2. **DB_HOST / DB_DATABASE / DB_USERNAME / DB_PASSWORD**: مطابق کنترل‌پنل هاست، با پیشوند حساب در صورت نیاز. `127.0.0.1` در نمونه فقط پیش‌فرض ارتباط سمت سرور است و ممکن است هاست مقدار دیگری بخواهد؛ اطلاعات DB واقعی در اختیار این مخزن نیست.
3. **SEED_*_PASSWORD**: فقط پیش از ساخت اولیهٔ سه حساب. پس از موفقیت از محیط حذف شوند و cache تنظیمات نیز هماهنگ شود. ایمیل‌های SEED_*_EMAIL اختیاری‌اند؛ پیش‌فرض رزروشدهٔ `users.invalid` دریافت ایمیل ندارد.
4. **SMTP**: MAIL_HOST، MAIL_USERNAME، MAIL_PASSWORD، MAIL_FROM_ADDRESS و تنظیمات TLS/port طبق سرویس واقعی. تا تکمیل آن‌ها بازیابی رمز ایمیلی قابل اتکا نیست؛ MAIL_SCHEME به‌جای کلید قدیمی و بی‌اثر MAIL_ENCRYPTION استفاده شده است.

SESSION_DRIVER و CACHE_STORE روی file و QUEUE_CONNECTION روی sync هستند؛ Redis یا worker/Cron فرض نشده است. این انتخاب برای یک هاست مشترک تک‌سرور است. `storage/framework` و `bootstrap/cache` باید خصوصی و قابل‌نوشتن برای PHP باشند؛ دسترسی عمومی/مجوز 777 ندهید. تغییر driver/cookie یک نصب موجود ممکن است نیازمند ورود دوبارهٔ کاربران باشد.

توکن بله در تنظیمات محافظت‌شدهٔ پنل نگهداری می‌شود. BALE_RUNNER_SECRET خالی، پردازش خارجی اختیاری را غیرفعال نگه می‌دارد؛ آن را با توکن بات یکی نکنید. URL وب‌هوک باید HTTPS عمومیِ بک‌اند باشد، نه localhost.

هاست SSH/Cron ندارد: از File Manager و روال امن کنترل‌پنل/آماده‌سازی روی کپی DB استفاده کنید. پس از تغییر env، cache تولیدشدهٔ `bootstrap/cache/config.php` را در صورت وجود طبق روال انتشار هماهنگ کنید؛ `.env`، فایل‌های اصلی bootstrap یا داده‌ها را حذف نکنید. endpoint عمومی برای artisan نسازید. [deployment.md](deployment.md) جزئیات و gateهای تست هاست را توضیح می‌دهد.

## build فرانت‌اند

روی دستگاه توسعه/CI، مقادیر `frontend/.env.production.example` را به `.env.production` منتقل کنید، بدون بازنویسی تنظیمات موجود. سپس:

```bash
cd frontend
npm ci
npm run build
```

فایل‌های `frontend/dist/` از جمله `.htaccess` برای انتشار آمادهٔ کپی‌اند. env را به document root عمومی آپلود نکنید. VITE_* در کد مرورگر عمومی می‌شود؛ هیچ رمز DB، APP_KEY، رمز کاربران یا توکن بله در آن قرار نگیرد. demo خاموش است.

این نمونه‌ها و آزمون پیکربندی، جایگزین آزمون MySQL، SMTP، HTTPS و cookie روی هاست واقعی نیستند؛ استقرار یا تغییر تنظیمات خصوصی هاست انجام نشده است.

## اعتبارسنجی این تغییر

هر سه نمونه با parser واقعی dotenv خوانده شدند؛ ۴ تست اختصاصی شامل دامنه‌ها، cookie، نبود رمز عمومی، تنظیمات SQLite و محدودبودن env فرانت‌اند به مقادیر عمومی موفق شدند. suite کامل: **۲۶۳ تست / ۱۵۵۵ assertion موفق** در PHP-WASM / SQLite. ignore شدن env واقعی و قابل‌پوش بودن فایل‌های `.example` نیز بررسی شد. کد اجرایی فرانت‌اند و `dist` در این تغییر عوض نشده‌اند.
