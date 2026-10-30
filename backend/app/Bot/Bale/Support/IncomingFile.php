<?php

namespace App\Bot\Bale\Support;

use App\Bot\Bale\Client\BaleApiException;
use App\Bot\Bale\Client\BaleClient;
use App\Bot\Bale\Settings;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * دریافت پرونده‌ای که کاربر در خودِ بات فرستاده است.
 *
 * هر نوع پرونده‌ای پذیرفته می‌شود: سند (pdf، word، zip و…)، عکس (حتی وقتی بله
 * آن را به‌صورت «photo» می‌فرستد، نه document)، ویدیو، صدا و ویس. پرونده ابتدا
 * با `getFile` از APIِ بله خوانده و سپس از همان نشانیِ رسمیِ فایل دریافت می‌شود؛
 * محتوا در پوشهٔ موقتیِ «local» نگه داشته می‌شود تا کاربر بتواند عنوان را تأیید
 * کند و در پایان همان پرونده به سرویسِ مخزن (`DamService`) سپرده می‌شود. هیچ
 * مسیرِ دومی برای ذخیره‌سازی ساخته نمی‌شود و نام پرونده، مسیر و اندازه پیش از
 * مصرف پاک‌سازی و دوباره سنجیده می‌شود.
 */
final class IncomingFile
{
    /** سقف حجم پروندهٔ دریافتی از بات (بایت). */
    public const MAX_BYTES = 20 * 1024 * 1024;

    private const DIRECTORY = 'bale-uploads';

    /** عمرِ پرونده‌های موقتیِ رهاشده (ثانیه). */
    private const TTL = 1800;

    /** کلیدهای پیامِ بله که می‌توانند پرونده داشته باشند، با پسوندِ پیش‌فرض. */
    private const KINDS = [
        'document' => null,
        'video' => 'mp4',
        'animation' => 'gif',
        'video_note' => 'mp4',
        'audio' => 'mp3',
        'voice' => 'ogg',
    ];

    /** پسوندِ جایگزین بر پایهٔ نوعِ MIME وقتی نامِ پرونده خالی است. */
    private const MIME_EXTENSIONS = [
        'image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/gif' => 'gif', 'image/heic' => 'heic',
        'application/pdf' => 'pdf', 'application/zip' => 'zip',
        'application/msword' => 'doc', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => 'docx',
        'application/vnd.ms-excel' => 'xls', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' => 'xlsx',
        'application/vnd.ms-powerpoint' => 'ppt', 'application/vnd.openxmlformats-officedocument.presentationml.presentation' => 'pptx',
        'text/plain' => 'txt', 'video/mp4' => 'mp4', 'audio/mpeg' => 'mp3', 'audio/ogg' => 'ogg',
    ];

    /** دلیلِ آخرین دریافتِ ناموفق؛ برای پیامِ روشن به کاربر و گزارشِ مدیر. */
    private ?string $failure = null;

    /** کدِ فنیِ آخرین شکست (مثل `forbidden`)؛ برای پیگیریِ مدیر. */
    private ?string $code = null;

    public function __construct(private Settings $settings, private BaleClient $client) {}

    /** دلیلِ فنیِ آخرین شکست (پس از `store() === null`). */
    public function failure(): ?string
    {
        return $this->failure;
    }

    /**
     * همان دلیل، به زبانِ فارسی، همراه با کدِ فنی.
     *
     * پیش‌تر پیامِ پیش‌فرض («دریافت این پرونده از بله ناموفق بود») هیچ کدی
     * نداشت و نه کاربر می‌دانست چه شد و نه مدیر می‌توانست علت را پیدا کند.
     */
    public function failureText(?string $reason = null): string
    {
        $reason ??= $this->failure ?? 'unknown';
        $code = $this->code ?? $reason;

        return match ($reason) {
            'too_large' => $this->tooLargeText(),
            'unauthorized' => 'کلید ربات در بله معتبر نیست (کد: unauthorized)؛ اتصال بات را از تنظیمات بازبینی کنید یا پرونده را از فرم بارگذاریِ مینی‌اپ بفرستید.',
            'forbidden' => 'بله اجازهٔ دریافت این پرونده را نداد (کد: forbidden)؛ چند بار پشت سر هم یا با حجمِ زیاد، محدود می‌شود. چند دقیقه بعد دوباره بفرستید یا از فرم بارگذاریِ مینی‌اپ استفاده کنید.',
            'rate_limited' => 'بله فعلاً دریافت این پرونده را محدود کرده است (کد: rate_limited)؛ چند دقیقه بعد دوباره بفرستید.',
            'not_found' => 'بله این پرونده را پیدا نکرد (کد: not_found)؛ پروندهٔ قدیمی یا نامعتبر است. همان پرونده را دوباره در گفتگو بفرستید (بازفرستادن = پروندهٔ تازه).',
            'bad_request' => 'بله درخواستِ این پرونده را نپذیرفت (کد: bad_request)؛ پرونده را دوباره بفرستید یا از فرم بارگذاریِ مینی‌اپ استفاده کنید.',
            'unsafe_redirect' => 'نشانیِ دریافت پرونده از سوی بله به میزبانِ ناشناخته می‌رفت و برای امنیت متوقف شد (کد: unsafe_redirect)؛ از فرم بارگذاریِ مینی‌اپ استفاده کنید.',
            'transport_unknown' => 'ارتباط با بله برقرار نشد (کد: transport_unknown؛ شبکه یا محدودیتِ پورت)؛ چند لحظه بعد دوباره بفرستید.',
            'empty_file' => 'پروندهٔ خالی یا ناقص دریافت شد (کد: empty_file)؛ دوباره بفرستید.',
            'store_failed' => 'ذخیرهٔ موقتِ پرونده روی سرور ناموفق بود (کد: store_failed)؛ با مدیر تماس بگیرید.',
            'download_failed' => 'دریافت محتوای پرونده از بله ناموفق بود (کد: download_failed)؛ دوباره بفرستید.',
            default => 'دریافت این پرونده از بله ناموفق بود (کد: '.MessageText::plain($code, 40).')؛ دوباره بفرستید یا از فرم بارگذاریِ مینی‌اپ استفاده کنید.',
        };
    }

