<?php

namespace Database\Seeders;

use App\Models\SystemSetting;
use Illuminate\Database\Seeder;

/** Default publication channels for a fresh installation; never overwrite operator customizations. */
class PublishingPlatformSeeder extends Seeder
{
    public const PLATFORMS = [
        [
            'id' => 'website',
            'name' => 'وب‌سایت رسمی',
            'iconName' => 'Globe',
            'color' => '#2563eb',
            'bg' => '#eff6ff',
            'isEnabled' => true,
            'urlPattern' => '',
            'description' => 'وب‌سایت و پرتال رسمی سازمان',
        ],
        [
            'id' => 'instagram',
            'name' => 'اینستاگرام',
            'iconName' => 'Instagram',
            'color' => '#db2777',
            'bg' => '#fdf2f8',
            'isEnabled' => true,
            'urlPattern' => 'https://instagram.com/',
            'description' => 'پست، استوری، ریلز و محتوای تصویری',
        ],
        [
            'id' => 'telegram',
            'name' => 'تلگرام',
            'iconName' => 'Send',
            'color' => '#0284c7',
            'bg' => '#f0f9ff',
            'isEnabled' => true,
            'urlPattern' => 'https://t.me/',
            'description' => 'کانال اطلاع‌رسانی و انتشار سریع محتوا',
        ],
        [
            'id' => 'bale',
            'name' => 'پیام‌رسان بله',
            'iconName' => 'MessageCircle',
            'color' => '#059669',
            'bg' => '#ecfdf5',
            'isEnabled' => true,
            'urlPattern' => 'https://ble.ir/',
            'description' => 'کانال رسمی در پیام‌رسان بله',
        ],
        [
            'id' => 'eitaa',
            'name' => 'پیام‌رسان ایتا',
            'iconName' => 'MessageSquare',
            'color' => '#ea580c',
            'bg' => '#fff7ed',
            'isEnabled' => true,
            'urlPattern' => 'https://eitaa.com/',
            'description' => 'کانال خبری و رسانه‌ای در ایتا',
        ],
        [
            'id' => 'rubika',
            'name' => 'روبیکا',
            'iconName' => 'PlayCircle',
            'color' => '#7c3aed',
            'bg' => '#f5f3ff',
            'isEnabled' => true,
            'urlPattern' => 'https://rubika.ir/',
            'description' => 'انتشار محتوای چندرسانه‌ای در روبیکا',
        ],
        [
            'id' => 'aparat',
            'name' => 'آپارات',
            'iconName' => 'Clapperboard',
            'color' => '#e11d48',
            'bg' => '#fff1f2',
            'isEnabled' => true,
            'urlPattern' => 'https://www.aparat.com/',
            'description' => 'میزبانی و انتشار ویدئوهای فارسی',
        ],
        [
            'id' => 'youtube',
            'name' => 'یوتیوب',
            'iconName' => 'Youtube',
            'color' => '#dc2626',
            'bg' => '#fef2f2',
            'isEnabled' => true,
            'urlPattern' => 'https://www.youtube.com/',
            'description' => 'انتشار و آرشیو محتوای ویدئویی',
        ],
        [
            'id' => 'linkedin',
            'name' => 'لینکدین',
            'iconName' => 'Linkedin',
            'color' => '#0369a1',
            'bg' => '#f0f9ff',
            'isEnabled' => true,
            'urlPattern' => 'https://www.linkedin.com/company/',
            'description' => 'ارتباطات حرفه‌ای و گزارش‌های سازمانی',
        ],
        [
            'id' => 'x',
            'name' => 'ایکس (توییتر)',
            'iconName' => 'Twitter',
            'color' => '#0f172a',
            'bg' => '#f8fafc',
            'isEnabled' => true,
            'urlPattern' => 'https://x.com/',
            'description' => 'خبر کوتاه و ارتباط سریع با مخاطبان',
        ],
    ];

    public function run(): void
    {
        SystemSetting::firstOrCreate(
            ['key' => 'publishing_platforms'],
            ['value' => self::PLATFORMS],
        );
    }
}
