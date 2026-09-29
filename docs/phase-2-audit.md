# ممیزی فاز دوم — ۲۰۲۶/۰۹/۲۹

> **به‌روزرسانی جدیدتر:** [وضعیت تجمیعی تکمیل دو فاز](phase-completion-status.md) مرجع آخرین کد، آزمون‌ها، migration و موانع باز است. اعداد و فهرست نواقص زیر گزارش تاریخی اجراهای قبلی‌اند؛ بخشی از آن‌ها اکنون رفع شده است. تکمیل صددرصد همچنان تأیید نشده است.

## وضعیت واقعی قبل از تغییر

شاخه `arena/01a0e7dd-main-tadbir` است. برخلاف گزارش جلسهٔ قبلی، HEAD این checkout برابر `aefe1af7` است و تغییرات قبلی دپارتمان/بله/انتشار/فاز اول به صورت working-tree موجودند. آن‌ها baseline این کار هستند؛ reset/checkout یا حذف آن‌ها انجام نمی‌شود. dependencyهای محیط اجرای قبلی باقی نمانده‌اند و تست‌ها باید دوباره اجرا شوند.

فاز اول به‌طور کامل تأیید نشده: Router/Auth/UI/Query/primitives وجود دارند، اما AppContext هنوز bootstrap گسترده، autosave قدیمی و stateهای optimistic دارد. MainLayout همهٔ صفحات را تا اتمام bootstrap متوقف می‌کند. پیش‌نیاز لازم این فاز: مستقل‌کردن loading صفحات دست‌خورده، محدودکردن bootstrap به مجوز/نیاز صفحه، cache صفحه‌بندی جدا از cache سازگاری جزئیات و invalidation درست.

## قابلیت‌های قابل استفاده

- مسیرهای واقعی پروژه/تسک/محتوا و RouteEntity برای detail مستقل؛ UIContext و React Router.
- client مشترک، خطای امن، cookie Sanctum، QueryClient scoped به user، Toast، Modal/Drawer با Escape و کنترل focus، PageHeader/Input/Select/Error/Empty/Loading.
- پروژه: index/detail/create/update با Resource و pagination؛ search/status/priority/manager از قبل؛ sort validation ندارد.
- تسک: index/detail/status و TaskOperations برای permission زمان اجرا؛ search/status/project/assignee و pagination؛ فیلتر سررسید/من و sort validated ندارد.
- محتوا: index/detail/update و publication command؛ index فقط search و pagination دارد. status/owner/sort باید به API افزوده شود.
- اعلان: DomainRecord با مالک user_id و update(read) موجود؛ خواندن همه و unread count سروری موجود نیست. فهرست فعلی فقط مالکیت را کنترل می‌کند، درحالی‌که NotificationAccess موجود ACL مقصد را نیز می‌شناسد؛ باید همان ACL قبل از pagination اعمال شود.
- approval واقعی موجود: مراحل payload محتوا (`pending_approval`/`ready_for_review`) و تسک‌های `content_review` حاصل از ContentStageTaskSync. permission `content.approve` موجود است. **approveStage/rejectStage فعلی صرفاً mutation محلی + PATCH عمومی است؛ endpoint فرمان امن تصمیم ندارد.** پیاده‌سازی مرکز بدون افزودن فرمان server-side به همین دامنه مجاز نیست.
- task attachment/comment/activity از API جزئیات برمی‌گردد؛ تاریخچهٔ قدیمی محتوا actor/time ارسالی کلاینت دارد و نباید به‌عنوان audit قابل اعتماد توسعه یابد.

## مجوز و محدودیت دامنه