    /**
     * توصیفِ پروندهٔ پیام: شناسه، نام و اندازه (اگر API فرستاده باشد).
     *
     * عکس در بله به‌صورت چند اندازهٔ هم‌نام فرستاده می‌شود؛ بزرگ‌ترین اندازه
     * انتخاب می‌شود تا کیفیت کامل به مخزن برود.
     *
     * @param  array<string, mixed>  $message
     * @return array{file_id: string, name: string, size: int, mime: string}|null
     */
    public function describe(array $message): ?array
    {
        foreach (self::KINDS as $kind => $extension) {
            $candidate = $message[$kind] ?? null;
            if (! is_array($candidate) || ! is_string($candidate['file_id'] ?? null) || $candidate['file_id'] === '') {
                continue;
            }
            $mime = is_string($candidate['mime_type'] ?? null) ? (string) $candidate['mime_type'] : '';
            $fallback = 'پرونده'.($extension ? '.'.$extension : '.'.$this->extensionFromMime($mime));

            return ['file_id' => (string) $candidate['file_id'],
                'name' => $this->name($candidate['file_name'] ?? null, $fallback),
                'size' => (int) ($candidate['file_size'] ?? 0), 'mime' => $mime];
        }

        $photo = is_array($message['photo'] ?? null) ? $message['photo'] : [];
        // بعضی نصب‌ها یک عکس را به‌جای فهرست، به‌صورت یک شیء می‌فرستند.
        if ($photo !== [] && ! array_is_list($photo) && is_string($photo['file_id'] ?? null)) {
            $photo = [$photo];
        }
        $largest = null;
        foreach ($photo as $candidate) {
            if (is_array($candidate) && is_string($candidate['file_id'] ?? null) && $candidate['file_id'] !== ''
                && ($largest === null || (int) ($candidate['file_size'] ?? 0) >= (int) ($largest['file_size'] ?? 0))) {
                $largest = $candidate;
            }
        }

        return $largest
            ? ['file_id' => (string) $largest['file_id'], 'name' => $this->name(null, 'تصویر.jpg'),
                'size' => (int) ($largest['file_size'] ?? 0), 'mime' => 'image/jpeg']
            : null;
    }

    /** پیامِ روشن برای پروندهٔ بزرگ‌تر از سقفِ پذیرفته‌شده. */
    public function tooLargeText(): string
    {
        return 'حجم این پرونده بیشتر از '.MessageText::plain((string) intdiv(self::MAX_BYTES, 1024 * 1024), 3)
            .' مگابایت است (کد: too_large)؛ آن را از پنل تدبیر بارگذاری کنید.';
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
        $this->code = null;
        if ($file['size'] > self::MAX_BYTES) {
            return $this->fail('too_large');
        }
        try {
            $token = (string) $this->settings->token();
            $meta = $this->client->call($token, 'getFile', ['file_id' => $file['file_id']]);
            $path = is_array($meta) ? ($meta['file_path'] ?? null) : null;
            if (! is_string($path) || trim($path) === '') {
                return $this->fail('not_found', 'getFile_without_path');
            }
            $contents = $this->download($token, trim($path));
            if (! is_string($contents) || $contents === '') {
                return $this->fail('empty_file');
            }
            if (strlen($contents) > self::MAX_BYTES) {
                return $this->fail('too_large');
            }
            $stored = self::DIRECTORY.'/'.Str::uuid().'.'.($this->extension($file['name']) ?: $this->extensionFromMime((string) ($file['mime'] ?? '')));
            if (! Storage::disk('local')->put($stored, $contents)) {
                return $this->fail('store_failed');
            }

            return ['path' => Storage::disk('local')->path($stored), 'stored' => $stored,
                'name' => $file['name'], 'size' => strlen($contents)];
        } catch (BaleApiException $error) {
            // دلیلِ واقعیِ شکست به پیام کاربر می‌رسد؛ توکن و نشانی هیچ‌گاه افشا نمی‌شود.
            $reason = match ($error->reason) {
                'unauthorized', 'forbidden', 'rate_limited', 'not_found', 'bad_request',
                'unsafe_redirect', 'transport_unknown' => $error->reason,
                default => 'download_failed',
            };

            return $this->fail($reason, $error->reason);
        } finally {
            $this->cleanup();
        }
    }

