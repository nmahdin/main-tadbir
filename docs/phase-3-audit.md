# ممیزی آمادگی فاز سوم — ۲۰۲۶/۰۹/۳۰

## تصمیم: توقف در دروازهٔ پیش‌نیاز، نه آغاز پیاده‌سازی فاز سوم

**فازهای اول و دوم هنوز Done و تأییدشده نیستند.** سند `phase-completion-status.md` صریحاً این موضوع را ثبت کرده و بررسی دوبارهٔ کد نیز آن را تأیید می‌کند. Router، API client و Query زیرساخت قابل استفاده دارند، اما مهاجرت تمام گردش‌کارها، server-state و بررسی all-module کامل نشده‌اند. عبور از این دروازه با افزودن جستجو/گزارش، خلاف ترتیب درخواست است.

مبنای ممیزی: `b8333a44368b38e28b8030c0735be9f8e9ee130b`، شاخهٔ `arena/01a0e7dd-main-tadbir`. در شروع، HEAD محلی `aefe1af7` بود و git status اختلاف‌های انباشته نشان می‌داد. پس از fetch، هش تمام فایل‌های موجود source و نبود فایل source مفقود با نسخهٔ منتشرشده تطبیق داده شد؛ تغییر staged وجود نداشت. فقط index/ref محلی با `read-tree` و `update-ref` هم‌تراز و فایل‌های tracked و مفقود dist از همان نسخه بازیابی شدند. هیچ source موجود یا دادهٔ کاربر بازنویسی نشد؛ reset/checkout مخرب انجام نشد. پایان این هم‌ترازی working tree پاک بود.

**دامنهٔ تحویل حاضر:** همین ممیزی و راهنمای عملیاتی مشروط در `operations.md`. کد runtime، endpoint، permission، migration، وابستگی و سرویس خارجی تغییر نکرده‌اند. اعداد آزمون زیر مربوط به این نوبت‌اند؛ اعداد قدیمی مستندات فازهای قبل تاریخی هستند.

## وضعیت حوزه‌ها و شواهد تأییدشده

