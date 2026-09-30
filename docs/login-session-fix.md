# اصلاح خطای ورود و باکس اتصال — ۲۰۲۶/۰۹/۳۰

## بازتولید و علت

پیام «نشست درخواست تغییر کرده است» با status داخلی 409 را API client برای رد پاسخ متعلق به نشست قبلی تولید می‌کرد؛ لزوماً پاسخ HTTP 409 از سرور نیست. `loadWorkspace` فقط شناسهٔ کاربر را مقایسه می‌کرد، نه نسل نشست، و نتیجهٔ درخواست لغوشده/دیررس پس از ورود دوبارهٔ همان کاربر می‌توانست به‌عنوان خطای ماژول نمایش داده شود. بررسی مجدد نشست و ارسال هم‌زمان فرم نیز امکان رقابت با ورود را داشتند. شش سناریوی جدید قبل از اصلاح شکست خوردند، از جمله بازتولید اعلان خطای بارگذاری بعد از ورود مجدد.

## تغییرات محدود

- `AuthContext`: ورود صریح پیش از انتظار شبکه، restore قبلی را بی‌اعتبار می‌کند؛ restore در حین ورود شروع نمی‌شود. ورود موفق حتی برای همان کاربر نسل جدید دارد؛ بررسی مجدد همان نشست آن را بی‌دلیل عوض نمی‌کند.
- `AuthModal`: قفل ref علاوه بر وضعیت دکمه، از ارسال دو فرم در یک چرخه جلوگیری می‌کند؛ خطای اعتبارسنجی مانع retry بعدی نمی‌شود.
- `AppContext` و `queryClient`: نتیجهٔ workspace، snapshot داده و پیام reload با نسل نشست کنترل می‌شوند. لغو نشست نتیجهٔ موفق reload یا خطای ماژول نشست جدید تولید نمی‌کند. callback یادداشت فعالیت نیز به نشست خودش محدود است.
- لغو داخلی `SessionChangedError` از `ApiError` واقعی 409 متمایز است. محافظ رد داده/401 دیررس نشست قدیمی حذف نشده است؛ خطاهای واقعی 409 و 5xx همچنان نمایش داده می‌شوند.
- یادداشت تکراری ورود از `loginAs` حذف شد؛ `AuthController` از قبل رویداد معتبر `auth_login` را در سرور ثبت می‌کند. بقیهٔ ثبت فعالیت حذف نشده‌اند.
- پاسخ عادی 401 برای مراجعه‌کنندهٔ واردنشده، خطای اتصال تلقی نمی‌شود. باکس خطای واقعی/نشست منقضی‌شده در بالا-چپ، با عرض حداکثر ۲۸۸ پیکسل و دکمهٔ بررسی مجدد باقی می‌ماند؛ عرض موبایل را سرریز نمی‌کند.

## آزمون و مرز تأیید

- `npm --prefix frontend run lint`: TypeScript موفق.
- `npm --prefix frontend test`: **۳۶ تست Node موفق**؛ شامل تفاوت لغو داخلی با conflict واقعی و جداسازی نسل‌های همان کاربر.
- build تولید با `VITE_DEMO_MODE=false` و URLهای واقعی پنل/API: موفق؛ هشدار قبلی اندازهٔ chunk باقی است. خروجی `frontend/dist` بازسازی شد.
- اجرای قبلی Playwright روی dist پیش از بازنویسی backend، **۴۴ تست موفق** داشت. بعد از بازنویسی ورود، دانلود Chromium با قطع TLS محیط متوقف شد؛ بنابراین روی dist جدید ادعای تکرار Playwright نداریم. تست‌های mock قبلی نیز جای آزمون cookie واقعی هاست نیستند.
- کل PHPUnit بک‌اند: **۲۷۳ تست / ۱۶۴۷ assertion موفق** با PHP-WASM 8.5.10 و SQLite ایزوله. تست‌های هدفمند auth/environment نیز **۱۲ تست / ۱۳۵ assertion** موفق‌اند. workaround موقت `mockConsoleOutput` پس از تست بازگردانده شد.
- credential واقعی، APP_KEY و دیتابیس تولید تغییر نکردند. اتصال ورود روی هاست واقعی با حساب کاربر آزموده نشده است.