- list/detail پروژه و تسک فعلاً permission ماژولی دارند، نه Policy محدودکنندهٔ شخصی؛ همین قرارداد حفظ می‌شود، ادعای ACL جدید سراسری نمی‌کنیم.
- داشبورد تنها widget دارای grant واقعی را درخواست می‌کند؛ taskهای امروز/عقب‌افتاده scoped به assignee فعلی؛ contentهای اقدام scoped به owner فعلی؛ اعلان scoped به گیرنده و ACL موجود.
- پروژهٔ «در معرض خطر» مدل محاسبهٔ قابل اعتماد ندارد؛ فقط در صورت استفاده از deadline واقعی می‌توان «سررسید گذشته» نامید، نه risk score ساختگی.
- فعالیت مرتبط شخصی endpoint scopeشدهٔ مناسب ندارد؛ در این فاز dashboard آن را نمایش نمی‌دهد.
- approval جلسات/نامه/ایده، saved view سازمانی، bulk پروژه/محتوا و همهٔ scopeهای دپارتمان API امن یکپارچه ندارند؛ موتور workflow، schema جدید و bulk نمایشی ساخته نمی‌شود.
- viewهای ذخیره‌شدهٔ اشتراکی وجود ندارد؛ URL فیلترها قابل اشتراک است. رکورد حساس در localStorage ذخیره نخواهد شد.

## طرح مرحله‌ای و ریسک‌ها

1. validation فهرست، sort allowlist، pagination واقعی و فیلترهای کوچک backend؛ آزمون مستقل.
2. کارتابل با queryهای مستقل و مجوز قبل از fetch؛ عدم انسداد روی bootstrap سراسری.
3. الگوی مشترک سه فهرست با query string معتبر، paging backend و حفظ زمینهٔ detail؛ عدم حذف componentهای قدیمی کاربردی سایر صفحات.
4. پیش‌نمایش مشترک اطلاعات واقعی سه موجودیت و لینک صفحهٔ کامل؛ بازگشت به فهرست با فیلتر.
5. مرکز بررسی فقط برای workflow واقعی محتوا، مشروط به فرمان دارای lock/permission/version؛ سایر workflowها خارج از دامنه.
6. اعلان API-first و مقصد مستقل از حضور رکورد در اولین صفحه؛ count سروری و ACL قبل از page.

ریسک اصلی: autosave قدیمی ممکن است پاسخ جدید یا تغییر review را دوباره PATCH کند؛ دادهٔ pagination نباید جای همهٔ دادهٔ facade تلقی شود. عملیات تأیید با PATCH عمومی نباید قابل دورزدن باشد. اعلان‌های با مقصد حذف‌شده باید بدون افشای متن خصوصی پنهان/کنترل شوند. SQL JSON باید در SQLite و MySQL سازگار بماند؛ آزمون SQLite تأیید MySQL نیست. فاز دوم تا عبور تست‌ها و ثبت محدودیت‌های واقعی Done اعلام نمی‌شود.

---

## نتیجهٔ اجرای این نوبت

**وضعیت: پیاده‌سازی اصلی و تست‌های زیر انجام شده، ولی کل فاز دوم و پیش‌نیازهای فاز اول هنوز Done نیستند. روی هاست مستقر نشده و commit/push انجام نشده است.** تغییرات روی همان شاخه و کنار تغییرات قبلی باقی مانده‌اند. موارد ابتدای سند ممیزی قبل از اجرا هستند؛ جدول‌های زیر وضعیت بعد از اجرا را نشان می‌دهند.

### قابلیت‌های اجراشده

