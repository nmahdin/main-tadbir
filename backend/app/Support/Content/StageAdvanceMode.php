<?php

namespace App\Support\Content;

/**
 * Explicit, per-stage policy that answers one question:
 * "when this stage is approved, how does the next stage become active?"
 *
 * approval          - approving the stage activates the next stage directly.
 * forwarded_output  - approving the stage only finishes the review; the next
 *                     stage stays inactive until a Reviewer forwards a
 *                     delivered Output of this stage with the official
 *                     forward command.
 *
 * Legacy stages without the key resolve to `approval`, which is the behaviour
 * the system had before this policy existed. Nothing is hardcoded per series or
 * content type: the value is stored on the stage snapshot (and on the process
 * template stage) and can be changed by whoever may manage the workflow.
 */
final class StageAdvanceMode
{
    public const APPROVAL = 'approval';

    public const FORWARDED_OUTPUT = 'forwarded_output';

    public const ALL = [self::APPROVAL, self::FORWARDED_OUTPUT];

    /** Backward-compatible default for stages stored before this policy existed. */
    public const DEFAULT = self::APPROVAL;

    public static function of(mixed $value): string
    {
        if (is_string($value)) {
            $normalized = strtolower(trim($value));
            // Tolerate the two historical spellings that reached the payload.
            $normalized = match ($normalized) {
                'forward', 'forwarded', 'forwarded-output', 'forwarded_output' => self::FORWARDED_OUTPUT,
                default => $normalized,
            };
            if (in_array($normalized, self::ALL, true)) {
                return $normalized;
            }
        }

        return self::DEFAULT;
    }

    public static function isForwardedOutput(mixed $value): bool
    {
        return self::of($value) === self::FORWARDED_OUTPUT;
    }

    public static function label(mixed $value): string
    {
        return self::isForwardedOutput($value)
            ? 'فعال‌سازی با ارجاع خروجی'
            : 'فعال‌سازی با تأیید مرحله';
    }
}
