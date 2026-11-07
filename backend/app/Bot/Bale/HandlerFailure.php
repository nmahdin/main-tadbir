<?php

namespace App\Bot\Bale;

use RuntimeException;
use Throwable;

/**
 * بسته‌بندیِ خطای یک هندلر درونِ تراکنشِ پردازشِ به‌روزرسانی.
 *
 * خطای خودِ «لوله‌کشی» (ثبتِ صندوق ورودی یا ذخیرهٔ تنظیمات) باید بالا برود تا
 * فرستنده دوباره تلاش کند؛ اما خطای منطقِ هندلر فقط همان پیام را خراب می‌کند و
 * نباید صف را قفل کند. این کلاس همین دو حالت را از هم جدا می‌کند.
 */
final class HandlerFailure extends RuntimeException
{
    public function __construct(public readonly Throwable $cause)
    {
        // متنِ اصلی در پیامِ استثنا نگه داشته نمی‌شود تا در لاگِ خام نشت نکند.
        parent::__construct('bale handler failed');
    }
}