| بخش | نتیجه و مرز واقعی |
|---|---|
| کارتابل من | شش query مستقل: تسک‌های امروز من، تسک‌های عقب‌افتادهٔ من، بررسی‌های محتوای من، محتوای باز متعلق به من، اعلان‌های نخوانده، پروژه‌های تحت مدیریت من با سررسید گذشته. هر بخش loading/error/empty مستقل دارد؛ مجوز قبل از fetch بررسی می‌شود. پروژهٔ overdue «پیش‌بینی ریسک» نیست. |
| سه فهرست اصلی | PageHeader، FilterBar، search/status و فیلترهای دامنه‌ای، حذف فیلتر/reset، جدول و کارت واقعی، تعداد و صفحه‌بندی سرور. sort/direction/page/per_page در URL؛ refresh، Back/Forward و اصلاح صفحهٔ خارج از محدوده آزموده شده‌اند. bulk نمایشی اضافه نشد. |
| جزئیات | پیش‌نمایش مشترک پروژه/تسک/محتوا با اطلاعات واقعی، ID مسئول، وضعیت و تاریخ؛ Drawer قابل بازیابی از URL و بازگشت به همان فیلترها. صفحهٔ کامل تسک اضافه شد. جریان‌های قدیمی صفحهٔ کامل پروژه/محتوا حفظ شده‌اند و مهاجرت کامل related tabs **انجام نشده** است. |
| مرکز بررسی | فقط نوع واقعی `content_stage` بر مبنای تسک `content_review` و مرحلهٔ منبع. تأیید/عودت با فرمان رسمی، تأیید نهایی در modal، علت الزامی عودت، pending lock، نگه‌داشتن متن هنگام خطا، toast و refresh بعد از موفقیت. نام درخواست‌کننده حدس زده نمی‌شود؛ مدل فعلی actor معتبرِ ارجاع را به این endpoint نمی‌دهد. |
| اعلان | inbox صفحه‌بندی‌شده، فیلتر read/type با انواع واقعی سرور، شمارندهٔ authoritative، خواندن تکی و همگی فقط پس از موفقیت سرور. badge و inbox در تب فعال هر ۶۰ ثانیه و هنگام focus دوباره query می‌شوند. متن بدون مقصد حفظ می‌شود. مقصد مستقیم با ID باز می‌شود، نه جست‌وجو در cache صفحهٔ اول. |
| دسترس‌پذیری | focus قابل مشاهده، Escape، focus containment/restore و fallback به main، label دکمه‌های آیکنی دست‌خورده، وضعیت متنی، scroll محدود جدول، wrap متن در الگوی مشترک. سناریوهای موبایل ۳۹۰ و تبلت ۷۶۸ پیکسل اجرا شدند؛ این معادل ممیزی جامع همهٔ صفحات قدیمی نیست. |
| demo/پیش‌نیازها | API production هرگز به دادهٔ نمونه fallback نمی‌کند. bootstrap فهرست‌های اصلی و اعلان از query صفحه جدا شد؛ سایر facadeهای قدیمی باقی‌اند. مرکز بررسی و inbox عملیاتی در demo پیام عدم دسترسی دارند، نه pending دائمی یا فرمان نمایشی. |

### قرارداد endpointها

همهٔ مسیرهای زیر زیرمجموعهٔ `/api/v1` و نیازمند احراز هویت موجود هستند؛ هیچ schema جدیدی برای فاز دوم اضافه نشد.

| endpoint | استفاده/تغییر و مجوز |
|---|---|
| `GET /projects` | `projects.view`؛ search/status/priority/project_manager_id/due. پروژه‌های completed/cancelled/archived وارد فیلتر overdue/today نمی‌شوند. |
| `GET /tasks` | `tasks.view`؛ search/status/priority/project_id/assignee_id/assignee=me/due. تسک‌های بسته وارد today/overdue نمی‌شوند. |
| `GET /contents` | `content.view`؛ search/status/owner=me/project_id. فیلتر open وضعیت‌های نهایی مشخص‌شده در controller را حذف می‌کند. |
| سه index بالا | page بین ۱ و ۱۰۰۰۰۰؛ per_page پیش‌فرض ۲۰ و حداکثر ۱۰۰؛ sort فقط created_at/updated_at/deadline و direction فقط asc/desc. پارامتر ناشناخته یا نامربوط به ماژول رد می‌شود. sort ثانویهٔ ID ترتیب پایدار می‌دهد. وضعیت محتوا قابل پیکربندی است و enum ثابت پروژه/تسک به آن تحمیل نشده است. |
| `GET /projects/{id}`, `/tasks/{id}`, `/contents/{id}` | endpointهای موجود برای جزئیات مستقل از صفحهٔ اول؛ permissions موجود حفظ شده‌اند. task detail بخش‌های واقعی comments/attachments/activity را از Resource موجود می‌گیرد. |
| `GET /notifications` | recipient + ACL مقصد قبل از pagination/count؛ read=read\|unread، type، page و per_page حداکثر ۲۰۰. `meta.unread_count` کل unread مجاز است، نه فقط صفحه/فیلتر فعلی؛ `meta.types` انواع قابل مشاهده را می‌دهد. |
| `PUT /notifications/{id}` | مسیر موجود؛ mark read با بررسی مالک و دسترسی مقصد. خطای 403/500 در UI باعث خوانده‌شدن کاذب نمی‌شود. |
| `POST /notifications/read-all` **جدید** | یک SQL update محدود به recipient و ACL و سقف ID ابتدای تراکنش؛ فقط payload.read عوض می‌شود. نتیجه `data.updated`، محدودیت ۱۰ درخواست در دقیقه. |
| `GET /approvals` **جدید** | `content.view` و `content.approve` + بررسی‌کنندهٔ واقعی مرحله؛ فقط pending_approval/ready_for_review معتبر. page/per_page≤100 و فیلترهای item/content_id/stage_id. ردیف متعلق به دیگری یا منبع منقضی قبل از count/page کنار گذاشته می‌شود. |
| `POST /contents/{content}/stages/{stage}/decision` **جدید** | decision=approve\|reject، expectedVersion با طول ۶۴ و note حداکثر ۳۰۰۰؛ note در reject اجباری. actor فعال، مجوزها و assignment هنگام اجرا دوباره بررسی می‌شوند؛ lock و version از اثر تکراری/تصمیم stale جلوگیری می‌کنند. |

