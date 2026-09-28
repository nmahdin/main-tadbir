<?php

namespace App\Bot\Bale\Support;

use Closure;
use Illuminate\Support\Facades\Cache;

final class RuntimeLock
{
    public function run(Closure $callback): mixed
    {
        $lock = Cache::lock('bale:runtime', 90);
        abort_unless($lock->get(), 409, 'یک عملیات بله در حال اجراست؛ کمی بعد دوباره تلاش کنید.');
        try {
            return $callback();
        } finally {
            $lock->release();
        }
    }
}
