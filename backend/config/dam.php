<?php

/*
|--------------------------------------------------------------------------
| سهمیهٔ نمایشی فضای DAM
|--------------------------------------------------------------------------
|
| این عدد فقط برای نمایش «میزان مصرف از سهمیه» در DAM است؛ در دیتابیس ذخیره
| نمی‌شود. ترتیب اولویت:
|   ۱) متغیر محیطی DAM_STORAGE_QUOTA_BYTES
|   ۲) مقدار فایل config/dam.quota.php (قابل ویرایش با File Manager روی هاست
|      بدون SSH) — نمونه:  <?php return ['storage_quota_bytes' => 21474836480];
|   ۳) پیش‌فرض ۱۰ گیگابایت
|
| مقدار نهایی در کلید DAM_QUOTA_BYTES ریخته می‌شود تا استفاده‌کنندهٔ config
| تغییری لازم نداشته باشد. هیچ closure‌ای اینجا نیست تا `config:cache` کار کند.
*/

$quota = env('DAM_STORAGE_QUOTA_BYTES');

if ($quota === null || $quota === '') {
    $file = __DIR__.'/dam.quota.php';
    if (is_file($file)) {
        $value = require $file;
        $quota = is_array($value) ? ($value['storage_quota_bytes'] ?? null) : $value;
    }
}

return [
    'storage_quota_bytes' => is_numeric($quota) ? max(0, (int) $quota) : 10 * 1024 * 1024 * 1024,
];