## بازنویسی ورود نشستی و رفع 401 پس از پاسخ 200

پس از رفع رقابت بالا، روی هاست مشخص شد login پاسخ 200 می‌دهد ولی `Set-Cookie` ندارد و همهٔ APIهای بعدی 401 هستند. علت کد این بود که `AuthController` در صورت تشخیص‌ندادن درخواست به‌عنوان SPA، همان مسیر `/auth/login` را به token login تبدیل می‌کرد. فرانت عمداً token را نگه نمی‌دارد؛ بنابراین پاسخ موفق ظاهری، نشست مرورگر ایجاد نمی‌کرد.

قرارداد جدید صریح است:

- `POST /api/v1/auth/login` همیشه با middleware وب/CSRF اجرا و فقط session login انجام می‌دهد. Laravel در بک‌اند session را regenerate و `tadbir_session` را با `Set-Cookie` ارسال می‌کند؛ فرانت هیچ session cookieای نمی‌سازد.
- `POST /api/v1/auth/token` مسیر جداگانهٔ کلاینت غیرمرورگری است. پنل از آن استفاده نمی‌کند.
- `auth/register` نیز برای auto-login احتمالی همان session stack را دارد.
- `FRONTEND_URL` منبع مشترک CORS و fallback دامنهٔ stateful Sanctum است. دامنهٔ پنل حتی در صورت ناقص‌بودن `SANCTUM_STATEFUL_DOMAINS` قدیمی، در config جدید stateful می‌ماند.
- درخواست CSRF و پاسخ‌های auth با cache غیرفعال اجرا می‌شوند. خواندن `XSRF-TOKEN` در فرانت فقط برای هدر CSRF است؛ تنظیم `tadbir_session` منحصراً در سرور می‌ماند.
- تست feature ورود، وجود `tadbir_session` و `XSRF-TOKEN`، ویژگی‌های Secure/HttpOnly/SameSite/Domain، نبود token در پاسخ پنل و احراز درخواست مستقل بعدی از روی همان کوکی را پوشش می‌دهد.

## انتشار

این تغییر اکنون **هم backend و هم frontend** دارد، ولی migration، seed یا `migrate:fresh` لازم ندارد.

1. از نصب و `.env` فعلی backup بگیرید و `APP_KEY` را حفظ کنید.
2. کد بک‌اند متناظر و کل محتوای dist جدید (index و assets با هم) را منتشر کنید.
3. در `.env` واقعی این مقادیر را ادغام/بررسی کنید؛ فایل موجود را با example جایگزین نکنید:

```dotenv
APP_URL=https://api-tadbir.morvarid-daron.ir
FRONTEND_URL=https://tadbir.morvarid-daron.ir
SESSION_DRIVER=file
SESSION_COOKIE=tadbir_session
SESSION_PATH=/
SESSION_DOMAIN=.morvarid-daron.ir
SESSION_SECURE_COOKIE=true
SESSION_HTTP_ONLY=true
SESSION_SAME_SITE=lax
SANCTUM_STATEFUL_DOMAINS=tadbir.morvarid-daron.ir,api-tadbir.morvarid-daron.ir
```

4. چون هاست SSH ندارد، از File Manager فقط cacheهای تولیدشدهٔ `bootstrap/cache/config.php` و `routes*.php` را در صورت وجود حذف کنید و OPcache/CDN را از کنترل‌پنل تازه کنید. `.env`، `APP_KEY`، storage و دیتابیس را حذف یا بازسازی نکنید.
5. مطمئن شوید `storage/framework/sessions` برای PHP قابل‌نوشتن است.
6. پس از hard reload، در Network انتظار می‌رود `/sanctum/csrf-cookie` کوکی CSRF/session بدهد، login پاسخ 200 همراه `Set-Cookie: tadbir_session=...` داشته باشد و `auth/me` و workspace پاسخ 200 بدهند. مقدار `Set-Cookie` در JavaScript قابل‌خواندن نیست و باید در DevTools بررسی شود.

فایل dist دستی ویرایش نمی‌شود و frontend/backend دو نسخه نباید با هم ترکیب شوند. این رفع ورود به معنی تکمیل فازهای باز پروژه نیست.
