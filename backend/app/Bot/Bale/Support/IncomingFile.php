<?php

namespace App\Bot\Bale\Support;

use App\Bot\Bale\Client\BaleApiException;
use App\Bot\Bale\Client\BaleClient;
use App\Bot\Bale\Settings;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * دریافت پرونده‌ای که کاربر در خودِ بات فرستاده است.
 *
 * پرونده ابتدا با `getFile` از APIِ بله خوانده و سپس از همان نشانیِ رسمیِ فایل
 * دریافت می‌شود؛ محتوا در پوشهٔ موقتیِ «local» نگه داشته می‌شود تا کاربر بتواند
 * عنوان را تأیید کند و در پایان همان پرونده به سرویسِ مخزن (`DamService`)
 * سپرده می‌شود. هیچ مسیرِ دومی برای ذخیره‌سازی ساخته نمی‌شود و نام پرونده،
 * مسیر و اندازه پیش از مصرف پاک‌سازی و دوباره سنجیده می‌شود.
 */
final class IncomingFile
{
    /** سقف حجم پروندهٔ دریافتی از بات (بایت). */
    public const MAX_BYTES = 20 * 1024 * 1024;

    private const DIRECTORY = 'bale-uploads';

    /** عمرِ پرونده‌های موقتیِ رهاشده (ثانیه). */
    private const TTL = 1800;

    public function __construct(private Settings $settings, private BaleClient $client) {}

    /**
     * توصیفِ پروندهٔ پیام: شناسه، نام و اندازه (اگر API فرستاده باشد).
     *
     * @param  array<string, mixed>  $message
     * @return array{file_id: string, name: string, size: int}|null
     */
    public function describe(array $message): ?array
    {
        $document = is_array($message['document'] ?? null) ? $message['document'] : null;
        if ($document && is_string($document['file_id'] ?? null) && $document['file_id'] !== '') {
            return ['file_id' => (string) $document['file_id'], 'name' => $this->name($document['file_name'] ?? null, 'پرونده.bin'),
                'size' => (int) ($document['file_size'] ?? 0)];
        }
        $photo = is_array($message['photo'] ?? null) ? $message['photo'] : [];
        $largest = null;
        foreach ($photo as $candidate) {
            if (is_array($candidate) && is_string($candidate['file_id'] ?? null)
                && ($largest === null || (int) ($candidate['file_size'] ?? 0) >= (int) ($largest['file_size'] ?? 0))) {
                $largest = $candidate;
            }
        }

        return $largest
            ? ['file_id' => (string) $largest['file_id'], 'name' => $this->name(null, 'تصویر.jpg'), 'size' => (int) ($largest['file_size'] ?? 0)]
            : null;
    }

    /** پیامِ روشن برای پروندهٔ بزرگ‌تر از سقفِ پذیرفته‌شده. */
    public function tooLargeText(): string
    {
        return 'حجم این پرونده بیشتر از '.MessageText::plain((string) intdiv(self::MAX_BYTES, 1024 * 1024), 3)
            .' مگابایت است؛ آن را از پنل تدبیر بارگذاری کنید.';
    }

    /**
     * دریافتِ پرونده و نگه‌داریِ موقتِ آن تا زمانِ تأیید کاربر.
     *
     * @param  array{file_id: string, name: string, size: int}  $file
     * @return array{path: string, stored: string, name: string, size: int}|null
     */
    public function store(array $file): ?array
    {
        if ($file['size'] > self::MAX_BYTES) {
            return null;
        }
        try {
            $token = (string) $this->settings->token();
            $meta = $this->client->call($token, 'getFile', ['file_id' => $file['file_id']]);
            $path = is_array($meta) ? ($meta['file_path'] ?? null) : null;
            if (! is_string($path) || $path === '' || ! $this->pathIsSafe($path)) {
                return null;
            }
            $contents = $this->client->download($token, $path);
            if (! is_string($contents) || $contents === '' || strlen($contents) > self::MAX_BYTES) {
                return null;
            }
            $stored = self::DIRECTORY.'/'.Str::uuid().'.'.($this->extension($file['name']) ?: 'bin');
            if (! Storage::disk('local')->put($stored, $contents)) {
                return null;
            }

            return ['path' => Storage::disk('local')->path($stored), 'stored' => $stored,
                'name' => $file['name'], 'size' => strlen($contents)];
        } catch (BaleApiException) {
            return null;
        } finally {
            $this->cleanup();
        }
    }

    /**
     * پروندهٔ نگه‌داری‌شده را به `UploadedFile` تبدیل می‌کند؛ همان قراردادی که
     * سرویس مخزن برای هر بارگذاریِ پنل می‌سنجد.
     *
     * @param  array{path: string, stored: string, name: string, size: int}  $stored
     */
    public function upload(array $stored): ?UploadedFile
    {
        if (! is_file($stored['path'])) {
            return null;
        }

        // «test» یعنی این پرونده از یک درخواستِ HTTP واقعی نیامده است.
        return new UploadedFile($stored['path'], $stored['name'], null, null, true);
    }

    /** @param  array{stored?: string|null}|null  $stored */
    public function discard(mixed $stored): void
    {
        $relative = is_array($stored) ? ($stored['stored'] ?? null) : null;
        if (is_string($relative) && str_starts_with($relative, self::DIRECTORY.'/')) {
            Storage::disk('local')->delete($relative);
        }
    }

    /** پاک‌سازیِ محدودِ پرونده‌های رهاشده؛ هیچ cron جداگانه‌ای لازم نیست. */
    public function cleanup(): void
    {
        $disk = Storage::disk('local');
        foreach (array_slice($disk->files(self::DIRECTORY), 0, 50) as $file) {
            if ($disk->lastModified($file) < now()->subSeconds(self::TTL)->getTimestamp()) {
                $disk->delete($file);
            }
        }
    }

    private function pathIsSafe(string $path): bool
    {
        return (bool) preg_match('~^[A-Za-z0-9][A-Za-z0-9._/-]{0,200}$~D', $path) && ! str_contains($path, '..');
    }

    private function extension(string $name): string
    {
        $extension = strtolower(pathinfo($name, PATHINFO_EXTENSION));

        return preg_match('~^[a-z0-9]{1,8}$~D', $extension) ? $extension : '';
    }

    private function name(mixed $raw, string $fallback): string
    {
        $name = is_string($raw) ? trim($raw) : '';
        $name = preg_replace('~[\\\\/\\x00]+~', '_', $name) ?? '';
        $name = preg_replace('~[^\\pL\\pN._ -]+~u', '_', $name) ?? '';
        $name = trim($name, " \t\n\r\0\x0B._");

        return $name !== '' ? mb_substr($name, 0, 120) : $fallback;
    }
}