| حوزه | وضعیت فعلی و شاهد در کد | نتیجه / اولویت |
|---|---|---|
| Server state و mutation | `queries/queryClient.ts`: کلید وابسته به کاربر، staleTime=30s، gcTime=5min، retry محدود؛ `workspacePages.ts`: کلید شامل فیلتر و AbortSignal. اما `AppContext.tsx:804–859` دو effect قدیمی sync و `:951` autosave تنظیمات دارد. | **مانع پیش‌نیاز P1**؛ رفتار خطا، حفظ draft و تأیید سرور برای همهٔ ماژول‌ها یکسان نیست. |
| گردش‌کارهای قدیمی | `AppContext.tsx:3468` و `:3492`: تبدیل ایده، استفاده از facade همگام ساخت پروژه/تسک و به‌روزرسانی جداگانهٔ ایده با catch بدون propagation؛ موفقیت وابسته به یک تراکنش سرور نیست. در sync دوم، conversation/message با permissions خالی توسط شرط `some` رد می‌شوند؛ این effect ضامن ذخیرهٔ آن‌ها نیست. | پیش از توسعهٔ وابسته، مسیرهای واقعی فرم تا API و شکست فرمان دوم باید تست و یکسان شوند؛ بازنویسی کل context لازم نیست. |
| درخواست و cache | `api/client.ts` invalidation مرکزی پس از mutation دارد؛ `queries/resources.ts` دوباره invalidation می‌کند. bootstrap در `AppContext:605` و hookهای legacy فهرست ۱۰۰تایی در کنار query صفحات باقی‌اند. | دو محل invalidation قطعی است؛ تعداد درخواست تکراری شبکه هنوز اندازه‌گیری نشده و Query ممکن است dedupe کند. ابتدا trace، سپس حذف تکرار؛ نه cache جدید. |
| جستجوی سراسری | `GlobalSearchModal.tsx:65–119`: پروژه/تسک/کاربر/محتوا/دپارتمان از آرایه‌های context فیلتر می‌شوند؛ فقط DAM درخواست سرور با debounce 250ms و سقف ۴ دارد. خطای آن به آرایهٔ خالی تبدیل می‌شود و ورودی خالی نیز درخواست می‌دهد. | جستجوی جامع سروری نیست؛ صفحهٔ اول/مجموعهٔ بارگیری‌شده منبع کامل نیست. خطا/خالی مستقل و کنترل درخواست دیررس نیاز به تکمیل دارند. |
| deep link جستجو | `routing/routes.ts` جزئیات IDدار پروژه/تسک/محتوا را resolve می‌کند. `GlobalSearchModal.handleSelectAsset` فقط عنوان را در sessionStorage گذاشته و به DAM می‌رود. | مقصد DAM فعلاً deep link پایدار به ID نیست؛ نامه/جلسه/ایده نیز قرارداد route جزئیات مستقل عمومی این سه موجودیت را ندارند. آن‌ها را به‌زور به نتیجهٔ جستجوی جدید اضافه نکنید. |
| گزارش و شاخص | `AnalyticsView.tsx:30–97`: تعداد و نرخ‌ها از آرایه‌های context؛ `UserResource.php` workload را با وزن‌های ثابت و با عنوان محاسبهٔ موقت تولید می‌کند. | **قابل اتکا به‌عنوان گزارش کامل سازمانی نیست**؛ کمبود پوشش داده با صفر اشتباه نشود. API تجمیع و تعریف تجاری لازم است. در ۱۶۹ route فعلی endpoint اختصاصی global search/report/analytics/export مشاهده نشد؛ این به معنی نبود summaryهای محلی مثل DAM نیست. |
| pagination / query | `WorkspaceListRequest`: سقف per_page=100، جستجوی حداکثر ۱۲۰، sort/direction whitelist و رد پارامتر ناشناخته. `ApprovalController.index` با chunk=200 و حفظ فقط صفحه، هنوز تمام candidates را برای ACL/count می‌بیند. `DamDataTableController.show` همهٔ rows و activities آن‌ها را load می‌کند. | محدودیت حافظهٔ approvals مساوی هزینهٔ زمانی ثابت نیست. پاسخ جدول DAM از این مسیر سقف صفحه ندارد؛ پیش از دادهٔ حجیم باید قرارداد جداگانهٔ صفحه‌بندی شود. |
| N+1 / ایندکس | فهرست‌های اصلی eager loading دارند؛ `UserResource.toArray/workloadPercentage` و `ContentAccess.departmentIds` نقاط query به‌ازای کاربر دارند. ایندکس `tasks_review_queue_index(kind,assignee_id,status,id)` موجود است. | نقاط کاندیدای N+1 مشخص‌اند؛ query-count و EXPLAIN روی MySQL و حجم واقعی هنوز اجرا نشده‌اند. ایندکس جدید یا ادعای کندی تولید بدون اندازه‌گیری موجه نیست. |
| lazy loading و bundle | `App.tsx` صفحات متعددی را React.lazy می‌کند؛ namespace import از lucide در `settings/PlatformModal.tsx` و `content/ContentPublishingView.tsx` وجود دارد. اندازه‌ها پایین اندازه‌گیری شده‌اند. | split موجود است ولی دو chunk بزرگ باقی است. بررسی مصرف iconها و وابستگی eager مقدم بر manualChunks یا memoization سراسری است. |
| خطا و پایش | `bootstrap/app.php` پاسخ 5xx API را scrub می‌کند؛ `api/client.ts` پیام امن و محافظ پاسخ نشست قبلی دارد. `config/logging.php` stack/single/daily، نمونهٔ تولید stack/single با level=warning. | pipeline مشترک correlation ID و redaction ساختاریافتهٔ همهٔ logها در کد برنامه دیده نشد. request_idهای بله برای idempotency عملیات‌اند، نه correlation عمومی. امن بودن پاسخ HTTP اثبات پاک‌بودن log نیست. |
| Audit | `ActivityLogController.index`: مجوز reports.view و فیلتر روابط؛ store نوع client_note تحمیل می‌کند. RoleController/UserController/TaskOperations/ContentPublication و بله رویدادهای سروری ثبت می‌کنند. | زیرساخت موجود باید بازاستفاده شود؛ نتیجه/ساختار رویداد و پوشش تمام تغییرات حساس هنوز استاندارد واحد ندارد. متن client_note را ممیزی معتبر عملیات تلقی نکنید. |
| امنیت | مجوز اجرا و حساب فعال در middleware/controller/service؛ DAM download با assets.download و scope محرمانگی، preview با assets.preview؛ bulk سقف ۱۰۰ و کنترل هر دارایی. upload اصلی سقف ۲۰MiB و محدودیت پسوند؛ پیش‌نمایش SVG/HTML مجاز نیست. | پایه و تست منفی موجود است؛ بررسی جامع IDOR روابط، تمام مسیرهای legacy و payload/MIME واقعی فایل هنوز gate باز است. نبود CVE/نفوذپذیری را ادعا نمی‌کنیم. |
| Rate limit / session | ورود ۲۰/دقیقه، ثبت‌نام ۵، بله و بعضی commandها محدودند؛ `cors.php` origin پنل و credentials=true. env تولید debug=false و session امن دارد. health/db عمومی است و limiter اختصاصی در تعریف route ندارد. | quota خواندن پرترافیک/دانلود و تست روی پراکسی واقعی نیازمند تصمیم ظرفیت است؛ برای جستجوی آینده حد اختصاصی لازم است. مقادیر نمونه اثبات تنظیم واقعی هاست نیستند. |
| دسترس‌پذیری | `Primitives.tsx`: focus trap/restore، Escape، aria-modal، نام و busy؛ آزمون‌های فعلی modal تسک/موبایل موجودند. GlobalSearch یک overlay قدیمی مستقل با focus اولیه است، نه همان primitive. | ممیزی کامل keyboard، screen reader، کنتراست و reduced motion انجام نشده؛ انطباق کامل WCAG ادعا نمی‌شود. هیچ UI در این نوبت تغییر نکرده است. |
| عملیات | هاست بدون SSH/Cron؛ نمونهٔ env: queue=sync و cache/session=file. `routes/console.php` job زمان‌بندی‌شده ندارد؛ DB::listen/slow-query hook یا ShouldQueue در کد برنامه پیدا نشد. health فقط وضعیت/زمان و نسخهٔ قرارداد v1 می‌دهد. | worker/Redis/سرویس پایش اضافه نشود. backup واقعی، مسئول، retention و restore drill تأیید نشده؛ v1 شناسهٔ release نیست. |