فرمان بررسی: 403 برای reviewer/permission نامعتبر، 409 برای مرحلهٔ تمام‌شده یا version قدیمی، 404 برای مرحلهٔ ناموجود و 422 برای ورودی نامعتبر. `reviewVersion` و `reviewableStageIds` به ContentResource اضافه شده‌اند. version به وضعیت محتوا، owner، approver و مراحل وابسته است.

PATCH عمومی دیگر نمی‌تواند approve/reject، metadata تصمیم یا بازکردن دوبارهٔ approved را جعل کند؛ بستن مستقیم تسک review هم مسیر جایگزین تأیید نیست. تغییر ساختار مراحل/reviewer محتوای موجود مجوز `content.manage_process` یا `workflows.manage` می‌خواهد؛ تغییر owner/approver در بررسی باز نیز محافظت شده است. آرایهٔ مراحل باید list با IDهای متمایز و وضعیت‌های واقعی مرحله باشد. تاریخچهٔ **تصمیم جدید** actor/time سروری دارد؛ تاریخچهٔ قدیمی client-supplied به audit معتبر تبدیل نشده است.

### مسیرهای رابط کاربری

- `/dashboard`: کارتابل من.
- `/projects`, `/tasks`, `/contents`: فیلترها، sort/direction، page/per_page، view=list|cards و preview=ID در URL.
- `/projects/:id`, `/contents/:id`: جزئیات موجود + زمینهٔ بازگشت.
- `/tasks/:id?display=page`: صفحهٔ کامل؛ لینک قدیمی تسک و hint دارایی همچنان معتبرند.
- `/approvals?page=&item=&content=&stage=`: مرکز بررسی و لینک مستقیم مورد/مرحله؛ فقط نوع بررسی محتوا.
- `/notifications?read=&type=&page=`: inbox. `returnTo` تنها مسیرهای داخلی مجاز را می‌پذیرد؛ URL بیرونی مبنای redirect نمی‌شود.

Saved view سازمانی/جدول جدید، global search، calendar، analytics، approval جلسه/ایده/نامه و engine جدید ساخته نشده‌اند. URL فیلتر قابل اشتراک است؛ قابلیت نام‌گذاری/ذخیرهٔ view شخصی نیز در این نوبت اضافه نشده است.

### فایل‌های اصلی اضافه/اصلاح‌شدهٔ فاز دوم

**Backend** (زیر `backend/`):
- جدید: `app/Http/Requests/WorkspaceListRequest.php`، `app/Services/NotificationInbox.php`، `app/Services/ContentReview.php`، `app/Http/Controllers/Api/V1/NotificationInboxController.php`، `app/Http/Controllers/Api/V1/ApprovalController.php`، `tests/Feature/PhaseTwoWorkspaceTest.php`.
- اصلاح: `routes/api.php`، controllerهای Project/Task/Content/DomainRecord، `ContentRequest.php`، `ContentResource.php`، `ContentStageTaskSync.php` و `TaskOperations.php`.

