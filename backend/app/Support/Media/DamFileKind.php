<?php

namespace App\Support\Media;

use Illuminate\Database\Eloquent\Builder;

/**
 * دسته‌های «نوع فایل» مخزن دارایی‌ها.
 *
 * چرا جدا از فیلتر نوع دارایی (`file`/`content`): آن فیلتر می‌گوید دارایی
 * «فایل» است یا «محتوای متنی»، ولی کاربر دنبال چیز دیگری است: «فقط عکس‌ها» یا
 * «فقط PDF‌ها». این دسته‌بندی باید روی خود پایگاه داده اعمال شود، وگرنه فقط
 * همان صفحهٔ جاری فیلتر می‌شود و نتیجه گمراه‌کننده است.
 *
 * تطبیق دو لایه است: MIME (منبع اصلی و قابل‌اعتماد) و پسوند فایل (برای
 * فایل‌هایی که MIME دقیق یا عمومی دارند، مثل `application/octet-stream`).
 * `other` یعنی «هیچ‌کدام از دسته‌های شناخته‌شده» تا هیچ فایلی از فهرست بیرون
 * نیفتد.
 */
final class DamFileKind
{
    /** شناسه‌های مجاز فیلتر؛ همین فهرست در اعتبارسنجی درخواست استفاده می‌شود. */
    public const KINDS = ['image', 'video', 'audio', 'pdf', 'word', 'excel', 'powerpoint', 'text', 'archive', 'other'];

    /** پیشوند/مقدار MIME هر دسته. */
    private const MIME = [
        'image' => ['image/'],
        'video' => ['video/'],
        'audio' => ['audio/'],
        'pdf' => ['application/pdf'],
        'word' => ['application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml'],
        'excel' => ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml'],
        'powerpoint' => ['application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml'],
        'text' => ['text/'],
        'archive' => [
            'application/zip', 'application/x-zip-compressed', 'application/x-rar', 'application/vnd.rar',
            'application/x-7z-compressed', 'application/gzip', 'application/x-tar',
        ],
    ];

    /** پسوندهای هر دسته (کوچک و بدون نقطه). */
    private const EXTENSIONS = [
        'image' => ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'tiff', 'svg'],
        'video' => ['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v', 'mpeg', 'mpg'],
        'audio' => ['mp3', 'wav', 'm4a', 'ogg', 'oga', 'aac', 'flac', 'opus'],
        'pdf' => ['pdf'],
        'word' => ['doc', 'docx', 'rtf', 'odt'],
        'excel' => ['xls', 'xlsx', 'ods', 'csv'],
        'powerpoint' => ['ppt', 'pptx', 'odp'],
        'text' => ['txt', 'md', 'json', 'xml', 'html', 'htm', 'log'],
        'archive' => ['zip', 'rar', '7z', 'tar', 'gz', 'tgz'],
    ];

    /**
     * برچسب فارسی هر دسته؛ همان چیزی که در فهرست کشویی فیلتر دیده می‌شود.
     *
     * @return array<int, array{id: string, label: string}>
     */
    public static function options(): array
    {
        return [
            ['id' => 'image', 'label' => 'تصویر'],
            ['id' => 'video', 'label' => 'ویدیو'],
            ['id' => 'audio', 'label' => 'صدا'],
            ['id' => 'pdf', 'label' => 'PDF'],
            ['id' => 'word', 'label' => 'Word'],
            ['id' => 'excel', 'label' => 'Excel'],
            ['id' => 'powerpoint', 'label' => 'PowerPoint'],
            ['id' => 'text', 'label' => 'متن'],
            ['id' => 'archive', 'label' => 'فایل فشرده'],
            ['id' => 'other', 'label' => 'سایر'],
        ];
    }

    /**
     * فیلتر را روی کوئری دارایی‌ها اعمال می‌کند.
     *
     * شرط همهٔ دسته‌ها روی `latestFile` (نسخهٔ جاری فایل) است؛ دارایی متنی که
     * فایل ندارد در هیچ دستهٔ فایلی نمی‌آید، مگر فیلتر «همه».
     */
    public static function apply(Builder $query, string $kind): void
    {
        if (! in_array($kind, self::KINDS, true)) {
            return;
        }

        if ($kind === 'other') {
            // «سایر» = هیچ‌کدام از دسته‌های شناخته‌شده نباشد؛ به‌جای نقیضِ یک
            // گروه، زنجیرهٔ سادهٔ «نه این، نه آن» نوشته می‌شود که در همهٔ
            // موتورهای پایگاه داده یکسان رفتار می‌کند.
            $query->whereHas('latestFile', function (Builder $file): void {
                foreach (self::MIME as $prefixes) {
                    foreach ($prefixes as $prefix) {
                        $file->where('mime_type', 'not like', $prefix.'%');
                    }
                }
                foreach (self::EXTENSIONS as $extensions) {
                    foreach ($extensions as $extension) {
                        $file->whereRaw('LOWER(extension) <> ?', [$extension]);
                        $file->whereRaw("LOWER(COALESCE(original_filename, '')) NOT LIKE ?", ['%.'.$extension]);
                    }
                }
            });

            return;
        }

        $query->whereHas('latestFile', fn (Builder $file) => self::applyKnown($file, $kind));
    }

    /** شرط یک دسته روی کوئری فایل‌ها. */
    private static function applyKnown(Builder $query, string $kind): Builder
    {
        return $query->where(function (Builder $inner) use ($kind): void {
            foreach (self::MIME[$kind] ?? [] as $prefix) {
                $inner->orWhere('mime_type', 'like', $prefix.'%');
            }
            foreach (self::EXTENSIONS[$kind] ?? [] as $extension) {
                $inner->orWhereRaw('LOWER(extension) = ?', [$extension]);
                // نام اصلی هم بررسی می‌شود: بعضی فایل‌های قدیمی فقط نام دارند.
                $inner->orWhere('original_filename', 'like', '%.'.$extension);
            }
        });
    }
}
