<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/** Reject oversized input before bcrypt can throw or silently truncate it. */
class PasswordByteLimit implements ValidationRule
{
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (is_string($value) && strlen($value) > 72) {
            $fail('رمز عبور نباید بیشتر از ۷۲ بایت باشد.');
        }
    }
}
