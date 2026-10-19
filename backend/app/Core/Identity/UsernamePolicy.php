<?php

namespace App\Core\Identity;

use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * AMB-01=B: user-chosen usernames remain a user-facing login
 * identifier. Normalization is trim + ASCII lowercase; uniqueness is
 * enforced on the normalized form (DB unique index on
 * users.username_normalized). Existing usernames are never renamed by
 * this policy — conflicts are reported for operator resolution.
 */
final class UsernamePolicy
{
    public const MIN_LENGTH = 3;
    public const MAX_LENGTH = 32;

    /** Reserved identifiers that can never be registered. */
    public const RESERVED = [
        'admin', 'administrator', 'root', 'system', 'support', 'help',
        'tadbir', 'official', 'moderator', 'security', 'noreply',
        'postmaster', 'webmaster', 'api', 'login', 'register', 'me',
    ];

    public static function normalize(string $username): string
    {
        return strtolower(trim($username));
    }

    /** @return string|null Persian validation message, or null when valid. */
    public static function validate(string $username): ?string
    {
        $normalized = self::normalize($username);
        $length = strlen($normalized);
        if ($length < self::MIN_LENGTH) {
            return 'نام کاربری باید حداقل ۳ کاراکتر باشد.';
        }
        if ($length > self::MAX_LENGTH) {
            return 'نام کاربری نمی‌تواند بیش از ۳۲ کاراکتر باشد.';
        }
        if (! preg_match('/^[a-z0-9._-]+$/', $normalized)) {
            return 'نام کاربری فقط می‌تواند شامل حروف انگلیسی کوچک، عدد، نقطه، خط تیره و زیرخط باشد.';
        }
        if (! preg_match('/^[a-z0-9]/', $normalized) || ! preg_match('/[a-z0-9]$/', $normalized)) {
            return 'نام کاربری باید با حرف یا عدد شروع و تمام شود.';
        }
        if (preg_match('/[._-]{2,}/', $normalized)) {
            return 'نام کاربری نمی‌تواند شامل دو نشانهٔ پشت سر هم باشد.';
        }
        if (in_array($normalized, self::RESERVED, true)) {
            return 'این نام کاربری رزرو شده است و قابل انتخاب نیست.';
        }

        return null;
    }

    public static function isTaken(string $username, ?int $exceptUserId = null): bool
    {
        return User::query()
            ->where('username_normalized', self::normalize($username))
            ->when($exceptUserId, fn ($query) => $query->where('id', '!=', $exceptUserId))
            ->exists();
    }

    /**
     * Read-only preflight (AMB-01): groups of existing usernames that
     * collide under the new normalization. Never mutates data.
     *
     * @return array<int, array{normalized: string, usernames: array<int, string>}>
     */
    public static function normalizationConflicts(): array
    {
        return DB::table('users')
            ->selectRaw('LOWER(TRIM(username)) as normalized, GROUP_CONCAT(username) as usernames, COUNT(*) as total')
            ->whereNotNull('username')
            ->groupByRaw('LOWER(TRIM(username))')
            ->having('total', '>', 1)
            ->get()
            ->map(fn ($row) => [
                'normalized' => $row->normalized,
                'usernames' => explode(',', (string) $row->usernames),
            ])
            ->all();
    }
}
