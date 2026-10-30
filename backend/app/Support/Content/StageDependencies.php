<?php

namespace App\Support\Content;

/**
 * قانون مشترک «پیش‌نیاز مرحله».
 *
 * یک مرحله تا وقتی پیش‌نیازش تمام نشده فعال نمی‌شود؛ این کلاس تنها جای تشخیص
 * آن پیش‌نیاز است تا ساخت تسک مرحله (`ContentStageTaskSync`) و پیش‌بردن مرحله از
 * روی تسک (`TaskOperations`) یک تصمیم بگیرند. هیچ ستون یا مقدار تازه‌ای ذخیره
 * نمی‌شود: ورودی، همان آینهٔ `stages` داخل payload محتوا است.
 *
 * سه منبع واقعی وابستگی بررسی می‌شود و هیچ‌کدام ساختهٔ مرورگر نیست:
 * `dependsOnStageIds` (اعلام صریح قالب جریان)، ورودی‌هایی که از خروجی مرحلهٔ
 * دیگری ارجاع شده‌اند (`sourceStageId`)، و زنجیرهٔ ترتیبی (`dependsOnPrevious`
 * یا وضعیت `pending_dependency`).
 */
final class StageDependencies
{
    /** مرحله‌هایی که تمام‌شده به‌حساب می‌آیند و پیش‌نیاز مرحله‌های بعدی را باز می‌کنند. */
    public const FINISHED_STATUSES = ['approved', 'completed', 'skipped'];

    public static function isFinished(mixed $stage): bool
    {
        return is_array($stage) && in_array($stage['status'] ?? '', self::FINISHED_STATUSES, true);
    }

    /**
     * پیش‌نیاز برآورده‌نشدهٔ یک مرحله را به متن خوانا برمی‌گرداند؛ `null` یعنی
     * مرحله آزاد است و می‌تواند تسک بگیرد یا پیش برود.
     *
     * @param  array<int|string, mixed>  $stages
     */
    public static function blockingReason(array $stages, string $stageId): ?string
    {
        // کلیدهای ورودی همیشه فهرست پیوسته نیستند؛ ترتیب واقعی جریان در `$ordered`
        // حفظ می‌شود تا «مرحلهٔ قبلی» معنای خودش را داشته باشد.
        $ordered = array_values(array_filter($stages, 'is_array'));
        $positions = [];
        foreach ($ordered as $position => $candidate) {
            if (isset($candidate['id'])) {
                $positions[(string) $candidate['id']] = $position;
            }
        }
        $position = $positions[$stageId] ?? null;
        if ($position === null) {
            return null;
        }
        if ($position === 0) {
            // نخستین مرحلهٔ جریان پیش‌نیازی ندارد؛ حتی اگر دادهٔ قدیمی وضعیت
            // «در انتظار پیش‌نیاز» را روی آن گذاشته باشد، جریان قفل نمی‌شود.
            return null;
        }

        $stage = $ordered[$position];
        $status = (string) ($stage['status'] ?? 'not_started');
        $required = [];

        foreach ((array) ($stage['dependsOnStageIds'] ?? []) as $dependencyId) {
            if (is_scalar($dependencyId) && isset($positions[(string) $dependencyId])) {
                $required[$positions[(string) $dependencyId]] = true;
            }
        }
        foreach ((array) ($stage['inputs'] ?? []) as $input) {
            if (is_array($input) && is_scalar($input['sourceStageId'] ?? null) && isset($positions[(string) $input['sourceStageId']])) {
                $required[$positions[(string) $input['sourceStageId']]] = true;
            }
        }
        if (($stage['dependsOnPrevious'] ?? false) === true || $status === 'pending_dependency') {
            $required[$position - 1] = true;
        }
        unset($required[$position]);

        $waiting = [];
        foreach (array_keys($required) as $requiredPosition) {
            if (self::isFinished($ordered[$requiredPosition] ?? null)) {
                continue;
            }
            $waiting[] = '«'.(string) ($ordered[$requiredPosition]['title'] ?? 'مرحلهٔ پیشین').'»';
        }
        if ($waiting !== []) {
            return 'در انتظار اتمام مرحله '.implode(' و ', array_slice($waiting, 0, 3));
        }

        return $status === 'pending_dependency' ? 'این مرحله هنوز فعال نشده است.' : null;
    }
}
