<?php

use Illuminate\Support\Facades\Route;

// بک‌اند فقط API است؛ پنل HTML وضعیت عمداً غیرفعال شده است.
// پایش سرویس باید از endpoint سبک `/up` انجام شود.
Route::get('/', fn () => response()->noContent());
