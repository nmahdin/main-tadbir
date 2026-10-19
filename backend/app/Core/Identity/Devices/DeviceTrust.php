<?php

namespace App\Core\Identity\Devices;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cookie;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * AMB-04=A device recognition: a rotating opaque cookie whose hash is
 * stored server-side. It is a risk signal only — never an
 * authentication factor by itself.
 */
final class DeviceTrust
{
    public const COOKIE = 'tadbir_device';
    public const INACTIVITY_DAYS = 30;

    public function knownDevice(Request $request, User $user): bool
    {
        $raw = $request->cookie(self::COOKIE);
        if (! is_string($raw) || $raw === '') {
            return false;
        }

        return DB::table('user_devices')
            ->where('user_id', $user->id)
            ->where('device_hash', hash('sha256', $raw))
            ->exists();
    }

    /** Issue/rotate the device cookie after a fully authenticated login. */
    public function remember(User $user): void
    {
        $raw = Str::random(48);
        DB::table('user_devices')->updateOrInsert(
            ['user_id' => $user->id, 'device_hash' => hash('sha256', $raw)],
            ['last_seen_at' => now(), 'updated_at' => now(), 'created_at' => now()],
        );
        Cookie::queue(Cookie::make(self::COOKIE, $raw, 60 * 24 * 180, null, null, true, true, false, 'lax'));
    }

    public function touch(Request $request, User $user): void
    {
        $raw = $request->cookie(self::COOKIE);
        if (is_string($raw) && $raw !== '') {
            DB::table('user_devices')
                ->where('user_id', $user->id)
                ->where('device_hash', hash('sha256', $raw))
                ->update(['last_seen_at' => now()]);
        }
    }

    /** Step-up needed: unknown device AND account idle > 30 days. */
    public function stepUpRequired(Request $request, User $user): bool
    {
        if ($this->knownDevice($request, $user)) {
            return false;
        }
        $last = $user->last_login_at;

        return $last !== null && $last->lt(now()->subDays(self::INACTIVITY_DAYS));
    }
}
