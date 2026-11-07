<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Support\Media\PublicMedia;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * تحویل رسانه‌های عمومی (عکس پروفایل، لوگو، فاوآیکون) از خودِ اپلیکیشن.
 *
 * این مسیر به لینک نمادین `public/storage` وابسته نیست و روی همان میزبانی
 * پاسخ می‌دهد که درخواست API به آن رسیده است؛ پس تصویرها روی هر دامنهٔ پنل
 * یا API درست لود می‌شوند. محتوا فقط از دو پوشهٔ مجاز خوانده می‌شود.
 */
final class PublicMediaController extends Controller
{
    public function show(string $path): StreamedResponse
    {
        $safe = PublicMedia::path($path);
        abort_if($safe === null, 404);
        $disk = Storage::disk('public');
        abort_unless($disk->exists($safe), 404);

        return $disk->response($safe, null, [
            // تصویر پروفایل و لوگو کم‌تغییرند؛ کش مرورگر از رفت‌وبرگشت جلوگیری می‌کند.
            'Cache-Control' => 'public, max-age=604800',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }
}