بررسی فایل‌های tracked نیز نشان داد env واقعی و node_modules در نسخهٔ فعلی track نیستند؛ secret scanning تاریخچه و چرخش secretهای احتمالی قدیمی در این نوبت تأیید نشده است.

این جدول ممیزی اولیهٔ آمادگی است، نه اثبات امنیت تمام routeها. هیچ ایراد امنیتی تازه‌ای در این تحویل «رفع‌شده» اعلام نمی‌شود؛ اصلاح باید با بازتولید و تست منفی قبل/بعد همراه باشد.

## اندازه‌گیری عملکرد این نوبت

Production build از همان source، demo=false و URLهای تولید، در مسیر **خارج مخزن** `/home/user/phase3-audit-build` ساخته شد؛ dist منتشرشده تغییر نکرد؛ مقایسهٔ بایت‌به‌بایت تمام فایل‌های build با artifact منتشرشده نیز صفر اختلاف داشت. ۴۷ chunk جاوااسکریپت با مجموع **۲٬۸۶۰٬۱۹۷ بایت** (نه حجم دانلود الزامی صفحهٔ نخست):

| chunk | بایت خام | gzip گزارش Vite، kB ده‌دهی |
|---|---:|---:|
| index-DIZfP-TW.js | ۱٬۰۴۹٬۳۴۳ | ۲۷۷٫۸۲ |
| lucide-react-C6ylYzYa.js | ۷۹۲٬۳۱۱ | ۱۴۹٫۵۹ |
| AnalyticsView-mW13YCcG.js | ۴۱۶٬۱۹۷ | ۱۱۸٫۵۴ |

زمان build این sandbox: ۱۴٫۰۹ ثانیه؛ benchmark زمان navigation یا سرعت هاست نیست. هشدار >500kB باقی است. اندازه/توزیع دادهٔ واقعی، تعداد کاربران هم‌زمان، p95 query، LCP/INP، تعداد درخواست مسیرها و گلوگاه CPU/IO هاست در دسترس نیستند. در این تحویل **بهینه‌سازی یا بهبود اندازه‌گیری‌شده‌ای** رخ نداده است. virtualization، cache مشترک و ایندکس اضافی بدون این شواهد موکول شدند.

