<?php

namespace App\Services;

use App\Models\BaleUserLink;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;

final class BalePanelSession
{
    public const LIFETIME_MINUTES = 10;

    public function issue(BaleUserLink $link): ?string
    {
        if (! Schema::hasTable('bale_panel_sessions')) {
            return null;
        }
        $user = User::find($link->user_id);
        if (! $user?->isActive()) {
            return null;
        }

        $token = bin2hex(random_bytes(32));
        $issued = DB::transaction(function () use ($link, $user, $token): bool {
            $currentLink = BaleUserLink::whereKey($link->id)->where('user_id', $user->id)->lockForUpdate()->first();
            if (! $currentLink) {
                return false;
            }
            DB::table('bale_panel_sessions')->where('expires_at', '<=', now())->delete();
            DB::table('bale_panel_sessions')->updateOrInsert(['link_id' => $currentLink->id], [
                'user_id' => $user->id,
                'token_hash' => $this->hash($token),
                'expires_at' => now()->addMinutes(self::LIFETIME_MINUTES),
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            return true;
        });

        return $issued ? $token : null;
    }

    public function consume(#[\SensitiveParameter] string $token): User
    {
        if (! Schema::hasTable('bale_panel_sessions')) {
            throw ValidationException::withMessages(['token' => 'ورود مستقیم پنل هنوز روی سرور نصب نشده است.']);
        }
        $user = DB::transaction(function () use ($token): ?User {
            $session = DB::table('bale_panel_sessions')->where('token_hash', $this->hash($token))->lockForUpdate()->first();
            if (! $session) {
                return null;
            }
            DB::table('bale_panel_sessions')->where('id', $session->id)->delete();
            if (now()->gte($session->expires_at)) {
                return null;
            }
            $link = BaleUserLink::find($session->link_id);
            $user = User::find($session->user_id);

            return $link && (int) $link->user_id === (int) $session->user_id && $user?->isActive() ? $user : null;
        });

        if (! $user) {
            throw ValidationException::withMessages(['token' => 'پیوند ورود نامعتبر، منقضی یا قبلاً استفاده شده است. از جدیدترین منوی ربات وارد شوید.']);
        }

        return $user;
    }

    private function hash(#[\SensitiveParameter] string $token): string
    {
        return hash_hmac('sha256', $token, (string) config('app.key'));
    }
}
