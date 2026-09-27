# DAM — مرحلهٔ ۱: بررسی و طراحی (۱۴۰۵/۰۷/۰۵)

## وضعیت موجود
- Backend: Laravel 13 / SQLite / Sanctum cookie or token; permissionهای نقش در `User::hasAnyPermission` و seeder موجود. API زیر `/api/v1`.
- Frontend: React/TypeScript/Vite، RTL. DAM فعلی در `DamMainView` و `AppContext` با `DigitalAsset` و `DomainRecord`/JSON پیاده شده؛ `AssetUploadModal` فقط metadata و object URL موقت مرورگر را ذخیره می‌کند، نه فایل. `TaskAttachment` و پیوست‌های چت مسیرهای دادهٔ جداگانه دارند.
- پیش‌نیاز: داده‌های قدیمی `domain_records` را به‌عنوان فایل واقعی فرض نکنید. مهاجرت آن‌ها فقط پس از راستی‌آزمایی منبع فیزیکی فایل مجاز است؛ object URL و `#` قابل بازیابی نیستند. `contents` محتوای فرایند تولید است؛ حذف یا ادغام خودکار آن درست نیست.

## نقشهٔ داده و سازگاری
`dam_assets` شناسنامهٔ مشترک (type/status/confidentiality/owner/department/folder/category)، `dam_files` نسخه‌های immutable فایل با مسیر خصوصی و checksum، `dam_content_items` متن اصلی، `dam_versions` snapshot و ارجاع فایل، `dam_relations` چند رابطه به project/task/department، `dam_tags` و pivot، `dam_activities`. همهٔ شناسه‌ها عددی و FKهای مشخص دارند؛ فایل با شناسهٔ asset جدا از نسخه است. مجوزهای موجود `assets.*` حفظ می‌شوند. برای سطح confidential علاوه بر مجوز عمومی، مالک یا مدیر باید باشد. scope فهرست و جزئیات باید یکسان باشد. ذخیره‌سازی از Laravel Storage disk `local` (`storage/app/private`) با disk/path در هر فایل؛ MEGA تا آزمون واقعی غیرفعال. نسخه‌بندی باید فایل‌های قبلی را نگه دارد.

## مراحل و ریسک‌ها
1. هسته: migration مستقل و API مرکزی ایجاد محتوا/آپلود/نمایش امن/رابطه، بدون تغییر destructive در جداول قدیمی. تست روی SQLite موقت و فایل‌های fake.
2. رابط: نمای مشترک «فایل‌ها» و «دیتابیس اطلاعات» با ثبت واقعی، گزارش خطای هر فایل و context پروژه/وظیفه. جایگزینی تدریجی modalهای قدیمی؛ حذف داده‌های نمایشی فقط پس از انتقال.
3. تکمیل: پوشه/دسته/برچسب، جست‌وجو و pagination، نسخه و restore، log، مجوزهای اختصاصی و عملیات گروهی.
4. یکپارچه‌سازی: پیوست‌های وظیفه/پروژه/چت/جلسه به شناسهٔ مرکزی به‌جای URL یا کپی؛ باید با مدل‌های فعلی backward-compatible شود.
5. امنیت و عملیات: quota، scan نوع/محتوا، cleanup فایل یتیم، جلوگیری از هم‌زمانی نسخه، تست دسترسی نقش‌ها و confidential، audit.

نکات تصمیم‌گیری: سقف پیش‌فرض ۲۰ مگابایت/فایل (قابل پیکربندی با PHP و وب‌سرور)، HTML غنی تا افزودن sanitizer امن به‌صورت متن ساده نگهداری می‌شود؛ MEGA و chunking فعلاً فعال نیستند. دسترسی inherited پوشه و ACL اختصاصی نیازمند تعریف سیاست سازمانی است؛ تا آن زمان به نقش + مالکیت محرمانه محدود می‌ماند. دادهٔ اولیهٔ mock را نباید به‌عنوان دارایی واقعی نمایش داد.

