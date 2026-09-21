<?php

namespace Database\Seeders;

use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     *
     * ترتیب اجرا بر اساس وابستگی‌های کلید خارجی است:
     * دسترسی‌ها → نقش‌ها (به دسترسی‌ها وابسته‌اند) → چارت سازمانی → کاربران →
     * تیم‌ها و پروژه‌ها (به کاربران وابسته‌اند) → وظایف، دیدگاه‌ها و پیوست‌ها.
     *
     * نکته: بین «دپارتمان» و «کاربر» وابستگی دوطرفه وجود دارد (هر کاربر یک دپارتمان و
     * هر دپارتمان یک مدیر دارد)؛ به همین دلیل DepartmentSeeder دو بار اجرا می‌شود.
     * اجرای دوم idempotent است و فقط فیلد manager_id را تکمیل می‌کند.
     */
    public function run(): void
    {
        $this->call([
            // 1) مجوزها و ماتریس دسترسی پایه
            PermissionSeeder::class,

            // 2) نقش‌های سازمانی و اتصال آن‌ها به مجوزها
            RoleSeeder::class,

            // 3) ساختار درختی دپارتمان‌ها (بدون مدیر، چون هنوز کاربری وجود ندارد)
            DepartmentSeeder::class,

            // 4) کاربران اولیه و اتصال هر کاربر به نقش و دپارتمان خود
            UserSeeder::class,

            // 5) پاس دوم دپارتمان‌ها: انتصاب مدیر دپارتمان پس از ساخته‌شدن کاربران
            DepartmentSeeder::class,

            // 6) تیم‌ها و اعضای هر تیم
            TeamSeeder::class,

            // 7) الگوهای آماده پروژه
            ProjectTemplateSeeder::class,

            // 8) پروژه‌های نمونه و اعضای آن‌ها
            ProjectSeeder::class,

            // 9) وظایف، دیدگاه‌ها و پیوست‌های نمونه
            TaskSeeder::class,
        ]);
    }
}