**Frontend** (زیر `frontend/`):
- الگو/صفحات: `src/components/common/WorkspacePatterns.tsx`، `src/components/workspace/{ActionDashboard,WorkspaceList,details,ApprovalCenter,NotificationInbox}.tsx`.
- query/URL: `src/queries/workspacePages.ts`، `src/routing/{listQuery,usePageCorrection}.ts`، route configuration و types.
- اتصال: `src/App.tsx`، contextهای App/UI، API client/contents/notifications، TopNavbar/Sidebar، Primitives، TaskDetailDrawer، ProjectDetailView و ContentDetailView.
- آزمون: `e2e/phase2.spec.ts`، `tests/phase2.test.mjs`، پیکربندی Playwright؛ سناریوهای فاز اول نیز دوباره اجرا شدند.
- artifact: `dist/index.html`، `dist/assets/*`، `.htaccess` و favicon؛ build از source انجام شد، نه ویرایش دستی dist.

این فهرست مخصوص فاز دوم است؛ diff کلی مخزن شامل کارهای قبلی بله/دپارتمان/انتشار/فاز اول نیز هست و نباید همهٔ آن به فاز دوم نسبت داده شود.

### نتایج واقعی آخرین اعتبارسنجی

| اجرا | نتیجه |
|---|---|
| `npm ci` | موفق، ۰ vulnerability گزارش‌شده هنگام نصب |
| `npm --prefix frontend run lint` | موفق؛ اسکریپت مخزن `tsc --noEmit` است، نه ESLint |
| `npm --prefix frontend test` | **۳۲/۳۲** تست Node موفق |
| build با demo=false و آدرس API/Sanctum تولید | موفق؛ **۷٫۷۶ ثانیه**، JS حدود ۲۸۵۹٫۶۷KB / gzip ۶۵۳٫۹۲KB؛ هشدار chunk بزرگ باقی |
| Playwright روی همین dist با `vite preview` | **۲۷/۲۷**؛ شامل ۱۱ سناریوی فاز اول و ۱۶ سناریوی فاز دوم، با API mock |
| Playwright demo صریح روی dev مجزا | **۱/۱**؛ برچسب demo، دادهٔ نمونه و صفر درخواست API |
| کل PHPUnit مستقیم با PHP-WASM 8.5.10 / SQLite | **۲۳۲ تست، ۱۲۳۵ assertion، همگی موفق**؛ ۳۳٫۴۶۳ ثانیه |
| route:list API | **۱۶۷ route** |
| optimize:clear در محیط آزمون | موفق |
| Pint فایل‌های PHP دست‌خورده / git diff --check | موفق |

مرورگر: خطا/empty مستقل کارتابل، عدم fetch ماژول بدون مجوز، URL/filter/page/Back/Forward/refresh، safe defaults، preview/صفحهٔ کامل/returnTo، مقصد خارج از اولین صفحه و مقصد حذف‌شده، خطای read و ثبت موفق، read-all/count، تصمیم ناموفق با حفظ note و تصمیم موفق، keyboard notification، موبایل و تبلت. بک‌اند: pagination/filter/sort/query نامعتبر، 401/403/404/409/422، مالکیت و scope اعلان قبل از page/count، reviewer دیگر با همان role، جلوگیری از self-rerouting و PATCH جعلی، version stale/کلیک تکراری و حفظ کار تکمیل‌شده هنگام رد. آزمون‌های خطای امن و انتشار/مجوزهای قبلی هم در regression کامل اجرا شدند.

**محدودیت روش آزمون:** `artisan test` در PHP-WASM این محیط فقط usage چاپ کرد و تستی اجرا نکرد؛ نتیجهٔ بالا از اجرای مستقیم `vendor/bin/phpunit` است. workaround کنسول (`mockConsoleOutput=false`) تنها حین اجرای suite اعمال و فایل TestCase پس از اجرا بازگردانده شد. Playwright با API mock حتی روی dist نهایی، آزمون زندهٔ Sanctum/MySQL نیست. Apache/HTTPS/هاست واقعی، DB تولید و بله در این نوبت آزمایش یا تغییر داده نشدند.

### موانع اعلام Done و ریسک‌های باقی‌مانده