## گزارش اجرایی همین مرحله
- مرحلهٔ ۱: بررسی انجام شد؛ نقشهٔ داده/امنیت بالا ثبت شد. ریسک اصلی: دادهٔ `DomainRecord` قبلی حاوی بایت فایل نیست و قابل انتقال بی‌ضرر به مخزن واقعی نیست.
- مرحلهٔ ۲ (هسته اولیه): migrationهای 000004/000005، مدل‌ها، سرویس واحد `DamService`، ثبت فایل خصوصی یا متن ساده، نسخهٔ اولیه و نسخه‌سازی/بازیابی append-only. APIهای جدید زیر `/api/v1/dam/library`. checksum SHA-256، تراکنش و حذف فایل تازه در خطای DB؛ دانلود فقط پس از احراز هویت و مجوز.
- مرحلهٔ ۳ (رابط اولیه): نمای مشترک همه/فایل‌ها/دیتابیس اطلاعات، جست‌وجو، فیلتر وضعیت/محرمانگی، pagination، ثبت چند فایل با نتیجه مستقل، درصد upload مرورگر و retry موارد شکست‌خورده، ثبت متن و انتخاب دارایی موجود از پروژه/وظیفه. وضعیت progress مربوط به ارسال بایت است و تأیید ثبت فقط پس از پاسخ سرور است.
- مرحلهٔ ۴ (جزئی): نمایش نسخه‌ها و بازیابی، ثبت فعالیت create/update/download/attach/delete/restore/version؛ مجوز نقش + قاعدهٔ مالک/مدیر برای confidential. ACL اختصاصی، quota، bulk، پاک‌سازی orphan و audit کامل هنوز باقی است.
- مرحلهٔ ۵ (جزئی): صفحهٔ پروژه و جزئیات وظیفهٔ دارای id سروری از درگاه مرکزی استفاده می‌کنند؛ اتصال دپارتمان/چت/جلسه و حذف مسیرهای legacy باقی است.
- مرحلهٔ ۶ (نیمه‌تمام): Feature test در `backend/tests/Feature/DamLibraryTest.php` برای آپلود، متن، جست‌وجو، رابطهٔ چندپروژه‌ای، مجوز محرمانه و restore اضافه شده؛ **به‌علت نبود PHP/Composer در محیط فعلی اجرا نشده‌اند**. TypeScript `tsc --noEmit` بدون خطا پاس شده. اجرای واقعی تست‌ها روی ماشین مجهز به PHP لازم است.

### استقرار و معیار ایمنی
`cd backend && php artisan migrate && php artisan test --filter=DamLibraryTest`
پس از آن فرانت را اجرا کنید. فایل‌ها در disk `local` خصوصی هستند؛ `/storage` عمومی برای آنها استفاده نمی‌شود. لینک دانلود API نیازمند نشست/توکن معتبر است. برای فایل‌های ۲۰ مگابایتی، `upload_max_filesize` و `post_max_size` PHP و وب‌سرور باید هماهنگ باشند. MEGA و chunk upload غیرفعال‌اند. پوشه‌ها ساختار منطقی DB هستند، فایل فیزیکی به پوشهٔ نامی منتقل نمی‌شود.

### API اولیه
- `GET/POST /dam/library`، `GET/PATCH/DELETE /dam/library/{asset}`، `POST /dam/library/{asset}/restore`
- `GET /dam/library/{asset}/download`، `POST /dam/library/{asset}/relations` (project/task/department)
- `POST /dam/library/{asset}/versions`، `POST /dam/library/{asset}/versions/{version}/restore`
- `GET/POST /dam/library/folders`, `PATCH /dam/library/folders/{folder}`, `GET/POST /dam/library/categories`
- مسیرهای خواندن قدیمی `/dam/assets` و `/dam/folders` برای بازخوانی داده‌های پیشین محفوظ‌اند؛ `POST /dam/assets` از این پس با 410 رد می‌شود تا metadata به‌جای فایل واقعی تولید نشود. **رکوردهای قبلی دارایی واقعی نیستند**. برای ثبت جدید فقط `/dam/library` استفاده شود.

**محدودیت‌های فعلی / عدم اعلام تکمیل:** upload پوشه با حفظ ساختار، انتخاب چند پروژه در فرم (API ارتباط چندگانه دارد)، ACL پوشه/کاربر/نقش، حذف فیزیکی امن و جمع‌آوری orphan، metadata batch، دسته‌بندی و پوشه‌های پیشرفته، preview رسانه، diff متنی، جست‌وجوی full-text، اتصال گفتگو/جلسه/دپارتمان و مهاجرت داده‌های قدیمی هنوز پیاده نشده‌اند. فرم محتوا عمداً plain text است تا HTML بدون sanitizer وارد سامانه نشود. درج فایل از مسیرهای قدیمی در صفحات legacy هنوز ممکن است؛ ادغام همهٔ این نقاط نیازمند مرحلهٔ جداگانهٔ انتقال داده و رابط است. نام «فایل‌های ضمیمه قدیمی» نباید با فایل ذخیره‌شدهٔ واقعی اشتباه گرفته شود.
