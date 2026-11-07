<?php

namespace App\Services;

use App\Models\Content;
use App\Support\OrganizationTime;

/**
 * وضعیت مشتق محتوا (به‌ویژه «تأخیر») را با مهلت واقعی مراحل هم‌گام می‌کند.
 *
 * جریان کار همان لحظه‌ای که مراحل، مهلت‌ها یا مسئولان تغییر می‌کنند وضعیت را
 * بازمی‌سازد. این سرویس فقط برای پرونده‌هایی است که مهلت مرحله‌شان بدون هیچ
 * نوشتاری گذشته است. کاملاً مشتق و idempotent است: هیچ مهلتی را تغییر نمی‌دهد،
 * وضعیت‌های پایانی (منتشرشده، بایگانی، لغوشده، تعلیق) را بازنویسی نمی‌کند و
 * اجرای چندبارهٔ آن نتیجهٔ یکسان دارد.
 *
 * مهلت نزدیک‌ترین مرحلهٔ باز در `payload->nextStageDeadline` نگه داشته می‌شود؛
 * همین کلید پرس‌وجوی بازبینی را بدون خواندن همهٔ پرونده‌ها ممکن می‌کند.
 */
final class ContentDeadlineSweep
{
    /** وضعیت‌هایی که هرگز با پیمایش مهلت بازنویسی نمی‌شوند. */
    public const TERMINAL = ['published', 'archived', 'cancelled', 'suspended'];

    /** @return bool آیا وضعیت این پرونده تغییر کرد؟ */
    public function refresh(Content $content): bool
    {
        $before = $content->status;
        app(ContentStageTaskSync::class)->syncStateOnly($content);

        return $content->refresh()->status !== $before;
    }

    /**
     * پرونده‌هایی که نزدیک‌ترین مهلت مرحله‌شان گذشته است را تازه می‌کند.
     * تعداد محدود است تا بار درخواست‌های عادی قابل پیش‌بینی بماند.
     */
    public function refreshDue(int $limit = 25, ?string $today = null): int
    {
        $today ??= app(OrganizationTime::class)->date();
        $rows = Content::query()
            ->whereNotIn('status', self::TERMINAL)
            ->whereNotNull('payload->nextStageDeadline')
            ->where('payload->nextStageDeadline', '<', $today)
            ->orderBy('payload->nextStageDeadline')
            ->orderBy('id')
            ->limit(max(1, min($limit, 100)))
            ->get();

        return $this->refreshMany($rows);
    }

    /**
     * پرونده‌هایی که وضعیت مشتقشان هنوز از مهلت مراحل ساخته نشده است (پرونده‌های
     * پیش از افزودن `nextStageDeadline`). خروجی: تعداد پرونده‌های بازبینی‌شده.
     */
    public function refreshUnsynced(int $limit = 200): int
    {
        $rows = Content::query()
            ->whereNotIn('status', self::TERMINAL)
            ->whereNull('payload->nextStageDeadline')
            // پروندهٔ بدون مرحله هرگز این کلید را نمی‌گیرد؛ فیلتر آن باعث می‌شود
            // اجرای محدود دستور واقعاً پیش برود و روی همان ردیف‌ها نچرخد.
            ->whereJsonLength('payload->stages', '>', 0)
            ->orderBy('id')
            ->limit(max(1, min($limit, 1000)))
            ->get();

        return $this->refreshMany($rows);
    }

    /** تعداد پرونده‌هایی که مهلت مرحلهٔ بازشان گذشته است (بیش از سقف هر اجرا). */
    public function countDue(?string $today = null): int
    {
        $today ??= app(OrganizationTime::class)->date();

        return (int) Content::query()
            ->whereNotIn('status', self::TERMINAL)
            ->whereNotNull('payload->nextStageDeadline')
            ->where('payload->nextStageDeadline', '<', $today)
            ->count();
    }

    /** تعداد پرونده‌هایی که وضعیت مشتقشان هرگز از مهلت مراحل ساخته نشده است. */
    public function countUnsynced(): int
    {
        return (int) Content::query()
            ->whereNotIn('status', self::TERMINAL)
            ->whereNull('payload->nextStageDeadline')
            ->whereJsonLength('payload->stages', '>', 0)
            ->count();
    }

    /** @param  iterable<int, Content>  $rows */
    private function refreshMany(iterable $rows): int
    {
        $scanned = 0;
        foreach ($rows as $row) {
            $scanned++;
            $this->refresh($row);
        }

        return $scanned;
    }
}
