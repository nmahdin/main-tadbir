# محیط نمایشی توسعه (Development Demo Seeder)

دادهٔ نمایشی **فقط** برای توسعهٔ محلی/تست است: هیچ‌وقت روی دیتابیس تولید
اجرا نمی‌شود، در `DatabaseSeeder` نیست و خودکار اجرا نمی‌شود.

## ۱) بوت‌استرپ دیتابیس تازه (Laragon، دیتابیس خالی)

پیش‌نیاز: در `backend/.env` رمزهای اولیهٔ `SEED_MAHDI_PASSWORD` و
`SEED_EMAD_PASSWORD` و `SEED_AMIRALI_PASSWORD` (راهنما: `docs/seeders.md`)
و پنج رمز نمایشی زیر تنظیم شده باشند (هرکدام حداقل ۸ نویسه، متفاوت):

```
DEMO_PLATFORM_PASSWORD=
DEMO_PERSONAL_PASSWORD=
DEMO_ORG_OWNER_PASSWORD=
DEMO_ORG_MEMBER_PASSWORD=
DEMO_ORG_MEMBER2_PASSWORD=
```

سپس، فقط روی دیتابیس **خالی**:

```bash
cd backend
php artisan migrate --seed
php artisan db:seed --class=DevelopmentDemoSeeder
```

- `migrate:fresh`، `db:wipe` و هر reset مخرب ممنوع است؛ روی دیتابیس
  دارای داده فقط همان دستور دوم (سیدر نمایشی) را اجرا کنید — کاملاً
  افزایشی و تکرارپذیر است.
- سیدر نمایشی به‌تنهایی هم کافی است: Permission/Role سیدرها، کاتالوگ
  مجوزها، نقش اصلی پلتفرم و انتشار بسته‌های Free
  (`plans:provision-free`) را به‌صورت idempotent خودش تضمین می‌کند.

## ۲) حساب‌های نمایشی و دسترسی

رمز هر حساب فقط از متغیر محیطی متناظر در `.env` خوانده می‌شود؛ در
مخزن هیچ رمز ثابتی نیست و اجرای دوباره رمز موجود را بازنویسی نمی‌کند.
ورود با نام کاربری است (اسکیمای حساب‌ها ایمیل ندارد).

| نام کاربری | رمز از | نقش و محیط |
|---|---|---|
| `demo.platform` | `DEMO_PLATFORM_PASSWORD` | مدیر اصلی پلتفرم — پوستهٔ Platform در `/select-environment` و داشبورد مدیریت پلتفرم |
| `demo.personal` | `DEMO_PERSONAL_PASSWORD` | کاربر عادی — فضای شخصی با Personal Free فعال |
| `demo.owner` | `DEMO_ORG_OWNER_PASSWORD` | مالک سازمان — Organization Free، نقش Organization Manager |
| `demo.member` | `DEMO_ORG_MEMBER_PASSWORD` | عضو سازمان + عضو فضای کاری پیش‌فرض سازمان |
| `demo.member2` | `DEMO_ORG_MEMBER2_PASSWORD` | عضو سازمان **بدون** عضویت فضای کاری (تفاوت سازمان/فضای کاری در ناوبری دیده می‌شود) |


## ۳) داده‌های ساخته‌شده (شمارش دقیق)

- ۵ حساب، ۵ فضای کاری شخصی (هرکدام اشتراک Personal Free فعال) — همه
  از مسیر واقعی `PersonalWorkspaceProvisioner` + `FreePlanActivator`.
- ۱ سازمان (`demo-org`) با فضای کاری پیش‌فرض و اشتراک Organization
  Free (خودکار از `OrganizationProvisioner`) و دقیقاً ۳ عضو فعال
  (سقف Free): مالک، `demo.member`، `demo.member2`.
- پروژه‌ها: شخصی ۳ (۲ فعال/درجریان + ۱ تکمیل‌شده)، سازمانی ۴ (۳ + ۱) —
  در سقف Free؛ یک جای خالی برای ساخت تعاملی باقی می‌ماند.
- وظایف: برای هر پروژه ۳ وظیفه (مجموع ۲۱) با وضعیت‌های
  backlog/todo/in_progress، تخصیص‌یافته، اولویت و سررسید امروز/فردا/
  روزهای آینده — تقویم سامانه همین رکوردهای تاریخ‌دار را تجمیع می‌کند
  و «رکورد تقویمی» جداگانه‌ای در بک‌اند وجود ندارد.
- اعلان‌ها: برای `demo.personal` و `demo.owner` هرکدام ۲ اعلان عادی
  (`DomainRecord` با دامنهٔ notification): یکی خوانده‌نشده، یکی خوانده‌شده.

## ۴) آزمون‌ها

`backend/tests/Feature/DevelopmentDemoSeederTest.php`:

- ساخت هر سه پوسته + اشتراک‌های Free و شمارش رکوردها؛
- تکرارپذیری کامل و عدم بازنویسی رمز تغییرکرده؛
- مشاهده‌پذیری از API واقعی `/api/v1/core/environments` و جداسازی
  tenantها (شخصی بدون سازمان؛ عضوِ بدون فضای کاری)؛
- توقف بدون رمزهای محیطی؛ خودداری صریح از محیط production.

## ۵) عمداً ساخته نمی‌شود (بدون ادعای وجود)

- فایل نمونهٔ DAM آپلود نمی‌شود (باینری ساختگی ساخته نمی‌شود؛ حجم
  مصرفی تا آپلود واقعی صفر است).
- رکوردهای نمونهٔ Contents/Meetings/Secretariat ساخته نمی‌شوند؛
  صفحه‌هایشان در دمو خالی‌اند.
- هیچ دادهٔ پرداخت/صورتحساب (M2–M6 پیاده‌سازی‌نشده و غیرمجاز است).
- حساب‌ها ایمیل/تلفن ندارند؛ ورود فقط با نام کاربری است.
