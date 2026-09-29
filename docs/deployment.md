# استقرار تدبیر — فرانت‌اند SPA و بک‌اند Laravel

> این راهنما پایهٔ انتشار فاز اول است. تغییرات هم‌زمان frontend/backend برای فرمان بررسی، نتایج جدید و gateهای انتشار فاز دوم در [ممیزی فاز دوم](phase-2-audit.md) آمده‌اند؛ هیچ‌کدام تأیید استقرار روی هاست نیستند.

> برای آخرین migration و gateها، [وضعیت تجمیعی](phase-completion-status.md) را نیز بخوانید؛ نسخهٔ فعلی migration جدید حفظ وضعیت آرشیو و چرخهٔ اصلاح دارد.

## تصمیم مخزن و artifact

هاست فعلی فایل آماده می‌پذیرد و SSH/Cron در دسترس نیست. بنابراین **`frontend/dist/` به‌عنوان artifact تولیدشده در Git/بستهٔ انتشار نگه داشته می‌شود**؛ source اصلی فقط `frontend/src/` است. dist را دستی ویرایش نکنید. `node_modules` از index Git حذف و ignore شده است؛ با lockfile دوباره نصب می‌شود. `vendor` بک‌اند در این فاز تغییر سیاست نداده است. فایل‌های `.env` واقعی، log و گزارش مرورگر نباید وارد Git یا document root عمومی شوند.

حذف فایل حساس از نسخهٔ فعلی، آن را از تاریخچهٔ Git پاک نمی‌کند. اگر کلید واقعی در تاریخچهٔ قدیمی بوده، مدیر باید آن را تعویض کند؛ این تغییر تاریخچه یا APP_KEY تولید را خودکار بازنویسی نمی‌کند.

## build فرانت‌اند روی دستگاه توسعه/CI، نه هاست

Node.js 22 یا نسخهٔ سازگار با package-lock فعلی و npm لازم است:

```bash
cd frontend
npm ci
npm run lint
npm test
VITE_DEMO_MODE=false \
VITE_API_URL=https://api-tadbir.morvarid-daron.ir/api/v1 \
VITE_SANCTUM_URL=https://api-tadbir.morvarid-daron.ir \
npm run build
```

- متغیرهای `VITE_*` در زمان build در کد مرورگر قرار می‌گیرند؛ **هیچ secret یا token** در آن‌ها قرار ندهید.
- برای توسعه، `.env.example` با API نسبی `/api/v1` و proxy Vite قابل استفاده است. سرور به `0.0.0.0` bind می‌شود و preview host را می‌پذیرد. آدرس `127.0.0.1` فقط در proxy سمت سرور است، نه درخواست مرورگر به بک‌اند.
- `VITE_DEMO_MODE` پیش‌فرض false است؛ true فقط برای محیط نمایشی جدا. قطع API این flag را تغییر نمی‌دهد. دادهٔ نمونه داخل `src/demo` است؛ در حالت نمایشی درخواست‌های API مسدودند و داده فقط در حافظه است.
- تمام محتوای `frontend/dist/`، از جمله فایل مخفی `.htaccess`، favicon و assets را به document root فرانت‌اند مانند `public_html` منتقل کنید. `node_modules`، source، `.env` و گزارش تست را آپلود نکنید.
- هشدار bundle بزرگ فعلاً باقی است؛ شکستن bundle به chunkهای ماژولی کار بعدی است.

## routing روی Apache

`frontend/public/.htaccess` هنگام build به dist کپی می‌شود. فایل/پوشهٔ موجود مستقیم سرو می‌شود و URL داخلی مثل `/projects/123` یا `/tasks/456` به `index.html` می‌رسد؛ مسیرهای `api` و `sanctum` نباید به HTML فرانت‌اند تبدیل شوند. rewrite نیازمند `mod_rewrite` و AllowOverride مناسب هاست است. این فایل برای استقرار در ریشهٔ دامنه است؛ نصب در زیرپوشه به basename/base و rewrite متناسب نیاز دارد و در این فاز تست نشده است.

نسخهٔ خلاصه:

```apache
RewriteEngine On
RewriteRule ^(?:api|sanctum)(?:/|$) - [L]
RewriteCond %{REQUEST_FILENAME} -f [OR]
RewriteCond %{REQUEST_FILENAME} -d
RewriteRule ^ - [L]
RewriteRule ^ index.html [L]
```

بک‌اند روی دامنهٔ API مستقل با document root استاندارد `backend/public` اجرا شود، نه کل backend. SPA روی دامنهٔ پنل است. برای Sanctum، SESSION_DOMAIN، SANCTUM_STATEFUL_DOMAINS، HTTPS، secure cookies و CORS باید مطابق همین دو دامنه باشند. فرانت‌اند از cookie و `credentials: include` استفاده می‌کند؛ token را به localStorage اضافه نکرده‌ایم. endpointهای token موجود برای سایر کلاینت‌ها حفظ شده‌اند.

## نصب هماهنگ بدون SSH/Cron