## توسعهٔ بعد از عبور از gate

1. **دامنهٔ اولیهٔ قابل بررسی جستجو:** پروژه، تسک و محتوا؛ API/route جزئیات و منطق مجوز موجود دارند. باید همان scopeهای فعلی بازاستفاده شوند. tasks.view و projects.view فعلاً مجوز ماژولی‌اند؛ فیلتر «من» ACL مالکیت اجباری نیست. تغییر این معنای محصول نباید ضمنی باشد. محتوا از ContentAccess (مجوز ماژول یا عضویت دپارتمان) و DAM از scope محرمانگی خودش تبعیت می‌کند.
2. قبل از endpoint جدید، قرارداد type/query/limit و پاسخ گروهی `data/meta`، سقف پایدار، عدم افشای title/snippet غیرمجاز، لغو پاسخ دیررس و deep link را با تست منفی تثبیت کنید. حد query، quota و تعداد نتایج هنوز **پیشنهاد طراحی‌اند، نه API مصوب یا موجود**. ابتدا SQL موجود؛ موتور جستجوی خارجی لازم تشخیص داده نشده است.
3. **گزارش‌های کاندید، نه پیاده‌شده:** وضعیت فعلی تسک‌ها و پروژه‌ها و backlog تأیید محتوا. برای روند تکمیل، کیفیت و پوشش timestampهای تکمیل باید بررسی شود؛ updated_at معادل زمان تکمیل نیست. waiting time را از created_at تسک به‌جای لحظهٔ ورود به مرحله حدس نزنید. مخاطب سازمانی/واحدی و مجوز و تعریف archived/cancelled باید مصوب شود.
4. زمان پیش‌فرض بک‌اند `config/app.php` برابر UTC است؛ تنظیم نمایشی general.timezone، ساعت سرور را تغییر نمی‌دهد. گزارش آتی باید zone و مرز inclusive/exclusive بازه و تبدیل تاریخ جلالی را صریح تعریف کند. گزارش سراسری از cache ۱۰۰تایی تولید نشود.
5. پس از بستن پیش‌نیازها: correlation ID تولیدشده در سرور و log با whitelist فیلد غیرحساس؛ بدون ارسال body/header/token به پایش. sampler/dedupe و retention باید پیش از جمع‌آوری telemetry انتخاب شوند. سرویس خارجی پیش‌فرض لازم نیست.

Export، موتور جستجوی مستقل، Redis، queue worker، scheduler جدید، projection گزارش، index سنگین، دامنهٔ جدید جستجوی DAM/نامه/جلسه/ایده بدون deep link، و virtualization عمومی **فعلاً خارج از پیاده‌سازی** هستند. هیچ permission جدیدی ساخته نشده؛ reports.view موجود مجوز ضمنی export نیست.

## ریسک انتشار و نیازهای محیطی

- نسخهٔ مبنا حذف ایمیل را در مایگریشن‌های **پایه برای نصب تازه/بازسازی‌شده** اعمال کرده است. migrate عادی روی نصب قدیمی ستون‌ها را حذف نمی‌کند. درخواست قبلی مالک برای fresh، مجوز اجرای آن در این ممیزی یا روی تولید نیست؛ fresh تمام داده‌ها را حذف می‌کند. `username-accounts.md` مرجع محدودیت است.
- migrationهای دپارتمان، حفظ archive/review و تعمیر SQLite، down کاملاً معکوس/بی‌اتلاف تضمین نمی‌کنند. rollback خودکار schema یا تغییر APP_KEY ممنوع؛ backup هماهنگ کد/DB/فایل/کلید لازم است.
- PHP بومی/MySQL، JSON و collation، قفل و زمان DDL، HTTPS/CORS/Sanctum دو دامنه، فایل خصوصی، rewrite و OPcache روی هاست هنوز آزموده نشده‌اند. SQLite/WASM جای آن‌ها نیست.
- اقدام ضروری عملیاتی: مالک مشخص backup، ابزار واقعی کنترل‌پنل، فضای خصوصی جدا، RPO/RTO و retention مصوب، و restore drill روی مقصد جدا. روش مشروط در `operations.md` آمده؛ هیچ backup/restore واقعی یا اتصال به تولید انجام نشد.