    /**
     * دریافتِ محتوا با چند مسیرِ سازگار.
     *
     * بله بسته به نصب، `file_path` را نسبی (`bale-uploads/...`) یا کامل
     * (`https://…bale.ai/...`) برمی‌گرداند. پیش‌تر فقط یک حالت پذیرفته می‌شد و
     * بقیه با «دریافت ناموفق» تمام می‌شد.
     *
     * @throws BaleApiException
     */
    private function download(string $token, string $path): ?string
    {
        // پارامترهای اضافیِ نشانی (مثل `?download=1`) بخشی از مسیرِ فایل نیستند.
        $clean = preg_split('/[?#]/', $path)[0] ?? $path;
        $clean = rawurldecode($clean);
        if (preg_match('~^https://~i', $clean)) {
            return $this->client->downloadUrl($clean);
        }
        if (! $this->pathIsSafe($clean)) {
            throw new BaleApiException('not_found');
        }
        try {
            // فاصله در نامِ پرونده باید به شکلِ درصدی به نشانی برود.
            return $this->client->download($token, str_replace(' ', '%20', $clean));
        } catch (BaleApiException $error) {
            // اگر مسیرِ نسبی جواب نداد، همان مسیر با نشانیِ کاملِ بله یک بار دیگر
            // امتحان می‌شود؛ بعضی نصب‌ها فقط همین شکل را می‌دهند.
            if (in_array($error->reason, ['not_found', 'bad_request'], true)) {
                return $this->client->downloadUrl('https://tapi.bale.ai/file/bot'.$token.'/'.ltrim($clean, '/'));
            }

            throw $error;
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

    /** ثبتِ شکست: کدِ فنی نگه داشته و دلیلِ پاک‌شده در گزارش ثبت می‌شود. */
    private function fail(string $reason, ?string $code = null): null
    {
        $this->failure = $reason;
        $this->code = $code ?? $reason;
        Log::warning('bale_file_receive_failed', ['reason' => $reason, 'code' => $this->code]);

        return null;
    }

    /**
     * مسیرِ فایلِ بله، بی‌خطر برای ساختنِ نشانی.
     *
     * نامِ پروندهٔ کاربر می‌تواند فاصله یا نویسهٔ فارسی داشته باشد (`%20` پس از
     * رمزگشایی)؛ پیش‌تر این مسیرها «نامعتبر» شمرده می‌شدند و دریافت با شکست
     * تمام می‌شد. فقط نویسه‌های کنترلی، بک‌اسلش و `..` ممنوع است.
     */
    private function pathIsSafe(string $path): bool
    {
        return $path !== ''
            && mb_strlen($path) <= 200
            && preg_match('/[\x00-\x1F\x7F]/', $path) !== 1
            && ! str_contains($path, '..')
            && ! str_contains($path, chr(92))
            && preg_match('~^[A-Za-z0-9\p{L}]~u', $path) === 1;
    }

    private function extension(string $name): string
    {
        $extension = strtolower(pathinfo($name, PATHINFO_EXTENSION));

        return preg_match('~^[a-z0-9]{1,8}$~D', $extension) ? $extension : '';
    }

    private function extensionFromMime(string $mime): string
    {
        $mime = strtolower(trim(explode(';', $mime)[0]));

        return self::MIME_EXTENSIONS[$mime] ?? (str_starts_with($mime, 'image/') ? 'jpg' : (str_starts_with($mime, 'video/') ? 'mp4' : (str_starts_with($mime, 'audio/') ? 'mp3' : 'bin')));
    }

    private function name(mixed $raw, string $fallback): string
    {
        $name = is_string($raw) ? trim($raw) : '';
        $name = preg_replace('~[\\\\/\\x00]+~', '_', $name) ?? '';
        $name = preg_replace('~[^\\pL\\pN._ -]+~u', '_', $name) ?? '';
        $name = trim($name, " \\t\\n\\r\\0\\x0B._");

        return $name !== '' ? mb_substr($name, 0, 120) : $fallback;
    }
}