1. پیش‌نیازهای کامل فاز اول هنوز بسته نشده‌اند؛ به‌خصوص mutation/autosave سراسری، archive/restore دقیق و اتمیک‌بودن ساخت از template. مهاجرت تدریجی است، نه حذف facade.
2. related tabs بعضی جزئیات قدیمی از cache محدود bootstrap (مثلاً نخستین ۱۰۰ تسک) و فیلتر محلی استفاده می‌کنند؛ **فقط سه فهرست اصلی pagination واقعی جدید دارند**. این تب‌ها هنوز مرجع کامل روابط در دیتاست بزرگ نیستند. استانداردسازی سراسری header/sections صفحات کامل هم تمام نشده است.
3. **عودت مرحله هنوز correction-task جدیدِ لینک‌شده نمی‌سازد.** کار و تاریخچهٔ تکمیل‌شده حفظ می‌شوند و مرحله به revisions_needed می‌رود؛ زنجیرهٔ اصلاح Smart Tasks خواستهٔ قبلیِ انجام‌نشده است، نه قابلیت تحویل‌شدهٔ این مرکز. completion معمولی و عملیات مرتبط قدیمی نیازمند آزمون میدانی بیشتری‌اند.
4. queue review ابتدا candidateهای ارجاع‌شده را chunkهای ۲۰۰تایی بررسی و IDهای مجاز را نگه می‌دارد، سپس paginate می‌کند. hydration محدود است اما زمان/حافظهٔ IDها و whereIn با اندازهٔ صف رشد می‌کند؛ برای صف بسیار بزرگ راه‌حل indexed/projection لازم است و schema آن در این فاز اضافه نشد.
5. SQL مربوط به JSON/read-all روی SQLite تست شده، **MySQL/MariaDB هاست هنوز تأیید نشده است**. مقایسهٔ نوع JSON/boolean و اجرای scoped update روی کپی DB باید gate انتشار باشد.
6. ACL ماژولی پروژه/تسک/محتوا همان قرارداد موجود است؛ فیلتر «من» Policy شخصی جدید نیست. ممیزی جامع exceptionهای شخصی/دپارتمانی تمام ماژول‌ها باقی است. در اعلان/تصمیم جدید scope سمت سرور اجرا می‌شود، نه صرفاً hide در UI.
7. widget فعالیت حذف است چون actor scoping قابل اتکا ندارد؛ مدل risk پیش‌بینی‌شده هم وجود ندارد. requester بررسی و تاریخچهٔ قابل اعتماد برای همهٔ workflowها اختراع نشده‌اند.
8. «امروز/عقب‌افتاده» براساس تاریخ سرور است (پیش‌فرض UTC)، نمایش تاریخ جلالی است؛ تغییر timezone سازمان تصمیم جداگانه با تست مرز روز می‌خواهد.
9. bundle بزرگ، تست جامع همهٔ breakpointها/فرم‌های قدیمی و آزمون یکپارچه با cookie واقعی باقی‌اند. نبود SSH/Cron نباید با endpoint عمومی اجرای artisan دور زده شود.

### اجرا و انتشار دستی

مرجع عمومی: [`deployment.md`](deployment.md). نکات لازم همین نسخه:

```bash
# روی دستگاه توسعه/CI، نه هاست بدون SSH
npm --prefix frontend ci
npm --prefix frontend run lint
npm --prefix frontend test
VITE_DEMO_MODE=false \
VITE_API_URL=https://api-tadbir.morvarid-daron.ir/api/v1 \
VITE_SANCTUM_URL=https://api-tadbir.morvarid-daron.ir \
npm --prefix frontend run build

# PHP بومیِ سازگار با composer.lock و extensionهای موردنیاز
cd backend
composer install
php artisan test
php artisan route:list --path=api/v1
```

برای توسعهٔ محلی تازه، ابتدا `.env.example` را بدون بازنویسی فایل موجود به `.env` کپی و دیتابیس محلی را تنظیم کنید. `php artisan key:generate` فقط برای محیط محلی تازه است؛ **کلید نصب موجود/تولید را عوض نکنید**. پس از آماده‌سازی migrationهای لازم روی DB محلی، بک‌اند را با `php artisan serve --host=0.0.0.0 --port=8000` اجرا کنید؛ proxy Vite به این پورت متصل می‌شود. این دستورات مخصوص دستگاه توسعه‌اند، نه هاست فاقد SSH.