## فرمان‌ها و نتایج واقعی

از ریشهٔ مخزن مگر جایی که ذکر شده؛ خروجی‌های خام آزمایش در `/home/user/phase3-*.log` خارج Git هستند.

| فرمان / بررسی | نتیجهٔ همین نوبت |
|---|---|
| `git branch --show-current`, `git status --short`, `git log -3 --oneline`, fetch شاخه | شاخه صحیح؛ اختلاف metadata با تطبیق blobها رفع شد؛ source دست‌نخورده |
| `command -v php`, `command -v composer` | PHP/Composer بومی در PATH نبود؛ `php artisan test` بومی اجرا نشد |
| `npm install --prefix /home/user/php-test @php-wasm/cli --no-audit --no-fund` | runner فقط خارج مخزن نصب شد؛ dependency پروژه اضافه نشد |
| `npm --prefix frontend ci --no-audit --no-fund` | نصب از lock موفق؛ این فرمان security audit بسته‌ها نیست |
| `npm run lint` در frontend | موفق؛ اسکریپت tsc --noEmit است، نه ESLint |
| `npm test` در frontend | ۳۴ تست Node موفق |
| `VITE_DEMO_MODE=false VITE_API_URL=https://api-tadbir.morvarid-daron.ir/api/v1 VITE_SANCTUM_URL=https://api-tadbir.morvarid-daron.ir npm run build -- --outDir /home/user/phase3-audit-build` | موفق؛ اندازه‌ها و هشدار بالا |
| `php-wasm-cli -f vendor/bin/phpunit -- --colors=never` در backend | **۲۷۲ تست / ۱۶۲۸ assertion موفق**؛ PHP 8.5.10، SQLite ایزوله |
| `php-wasm-cli -f artisan -- route:list --path=api/v1 --json` در backend | ۱۶۹ route؛ هیچ route جدیدی ایجاد نشد |

مسیر کامل runner: `/home/user/php-test/node_modules/.bin/php-wasm-cli`. برای آزمون از APP_KEY صرفاً آزمایشی استفاده شد؛ env/کلید واقعی خوانده/تغییر داده نشد. در route:list، APP_ENV=testing و CACHE_STORE/SESSION_DRIVER=array بود. workaround شناخته‌شدهٔ mockConsoleOutput=false موقتاً برای suite فعال و با trap، `tests/TestCase.php` به محتوای قبلی برگشت؛ وارد تغییرات نشده است. summary واقعی PHPUnit بررسی شد، نه فقط exit code.

**اجرا نشده در این نوبت:** E2E مرورگر (۳۶ تست موفق نسخهٔ قبلی نتیجهٔ تاریخی است)، اتصال مرورگر به Laravel واقعی، load/EXPLAIN/MySQL، تست کنتراست یا صفحه‌خوان، backup/restore drill و استقرار. تست‌ها پوشش انتخابی ACL/قرارداد/گردش‌کار دارند، نه تأیید جامع همهٔ معیارهای فاز سوم.

## شرط ادامه و پیشنهاد مرحلهٔ بعد

1. بستن mutationهای قدیمی ایده/جلسه/دبیرخانه/chat/DAM/settings به‌صورت برش‌های کوچک با حفظ draft، انتظار پاسخ و تست شکست/دوبارکلیک؛ قراردادهای فعلی سرور بازاستفاده شوند.
2. تکمیل ماتریس ACL/روابط و pagination/selectorهای باقیماندهٔ فازهای ۱ و ۲؛ رد دسترسی و mutation جزئی با تست مستقل.
3. آزمون محیط واقعی روی کپی جدا، بررسی migration متناسب با نصب تازه یا دادهٔ موجود، و ثبت محدودیت‌های قبول‌شده توسط مالک؛ سپس **تأیید صریح تکمیل فازهای قبل**.
4. بعد از تأیید، اصلاح امنیتی بازتولیدشده، سپس جستجوی سه موجودیت اولیه؛ گزارش فقط پس از توافق تعریف شاخص. این ممیزی مجوز دورزدن gate یا اعلام Done هیچ‌یک از سه فاز نیست.
