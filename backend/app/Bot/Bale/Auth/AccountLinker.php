<?php

namespace App\Bot\Bale\Auth;

use App\Bot\Bale\Settings;
use App\Models\BaleOutbox;
use App\Models\BaleUserLink;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\RateLimiter;

final class AccountLinker
{
    public function __construct(private Settings $settings) {}

    public function issue(User $user): array
    {
        abort_unless($user->isActive() && $this->settings->ready(), 422, 'حساب فعال و ربات متصل لازم است.');
        abort_if(BaleUserLink::where('user_id', $user->id)->exists(), 409, 'حساب شما از قبل متصل است.');
        $key = 'bale:issue:'.$user->id;
        abort_if(RateLimiter::tooManyAttempts($key, 3), 429, 'کمی بعد دوباره تلاش کنید.');
        RateLimiter::hit($key, 300);
        $code = strtoupper(bin2hex(random_bytes(5)));
        $expires = now()->addMinutes(config('bale.code_lifetime_minutes'));
        DB::table('bale_link_codes')->updateOrInsert(['user_id' => $user->id], [
            'code_hash' => $this->hash($code), 'expires_at' => $expires,
        ]);

        return ['code' => $code, 'expires_at' => $expires->toIso8601String()];
    }

    /** Called only for private messages obtained directly from the authenticated Bale API. */
    public function consume(string $code, string $senderId, string $chatId): ?BaleUserLink
    {
        $key = 'bale:link-attempt:'.$senderId;
        if (RateLimiter::tooManyAttempts($key, 5)) {
            return null;
        }
        RateLimiter::hit($key, 600);
        if (! preg_match('/^[A-F0-9]{10}$/', $code)) {
            return null;
        }

        return DB::transaction(function () use ($code, $senderId, $chatId, $key): ?BaleUserLink {
            $record = DB::table('bale_link_codes')->where('code_hash', $this->hash($code))->lockForUpdate()->first();
            if (! $record || now()->gte($record->expires_at)) {
                return null;
            }
            $user = User::whereKey($record->user_id)->lockForUpdate()->first();
            if (! $user?->isActive() || BaleUserLink::where('bale_user_id', $senderId)->orWhere('user_id', $record->user_id)->exists()) {
                return null;
            }
            $link = BaleUserLink::create(['user_id' => $user->id, 'bale_user_id' => $senderId, 'chat_id' => $chatId]);
            DB::table('bale_link_codes')->where('id', $record->id)->delete();
            RateLimiter::clear($key);
            $this->settings->audit($user, 'bale_account_linked');

            return $link;
        });
    }

    public function disconnect(User $user): void
    {
        DB::transaction(function () use ($user): void {
            $links = BaleUserLink::where('user_id', $user->id)->pluck('id');
            BaleOutbox::whereIn('link_id', $links)->where('status', 'pending')->update(['status' => 'cancelled']);
            BaleUserLink::whereIn('id', $links)->delete();
            DB::table('bale_link_codes')->where('user_id', $user->id)->delete();
            $this->settings->audit($user, 'bale_account_unlinked');
        });
    }

    private function hash(string $code): string
    {
        return hash_hmac('sha256', $code, config('app.key'));
    }
}
