<?php

namespace App\Bot\Bale\Support;

use App\Models\SystemSetting;

/**
 * برچسب‌های فارسی برای مقادیری که در پایگاه داده به‌صورت کلید ذخیره می‌شوند.
 *
 * شناسهٔ کانال‌های انتشار (`instagram`، `website`، …) و وضعیتِ پرونده
 * (`ready_to_publish`، `published`، …) در تنظیماتِ سازمان معنا می‌شوند؛ در پیام
 * بات باید نام فارسیِ همان تنظیمات دیده شود و هرگز کلیدِ انگلیسی نمایش داده
 * نشود. اگر تنظیماتِ سازمان مقداری نداشته باشد، برچسبِ پیش‌فرضِ همان کلید به
 * کار می‌رود و در نبودِ آن، همان مقدارِ ذخیره‌شده (بدون هیچ حدس و سانسور).
 */
final class ContentLabels
{
    /** برچسب‌های پیش‌فرضِ وضعیت پرونده؛ تنظیماتِ سازمان اولویت دارد. */
    private const STATUSES = [
        'idea' => 'ایده اولیه',
        'planning' => 'برنامه‌ریزی',
        'producing' => 'در حال تولید',
        'reviewing' => 'در انتظار بازبینی',
        'revising' => 'نیازمند اصلاح',
        'delayed' => 'در تأخیر',
        'approved' => 'تأییدشده',
        'ready_to_publish' => 'آماده انتشار',
        'published' => 'منتشرشده',
        'suspended' => 'تعلیق',
        'cancelled' => 'لغو شده',
        'archived' => 'آرشیو',
    ];

    /** نام فارسیِ وضعیتِ پرونده. */
    public function status(mixed $status): string
    {
        $key = is_string($status) ? trim($status) : '';
        if ($key === '') {
            return 'نامشخص';
        }
        foreach ($this->options('content_statuses', 'label') as $id => $label) {
            if ($id === $key) {
                return $label;
            }
        }

        return self::STATUSES[$key] ?? $key;
    }

    /** نام فارسیِ یک کانال انتشار. */
    public function channel(mixed $channel): string
    {
        $key = is_string($channel) ? trim($channel) : '';
        if ($key === '') {
            return '';
        }
        foreach ($this->options('publishing_platforms', 'name') as $id => $name) {
            if ($id === $key) {
                return $name;
            }
        }

        return $key;
    }

    /**
     * نام فارسیِ کانال‌ها، جدا شده با «،»؛ کانالِ ناشناس همان مقدارِ ذخیره‌شده
     * را نگه می‌دارد تا چیزی پنهان نشود.
     *
     * @param  array<int, mixed>  $channels
     */
    public function channels(array $channels): string
    {
        $labels = [];
        foreach ($channels as $channel) {
            if (! is_string($channel) || trim($channel) === '') {
                continue;
            }
            $labels[] = MessageText::plain($this->channel($channel), 40);
        }

        return implode('، ', array_values(array_unique($labels)));
    }

    /**
     * @param  'content_statuses'|'publishing_platforms'  $key
     * @return array<string, string>
     */
    private function options(string $key, string $labelField): array
    {
        $stored = SystemSetting::query()->where('key', $key)->value('value');
        $rows = is_array($stored) ? $stored : [];
        $options = [];
        foreach ($rows as $row) {
            if (! is_array($row)) {
                continue;
            }
            $id = is_string($row['id'] ?? null) ? trim($row['id']) : '';
            $label = is_string($row[$labelField] ?? null) ? trim($row[$labelField]) : '';
            if ($id !== '' && $label !== '') {
                $options[$id] = $label;
            }
        }

        return $options;
    }
}
