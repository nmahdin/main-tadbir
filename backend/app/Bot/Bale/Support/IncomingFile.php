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

    /** دلیلِ آخرین دریافتِ ناموفق؛ برای پیامِ روشن به کاربر و گزارشِ مدیر. */
    private ?string $failure = null;

    public function __construct(private Settings $settings, private BaleClient $client) {}

    /** دلیلِ فنیِ آخرین شکست (پس از `store() === null`). */
    public function failure(): ?string
    {
        return $this->failure;
    }

    /** همان دلیل، به زبانِ فارسی و بدون افشای نشانی یا توکن. */
    public function failureText(?string $reason = null): string
    {
        return match ($reason ?? $this->failure) {
            'too_large' => $this->tooLargeText(),
            'unauthorized' => 'کلید ربات در بله معتبر نیست؛ اتصال بات را از تنظیمات بازبینی کنید. پرونده را از فرم بارگذاریِ مینی‌اپ یا پنل ثبت کنید.',
            'forbidden' => 'بله اجازهٔ دریافت این پرونده را نداد؛ آن را در گفتگوی دیگری یا از فرم بارگذاریِ مینی‌اپ بفرستید.',
            'rate_limited' => 'بله فعلاً درخواست‌ها را محدود کرده است؛ چند دقیقه بعد دوباره بفرستید.',
            'not_found', 'bad_request' => 'بله اطلاعات این پرونده را برنگرداند (پرونده قدیمی یا نامعتبر است)؛ آن را دوباره در گفتگو بفرستید.',
            'unsafe_redirect' => 'نشانیِ دریافت پرونده از سوی بله به میزبانِ ناشناخته می‌رفت و برای امنیت متوقف شد؛ از فرم بارگذاریِ مینی‌اپ استفاده کنید.',
            'transport_unknown' => 'ارتباط با بله برقرار نشد (شبکه یا محدودیت پورت)؛ چند لحظه بعد دوباره بفرستید.',
            'empty_file' => 'پروندهٔ خالی یا ناقص دریافت شد؛ دوباره بفرستید.',
            'store_failed' => 'ذخیرهٔ موقتِ پرونده روی سرور ناموفق بود؛ با مدیر تماس بگیرید.',
            'download_failed' => 'دریافت محتوای پرونده از بله ناموفق بود؛ دوباره بفرستید.',
            default => 'دریافت این پرونده از بله ناموفق بود؛ دوباره بفرستید یا از فرم بارگذاریِ مینی‌اپ استفاده کنید.',
        };
    }

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
        $this->failure = null;
        if ($file['size'] > self::MAX_BYTES) {
            $this->failure = 'too_large';

            return null;
        }
        try {
            $token = (string) $this->settings->token();
            $meta = $this->client->call($token, 'getFile', ['file_id' => $file['file_id']]);
            $path = is_array($meta) ? ($meta['file_path'] ?? null) : null;
            if (! is_string($path) || $path === '') {
                $this->failure = 'not_found';

                return null;
            }
            // برخی نصب‌های بله نشانیِ کامل می‌دهند؛ مسیرِ نسبی همان قرارداد رسمی است.
            if (preg_match('~^https://([a-z0-9.-]+\.)?bale\.ai/~i', $path)) {
                $contents = $this->client->downloadUrl($path);
            } elseif ($this->pathIsSafe($path)) {
                $contents = $this->client->download($token, $path);
            } else {
                $this->failure = 'not_found';

                return null;
            }
            if (! is_string($contents) || $contents === '') {
                $this->failure = 'empty_file';

                return null;
            }
            if (strlen($contents) > self::MAX_BYTES) {
                $this->failure = 'too_large';

                return null;
            }
            $stored = self::DIRECTORY.'/'.Str::uuid().'.'.($this->extension($file['name']) ?: 'bin');
            if (! Storage::disk('local')->put($stored, $contents)) {
                $this->failure = 'store_failed';

                return null;
            }

            return ['path' => Storage::disk('local')->path($stored), 'stored' => $stored,
                'name' => $file['name'], 'size' => strlen($contents)];
        } catch (BaleApiException $error) {
            // دلیلِ واقعیِ شکست به پیام کاربر می‌رسد؛ توکن و نشانی هیچ‌گاه افشا نمی‌شود.
            $this->failure = match ($error->reason) {
                'unauthorized', 'forbidden', 'rate_limited', 'not_found', 'bad_request',
                'unsafe_redirect', 'transport_unknown' => $error->reason,
                default => 'download_failed',
            };

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