برای مرورگر، در ترمینال جدا `npm --prefix frontend run dev` و سپس `npm --prefix frontend run test:e2e`؛ نصب Chromium Playwright لازم است. برای آزمون همان artifact: `npm --prefix frontend run preview -- --host 0.0.0.0 --port 3002` و `E2E_BASE_URL=http://127.0.0.1:3002 npm --prefix frontend run test:e2e`. در sandbox حاضر Chromium خارجی با `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/tmp/chromium` و `LD_LIBRARY_PATH=/tmp/al2023/lib` استفاده شد.

1. ابتدا روی کپی DB و حساب‌های آزمایشی مجاز/غیرمجاز تست کنید: detail خارج از صفحهٔ اول، approve/reject/stale version، unread count/read-all و MySQL JSON. عضویت، اطلاعات خصوصی و کارهای تکمیل‌شده نباید از scope خارج یا بازنویسی شوند.
2. backup کد/DB/فایل خصوصی و `.env` بگیرید. frontend و backend را **هماهنگ** منتشر کنید؛ کلاینت قدیمی که تصمیم را PATCH عمومی می‌فرستد با guard جدید رد می‌شود. کاربر باید hard reload کند.
3. فاز دوم migration جدید ندارد؛ migrationهای قبلی دپارتمان/انتشار/اصلاح archive همچنان پیش‌نیاز مستقل‌اند. PHP و extensionهای لازم را با الزامات Composer روی هاست بررسی کنید؛ موفقیت PHP-WASM تضمین هاست نیست.
4. تمام `frontend/dist/` شامل `.htaccess` را در ریشهٔ پنل `https://tadbir.morvarid-daron.ir/` قرار دهید. backend فقط از `public/` در دامنهٔ API سرو شود. سازگاری autoload/OPcache و route/config cache با File Manager/کنترل‌پنل و روش مستند امن بررسی شود؛ فایل PHP عمومی برای migrate/cache clear نسازید.
5. CORS/credentials، SANCTUM_STATEFUL_DOMAINS، SESSION_DOMAIN، secure cookie و HTTPS را برای دو دامنهٔ واقعی تنظیم کنید؛ APP_DEBUG=false و APP_KEY موجود را حفظ کنید. متغیر VITE_* secret نیست و نباید token بگیرد.
6. نه Cron/queue worker جدیدی لازم این صفحات است و نه فراهم فرض شده است. این ادعا برای automationهای قدیمیِ خارج از فاز دوم نیست.
7. smoke دستی با دو حساب و مجوزهای متفاوت، refresh مسیر مستقیم و صفحهٔ موبایل انجام شود؛ سپس پنل برای استفاده باز شود. rollback باید کد و dist متناظر را با هم برگرداند، نه DB کاربران را بی‌بررسی overwrite کند.

`frontend/dist` از ignore خارج و artifact نهایی در index قرار دارد. تعداد فایل‌های trackشدهٔ node_modules **صفر** است و نصب محلی حفظ شده؛ env واقعی از index خارج است. در بررسی نهایی، فایل محلی `backend/.env` موجود نبود؛ credential یا APP_KEY تولید از تاریخچه بازیابی/بازسازی نشده است. فقط دو `.env.example` track شده‌اند. برای اجرای واقعی باید تنظیمات محیط امن موجودِ نصب را فراهم کرد. حذف‌های حجیم diff مربوط به dependencyهای قبلاً trackشده‌اند. این کار secret را از تاریخچهٔ Git پاک نمی‌کند؛ اگر credential واقعی قبلاً منتشر شده، تعویض امن آن اقدام جداگانهٔ لازم است.

### ادامهٔ محدود پیشنهادی

ابتدا gateهای فوق و پیش‌نیازهای باقی‌مانده را ببندید: آزمون واقعی Sanctum/MySQL، query صفحه‌بندی‌شدهٔ روابط جزئیات و API-first mutationهای باقی‌مانده. سپس در کار جداگانهٔ Smart Tasks، correction-chain غیرمخرب و idempotent و در صورت نیاز projection صف بزرگ را طراحی کنید؛ split bundle نیز تغییر مستقل کوچک باشد. افزودن ماژول جست‌وجو/تقویم/analytics یا engine تازه جای این موارد را نمی‌گیرد.
