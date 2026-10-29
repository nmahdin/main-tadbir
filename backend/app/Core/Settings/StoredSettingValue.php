<?php

namespace App\Core\Settings;

/**
 * Read result for an explicit setting override (Stage C7-1):
 * distinguishes "no override row exists" (exists=false) from "an
 * override explicitly set to null" (exists=true, value=null).
 */
final readonly class StoredSettingValue
{
    public function __construct(
        public bool $exists,
        public mixed $value,
        public ?int $version = null,
    ) {}

    public static function absent(): self
    {
        return new self(false, null, null);
    }
}
