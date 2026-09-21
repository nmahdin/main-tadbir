<?php

namespace Database\Seeders;

use App\Models\Department;
use App\Models\User;
use Illuminate\Database\Seeder;

/**
 * چارت سازمانی سامانه تدبیر.
 *
 * ساختار درختی: «مدیریت ارشد سامانه» ریشه است، واحدهای ستادی (مهندسی، محصول، QA و ...)
 * فرزندان مستقیم آن و دپارتمان‌های تولید محتوا زیرمجموعه «دپارتمان جامع ارتباطات و رسانه» هستند.
 * ترتیب آرایه مهم است: والد همیشه قبل از فرزند آمده تا شناسه والد هنگام درج موجود باشد.
 */
class DepartmentSeeder extends Seeder
{
    /**
     * @var array<int, array{name: string, slug: string, description: string, parent: string|null, manager: string|null}>
     */
    public const DEPARTMENTS = [
        [
            'name' => 'مدیریت ارشد سامانه',
            'slug' => 'executive',
            'description' => 'ستاد فرماندهی، سیاست‌گذاری کلان و معماری سامانه تدبیر',
            'parent' => null,
            'manager' => 'sarah.changizi',
        ],
        [
            'name' => 'مدیریت پروژه',
            'slug' => 'pm',
            'description' => 'برنامه‌ریزی، زمان‌بندی و پایش پروژه‌های سازمان',
            'parent' => 'executive',
            'manager' => 'mehrdad.vesali',
        ],
        [
            'name' => 'تیم مهندسی نرم‌افزار',
            'slug' => 'engineering',
            'description' => 'توسعه و نگهداری محصولات نرم‌افزاری، فرانت‌اند و بک‌اند',
            'parent' => 'executive',
            'manager' => 'davood.kiani',
        ],
        [
            'name' => 'تیم طراحی محصول',
            'slug' => 'product-design',
            'description' => 'طراحی تجربه کاربری، رابط کاربری و دیزاین سیستم',
            'parent' => 'executive',
            'manager' => 'elena.rostami',
        ],
        [
            'name' => 'تضمین کیفیت و تست',
            'slug' => 'qa',
            'description' => 'آزمون نرم‌افزار، تضمین کیفیت خروجی‌ها و پایش پایداری',
            'parent' => 'executive',
            'manager' => 'nima.sharifi',
        ],
        [
            'name' => 'رشد و خدمات مشتریان',
            'slug' => 'customer-growth',
            'description' => 'توسعه بازار، آنبوردینگ مشتریان و پشتیبانی',
            'parent' => 'executive',
            'manager' => 'mahsa.kazemi',
        ],
        [
            'name' => 'تیم رشد و مارکتینگ',
            'slug' => 'marketing',
            'description' => 'بازاریابی دیجیتال، جذب مخاطب و تحلیل کمپین‌ها',
            'parent' => 'executive',
            'manager' => 'sara.mohammadi',
        ],
        [
            'name' => 'دپارتمان جامع ارتباطات و رسانه',
            'slug' => 'media',
            'description' => 'شورای سیاست‌گذاری و هدایت کلان فعالیت‌های چندرسانه‌ای',
            'parent' => 'executive',
            'manager' => 'sarah.changizi',
        ],
        [
            'name' => 'دپارتمان محتوا و نگارش',
            'slug' => 'content',
            'description' => 'تأمین متن، سناریونویسی، ویراستاری تخصصی و پژوهش رسانه‌ای',
            'parent' => 'media',
            'manager' => 'sarah.changizi',
        ],
        [
            'name' => 'دپارتمان گرافیک و هویت بصری',
            'slug' => 'graphic',
            'description' => 'طراحی پوستر، بنر، ست اوراق اداری، اینفوگرافیک و دیزاین بصری',
            'parent' => 'media',
            'manager' => 'elena.rostami',
        ],
        [
            'name' => 'دپارتمان تدوین و موشن‌گرافیک',
            'slug' => 'video',
            'description' => 'تدوین ویدئو، انیمیشن دو بعدی و سه‌بعدی، جلوه‌های بصری و مستند',
            'parent' => 'media',
            'manager' => 'ali.rezvani',
        ],
        [
            'name' => 'دپارتمان عکاسی و فیلمبرداری',
            'slug' => 'photo',
            'description' => 'عکاسی رویدادها، استودیو، تصویربرداری هوایی و پوشش تصویری جلسات',
            'parent' => 'media',
            'manager' => 'davood.kiani',
        ],
        [
            'name' => 'دپارتمان شبکه‌های اجتماعی',
            'slug' => 'social',
            'description' => 'مدیریت کانال‌های تلگرام، ایتا، بله، اینستاگرام، روبیکا و تعامل با مخاطب',
            'parent' => 'media',
            'manager' => 'mehrdad.vesali',
        ],
        [
            'name' => 'دپارتمان انتشار و پورتال رسمی',
            'slug' => 'publishing',
            'description' => 'انتشار رسمی در پایگاه خبری، ارسال به خبرگزاری‌ها و آرشیو سازمانی',
            'parent' => 'media',
            'manager' => 'sarah.changizi',
        ],
    ];

    public function run(): void
    {
        $userIds = User::query()->pluck('id', 'username');
        $departmentIds = [];

        foreach (self::DEPARTMENTS as $definition) {
            $department = Department::updateOrCreate(
                ['name' => $definition['name']],
                [
                    'description' => $definition['description'],
                    'parent_id' => $definition['parent'] ? ($departmentIds[$definition['parent']] ?? null) : null,
                    'manager_id' => $definition['manager'] ? ($userIds[$definition['manager']] ?? null) : null,
                    'status' => 'active',
                ],
            );

            $departmentIds[$definition['slug']] = $department->id;
        }
    }
}