1. از کد، دیتابیس، `.env` و فضای خصوصی فایل‌ها backup قابل بازیابی بگیرید. APP_KEY هاست را عوض نکنید.
2. پیش‌نیازهای بله و انتقال دپارتمان باید از انتشار قبلی کامل باشد؛ راهنماهای `docs/deployment/` مرجع‌اند. این فاز جایگزین آن migrationها نیست.
3. نوشتن نسخهٔ قبلی را موقتاً متوقف کنید. بک‌اند، autoload سازگار و کل dist را هماهنگ نصب کنید. هیچ migrate/cache-clear عمومی PHP ایجاد نکنید.
4. از File Manager فقط cacheهای تولیدشدهٔ `bootstrap/cache/routes*.php`، `events.php` و `config.php` را در صورت وجود حذف و OPcache/CDN را از کنترل‌پنل تازه کنید. `.env`، bootstrap اصلی و فایل‌های خصوصی را حذف نکنید. اگر نصب classmap-authoritative است، autoload را بیرون هاست تولید کنید.
5. تغییر جدید schema این فاز فقط `2026_09_29_000001_repair_sqlite_archive_status_constraints` است؛ **روی MySQL هیچ ALTER اجرا نمی‌کند**. روی SQLite، migrationها را در محیط دارای PHP با روال عادی Laravel اجرا کنید. این migration محدودیت enum/CHECK آرشیو را اصلاح می‌کند؛ دادهٔ قبلی/عضویت/FK در تست ایزوله حفظ شده‌اند.
6. روی MySQL وجود `archived` در enumهای projects/tasks را با `SHOW COLUMNS` بررسی کنید. این وضعیت پیش‌نیاز migration قدیمی `2026_09_28_000001_add_archived_to_status_enums` است؛ اگر نصب قدیمی آن را ندارد، پیش از فعال‌کردن archive، همان تغییر قدیمی را با backup و بررسی روی کپی DB اعمال کنید. تست SQLite تأیید اجرای MySQL نیست.
7. با حساب آزمایشی واقعی: ورود/خروج، refresh مسیر داخلی، مجوزهای متفاوت، ایجاد/ویرایش، archive/restore و انتشار بدون URL را بررسی کنید. با قطع API نباید دادهٔ نمایشی یا حساب مدیر نمونه دیده شود.
8. کاربرانی که نسخهٔ قدیمی باز دارند باید hard reload کنند. کش‌های domain قدیمی localStorage خوانده یا import نمی‌شوند؛ دادهٔ صرفاً مرورگریِ ذخیره‌نشده، رکورد سرور محسوب نمی‌شود. پاک‌کردن دستی آن‌ها را پس از بررسی نیاز به بازیابی انجام دهید.

## اجرای تست در محیط توسعه

```bash
cd frontend
npm ci
npm run lint
npm test
npx playwright install chromium
# در ترمینال جدا:
npm run dev
# سپس:
npm run test:e2e
```

تست‌های مرورگر از APIهای mock شده استفاده می‌کنند؛ معادل تست یکپارچهٔ مرورگر با دیتابیس/کوکی تولید نیستند. تست demo جداست:

```bash
VITE_DEMO_MODE=true npm run dev -- --port=3001
E2E_DEMO=true E2E_BASE_URL=http://127.0.0.1:3001 npm run test:e2e
```

در محیط sandbox مرورگر دانلود مستقیم نشد؛ Chromium جایگزین بیرون مخزن نصب و با `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` اجرا شد. روی دستگاه عادی از browser نصب‌شدهٔ Playwright استفاده کنید.

بک‌اند در محیط توسعهٔ دارای PHP:

```bash
cd backend
php artisan test
php artisan route:list --path=api/v1
php artisan optimize:clear
```

در این sandbox PHP بومی موجود نبود؛ کل PHPUnit با PHP-WASM و SQLite حافظه‌ای اجرا شد. `route:list` و `optimize:clear` نیز با همان CLI اجرا شدند. کلید مصنوعی فقط به فرایند تست داده شد. هیچ کلید/دیتابیس تولید تغییر نکرد.

## rollback

- HEAD واقعی این checkout برابر `aefe1af7` است؛ `ddb954a9` ارجاع تاریخی تحویل قبلی بود، نه baseline فعلی. تغییرات قبلی در working tree حفظ شده‌اند. backup نسخهٔ نصب‌شدهٔ واقعی مرجع بازگشت است، نه حدس دربارهٔ نسخهٔ هاست.
- frontend و backend متناظر را با هم بازگردانید؛ فرانت‌اند قدیمی با guardهای جدید انتشار سازگار نیست.
- در MySQL این فاز migration جدید مؤثری ندارد، ولی بازگرداندن دیتابیس بدون بررسی داده‌های جدید کاربران مجاز نیست.
- migration تعمیر SQLite در down دامنهٔ status را تنگ نمی‌کند و archived را به وضعیت دیگری تبدیل نمی‌کند. در صورت ضرورت بازگشت کامل، backup هماهنگ DB/کد لازم است.
- بازگشت به نسخهٔ قبلی به معنی بازگشت خطر demo/localStorage قبلی نیز هست؛ بدون ارزیابی امنیتی فعالش نکنید.

## وضعیت تحویل

این کد روی هاست واقعی مستقر نشده است. فاز اول هنوز تمام معیارهای Done را ندارد؛ ماتریس دقیق در `docs/phase-1-implementation.md` آمده است. آزمایش کامل MySQL، همهٔ moduleها و جریان‌های قدیمی optimistic باید پیش از اعلام تکمیل فاز انجام شود.
