<?php

namespace App\Support\Content;

/**
 * Content status is derived from the real state of stages, tasks and
 * publication. A client may echo back the status it already received (a full
 * resource autosave), but it may never *move* a content into a derived status:
 * reviewing / delayed / approved / ready_to_publish / published are produced by the
 * workflow, not chosen from a dropdown. `delayed` («تأخیر») is derived from the
 * real deadline of the open stages, so extending a deadline clears it again.
 *
 * `approving` («در انتظار تأیید») was retired: a stage awaiting its reviewer is
 * already reported as `reviewing`, so the status could never be produced by the
 * workflow and only survived as a dead kanban column. Legacy records and legacy
 * clients are normalized to `reviewing` instead of being rejected.
 */
final class ContentStatusPolicy
{
    /** Statuses the workflow derives. A client may not move a content into these. */
    public const DERIVED = ['planning', 'producing', 'reviewing', 'revising', 'delayed', 'approved', 'ready_to_publish', 'published'];

    /** Lifecycle states a human may command explicitly, with an explicit permission. */
    public const MANUAL = ['idea', 'suspended', 'cancelled', 'archived'];

    /** Retired statuses mapped to the real state that replaced them. */
    public const RETIRED = ['approving' => 'reviewing'];

    /** Rewrites retired statuses; every other value is returned untouched. */
    public static function normalize(mixed $status): mixed
    {
        if (! is_string($status)) {
            return $status;
        }

        return self::RETIRED[$status] ?? $status;
    }

    public static function isDerived(mixed $status): bool
    {
        return is_string($status)
            && (in_array($status, self::DERIVED, true) || isset(self::RETIRED[$status]));
    }

    /**
     * @throws \Symfony\Component\HttpKernel\Exception\HttpExceptionInterface
     */
    public static function guardTransition(?string $current, mixed $incoming): void
    {
        if (! is_string($incoming) || $incoming === '') {
            return;
        }
        $incoming = self::normalize($incoming);
        $same = $current !== null && $incoming === $current;
        if ($same || ! self::isDerived($incoming)) {
            return;
        }

        abort(409, 'این وضعیت از جریان تولید محتوا نتیجه می‌شود و با ویرایش معمولی تغییر نمی‌کند.');
    }

    /**
     * Creation is a fresh record: a client may only ask for a manual lifecycle
     * state, never for a workflow-derived one.
     */
    public static function guardCreation(mixed $incoming): void
    {
        if (is_string($incoming) && self::isDerived($incoming)) {
            abort(409, 'وضعیت ابتدایی محتوا را سرور از جریان تولید تعیین می‌کند.');
        }
    }
}
