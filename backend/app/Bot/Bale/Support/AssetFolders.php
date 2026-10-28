<?php

namespace App\Bot\Bale\Support;

use App\Models\DamFolder;

/**
 * انتخاب پوشهٔ مقصد برای دارایی‌ای که از بات بله ثبت می‌شود.
 *
 * همان درختِ پوشه‌های مخزن مرکزی نمایش داده می‌شود؛ هیچ پوشه‌ای ساخته یا
 * حدس زده نمی‌شود. مقدارِ انتخاب‌شده در نشستِ همان پیش‌نویس (`folder_id`)
 * نگه داشته می‌شود و هنگام تأیید به `DamService::create` می‌رسد. انتخابِ
 * خالی یعنی «پوشهٔ پیش‌فرض سامانه» تا رفتارِ قبلی (پوشهٔ تسک یا ریشه) حفظ شود.
 */
final class AssetFolders
{
    /** حداکثر پوشهٔ هم‌سطح در هر صفحهٔ دکمه‌ها. */
    public const PER_PAGE = 4;

    /** callback فهرستِ فرزندان یک پوشه: `assetdir:{nonce}:{folderId}:{page}`. */
    public static function browse(string $nonce, int $folderId, int $page = 0): string
    {
        return 'assetdir:'.$nonce.':'.max(0, $folderId).':'.max(0, $page);
    }

    /** callback انتخاب یک پوشه: `assetuse:{nonce}:{folderId}`. */
    public static function use(string $nonce, int $folderId): string
    {
        return 'assetuse:'.$nonce.':'.max(0, $folderId);
    }

    /** مسیر خوانا از ریشه تا همین پوشه؛ بدون پوشه یعنی «ریشه مخزن». */
    public function label(?int $folderId): string
    {
        $names = [];
        $cursor = $folderId ? DamFolder::query()->find($folderId) : null;
        $guard = 0;
        while ($cursor && $guard++ < 30) {
            array_unshift($names, $cursor->name);
            $cursor = $cursor->parent_id ? DamFolder::query()->find($cursor->parent_id) : null;
        }

        return $names === [] ? 'ریشه مخزن' : implode(' / ', $names);
    }

    /**
     * دکمه‌های فهرستِ یک پوشه: فرزندان، انتخاب همان پوشه، بازگشت به بالاتر و ریشه.
     *
     * @return array<int, array<int, array{text: string, callback_data: string}>>
     */
    public function rows(string $nonce, int $folderId, int $page = 0): array
    {
        $folder = $folderId > 0 ? DamFolder::query()->find($folderId) : null;
        $parentId = $folder?->id ?? 0;
        $page = max(0, $page);
        $children = DamFolder::query()->where('parent_id', $folder?->id)
            ->orderBy('name')->offset($page * self::PER_PAGE)->limit(self::PER_PAGE + 1)->get();
        $rows = [];
        foreach ($children->take(self::PER_PAGE) as $child) {
            $rows[] = [['text' => '📁 '.mb_substr($child->name, 0, 50), 'callback_data' => self::browse($nonce, (int) $child->id)]];
        }
        if ($page > 0) {
            $rows[] = [['text' => 'صفحهٔ قبل', 'callback_data' => self::browse($nonce, $parentId, $page - 1)]];
        }
        if ($children->count() > self::PER_PAGE) {
            $rows[] = [['text' => 'صفحهٔ بعد', 'callback_data' => self::browse($nonce, $parentId, $page + 1)]];
        }
        $rows[] = [['text' => '✅ همین پوشه را انتخاب کن', 'callback_data' => self::use($nonce, $parentId)]];
        if ($parentId > 0) {
            $up = $folder?->parent_id ? (int) $folder->parent_id : 0;
            $rows[] = [['text' => '⬆️ پوشهٔ بالاتر', 'callback_data' => self::browse($nonce, $up)]];
            $rows[] = [['text' => '🏠 ریشهٔ مخزن', 'callback_data' => self::browse($nonce, 0)]];
        }

        return $rows;
    }

    public function text(string $nonce, int $folderId, int $page = 0): string
    {
        $folder = $folderId > 0 ? DamFolder::query()->find($folderId) : null;
        $children = DamFolder::query()->where('parent_id', $folder?->id)->count();

        return "📁 *پوشهٔ مقصد را انتخاب کنید*\n\n"
            .'پوشهٔ جاری: '.MessageText::plain($this->label($folder?->id), 300)."\n\n"
            .($children === 0
                ? 'این پوشه زیرپوشه ندارد؛ می‌توانید همین پوشه یا پوشهٔ بالاتر را انتخاب کنید.'
                : 'یکی از زیرپوشه‌ها را بزنید یا همین پوشه را انتخاب کنید.')
            ."\nاین انتخاب فقط برای همین ثبت است و پوشهٔ تازه‌ای ساخته نمی‌شود.";
    }
}
