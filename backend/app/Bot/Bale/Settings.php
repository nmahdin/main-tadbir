<?php

namespace App\Bot\Bale;

use App\Bot\Bale\Client\BaleApiException;
use App\Bot\Bale\Client\BaleClient;
use App\Models\ActivityLog;
use App\Models\BaleOutbox;
use App\Models\BaleUserLink;
use App\Models\SystemSetting;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Throwable;

final class Settings
{
    public const KEY = 'bale_private';

    public function read(): array
    {
        return SystemSetting::where('key', self::KEY)->first()?->value ?? [];
    }

    public function write(array $changes, ?User $actor = null): void
    {
        SystemSetting::updateOrCreate(['key' => self::KEY], [
            'value' => [...$this->read(), ...$changes], 'updated_by' => $actor?->id,
        ]);
    }

    public function token(): string
    {
        try {
            $ciphertext = $this->read()['token'] ?? null;
            if ($ciphertext) {
                return Crypt::decryptString($ciphertext);
            }
        } catch (Throwable) {
            throw new BaleApiException('credential_unreadable');
        }
        throw new BaleApiException('not_configured');
    }

    public function ready(): bool
    {
        $s = $this->read();

        return ($s['enabled'] ?? false) && ($s['connection_status'] ?? '') === 'connected'
            && ! empty($s['bot_id']) && ! empty($s['token']);
    }

    public function save(User $actor, array $data): void
    {
        $s = $this->read();
        $changes = ['enabled' => $data['enabled']];
        $tokenChanged = ! empty($data['token']);
        if ($tokenChanged) {
            if (BaleUserLink::exists()) {
                throw ValidationException::withMessages(['token' => 'برای تعویض توکن ابتدا اتصال ربات را حذف کنید؛ اتصال کاربران قبلی نیز قطع می‌شود.']);
            }
            $changes += [
                'token' => Crypt::encryptString($data['token']), 'bot_id' => null, 'bot_username' => null,
                'connection_status' => 'untested', 'offset' => 0, 'last_test_at' => null, 'last_test_error' => null,
            ];
        }
        abort_if($data['enabled'] && ! $tokenChanged && empty($s['token']), 422, 'ابتدا توکن را ذخیره کنید.');
        DB::transaction(function () use ($actor, $changes, $tokenChanged): void {
            $this->write($changes, $actor);
            if ($tokenChanged) {
                DB::table('bale_link_codes')->delete();
            }
            if (! $changes['enabled'] || $tokenChanged) {
                BaleOutbox::where('status', 'pending')->update(['status' => 'cancelled']);
            }
            $this->audit($actor, $tokenChanged ? 'bale_token_changed' : 'bale_settings_changed');
        });
    }

    public function test(BaleClient $client): void
    {
        try {
            $token = $this->token();
            $me = $client->call($token, 'getMe');
            $webhook = $client->call($token, 'getWebhookInfo');
            if (! is_array($me) || ! preg_match('/^[0-9]{1,20}$/', (string) ($me['id'] ?? '')) || ! is_array($webhook) || ! array_key_exists('url', $webhook)) {
                throw new BaleApiException('invalid_response');
            }
            $this->write([
                'bot_id' => (string) $me['id'],
                'bot_username' => preg_match('/^[a-zA-Z0-9_]{1,64}$/', $me['username'] ?? '') ? $me['username'] : null,
                'connection_status' => 'connected', 'last_test_at' => now()->toIso8601String(),
                'last_test_error' => null, 'remote_webhook_present' => $webhook['url'] !== '',
            ]);
        } catch (BaleApiException $e) {
            $this->write(['connection_status' => 'failed', 'last_test_at' => now()->toIso8601String(), 'last_test_error' => $e->reason]);
            throw $e;
        }
    }

    public function disconnect(User $actor, BaleClient $client, bool $localOnly = false): void
    {
        // If remote deletion fails, keep the token so an operator can try again.
        if (! $localOnly && ! empty($this->read()['token'])) {
            if ($client->call($this->token(), 'deleteWebhook') !== true) {
                throw new BaleApiException('invalid_response');
            }
        }
        DB::transaction(function () use ($actor, $localOnly): void {
            BaleOutbox::where('status', 'pending')->update(['status' => 'cancelled']);
            BaleUserLink::query()->delete();
            DB::table('bale_link_codes')->delete();
            SystemSetting::where('key', self::KEY)->delete();
            $this->audit($actor, $localOnly ? 'bale_disconnected_local_only' : 'bale_disconnected');
        });
    }

    public function publicState(): array
    {
        $s = $this->read();
        $secret = (string) config('bale.runner_secret');
        $heartbeat = $s['last_external_tick_at'] ?? null;

        return [
            'enabled' => (bool) ($s['enabled'] ?? false),
            'has_token' => ! empty($s['token']),
            'connection_status' => $s['connection_status'] ?? 'not_configured',
            'bot_username' => $s['bot_username'] ?? null,
            'last_test_at' => $s['last_test_at'] ?? null,
            'last_test_error' => $s['last_test_error'] ?? null,
            'remote_webhook_present' => (bool) ($s['remote_webhook_present'] ?? false),
            'webhook_supported' => false,
            'transport' => 'short_polling',
            'runner_configured' => strlen($secret) >= 32,
            'runner_recent' => $heartbeat && Carbon::parse($heartbeat)->gt(now()->subMinutes(3)),
            'last_external_tick_at' => $heartbeat,
            'last_tick_at' => $s['last_tick_at'] ?? null,
            'last_received_at' => $s['last_received_at'] ?? null,
            'last_sent_at' => $s['last_sent_at'] ?? null,
            'last_error' => $s['last_error'] ?? null,
            'linked_users' => BaleUserLink::count(),
            'outbox_counts' => BaleOutbox::selectRaw('status, count(*) as total')->groupBy('status')->pluck('total', 'status'),
            'recent_errors' => BaleOutbox::whereNotNull('error_code')->latest()->limit(10)->get(['id', 'status', 'error_code', 'updated_at']),
            'scheduled_features_available' => false,
        ];
    }

    public function audit(User $actor, string $type): void
    {
        ActivityLog::create(['user_id' => $actor->id, 'type' => $type, 'action' => $type]);
    }
}
