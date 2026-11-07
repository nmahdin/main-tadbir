<?php

namespace App\Bot\Bale;

use App\Bot\Bale\Client\BaleApiException;
use App\Bot\Bale\Client\BaleClient;
use App\Bot\Bale\Routing\MenuRouter;
use App\Bot\Bale\Support\FlowDiagnostics;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Throwable;

/** Both inbound transports use the same atomic domain operations and replay protection. */
final class UpdateProcessor
{
    public function __construct(private Settings $settings, private MenuRouter $router, private BaleClient $client) {}

    /** Caller holds RuntimeLock. Webhook delivery order is not an offset/authorization check. */
    public function process(#[\SensitiveParameter] array $update, bool $polling = false): bool
    {
        if (! is_int($update['update_id'] ?? null) || $update['update_id'] < 0 || $update['update_id'] === PHP_INT_MAX) {
            throw new BaleApiException('invalid_updates');
        }
        $id = $update['update_id'];
        $botId = (string) $this->settings->read()['bot_id'];
        FlowDiagnostics::trace('update_received', null, [
            'update_id' => $id,
            'kind' => isset($update['callback_query']) ? 'callback'
                : (isset($update['message']['text']) ? 'text'
                    : (isset($update['message']) ? 'file' : 'other')),
        ]);
        try {
            $created = DB::transaction(function () use ($update, $id, $botId, $polling): bool {
                $exists = DB::table('bale_inbox')->where('bot_id', $botId)->where('update_id', $id)->exists();
                if (! $exists) {
                    try {
                        $this->router->handle($update);
                    } catch (Throwable $handlerError) {
                        // خطای هندلر از خطای زیرساخت جدا می‌شود؛ تراکنشِ این
                        // پیام برگشت می‌خورد و پیش‌نویسِ سالمِ کاربر می‌ماند.
                        throw new HandlerFailure($handlerError);
                    }
                    DB::table('bale_inbox')->insert(['bot_id' => $botId, 'update_id' => $id, 'status' => 'processed', 'created_at' => now()]);
                }
                $this->settings->write([
                    ...($polling ? ['offset' => max((int) ($this->settings->read()['offset'] ?? 0), $id + 1)] : ['last_webhook_at' => now()->toIso8601String()]),
                    ...(! $exists ? ['last_received_at' => now()->toIso8601String(), 'last_update_id' => $id, 'last_received_via' => $polling ? 'short_polling' : 'webhook'] : []),
                ]);

                return ! $exists;
            });
        } catch (HandlerFailure $failure) {
            /**
             * یک پیامِ خراب نباید صف را قفل کند و نباید پیش‌نویسِ کاربر را
             * بسوزاند. پیش‌تر استثنا از تراکنش بیرون می‌زد: نشست (و پاسخِ کاربر)
             * برگشت می‌خورد، offset جلو نمی‌رفت و همان پیامِ خراب هر بار دوباره
             * خوانده می‌شد؛ نتیجه این بود که بات فرم را «فراموش می‌کرد» و کاربر
             * وسطِ جریان، خود را در منوی اصلی می‌دید.
             */
            $this->recordFailure($id, $botId, $polling);
            $this->announce($update, $this->safeReason($failure->cause));
            Log::warning('bale_update_failed', ['update_id' => $id, 'error' => class_basename($failure->cause)]);

            return false;
        }
        FlowDiagnostics::trace('update_finished', null, [
            'update_id' => $id,
            'decision' => $created ? 'saved' : 'discarded',
        ]);
        $callbackId = $update['callback_query']['id'] ?? null;
        if (is_string($callbackId) && strlen($callbackId) <= 256) {
            try {
                $this->client->call($this->settings->token(), 'answerCallbackQuery', ['callback_query_id' => $callbackId]);
            } catch (BaleApiException) {
                // An acknowledgement failure cannot undo a committed task or form.
            }
        }

        return $created;
    }

    /**
     * ثبتِ شکست و جلو بردنِ offset.
     *
     * شکست در inbox با وضعیت `failed` ثبت می‌شود تا همان شناسه دوباره پردازش
     * نشود؛ جریانِ بازِ کاربر هم دست‌نخورده می‌ماند (تراکنشِ اصلی برگشت خورده
     * است، پس آخرین مرحلهٔ سالمِ فرم برجاست).
     */
    private function recordFailure(int $id, string $botId, bool $polling): void
    {
        try {
            DB::transaction(function () use ($id, $botId, $polling): void {
                if (! DB::table('bale_inbox')->where('bot_id', $botId)->where('update_id', $id)->exists()) {
                    DB::table('bale_inbox')->insert(['bot_id' => $botId, 'update_id' => $id, 'status' => 'failed', 'created_at' => now()]);
                }
                $this->settings->write([
                    ...($polling ? ['offset' => max((int) ($this->settings->read()['offset'] ?? 0), $id + 1)] : []),
                    'last_error' => 'update_processing_failed',
                ]);
            });
        } catch (Throwable) {
            // اگر حتی ثبتِ شکست هم ممکن نبود، offset در تیک بعدی جلو می‌رود؛
            // پیامِ کاربر نباید بی‌پاسخ بماند.
        }
    }

    /** پیامِ روشن به کاربر؛ خودِ اعلان هرگز باعثِ خطای تازه نمی‌شود. */
    private function announce(array $update, string $reason): void
    {
        try {
            $this->router->failureNotice($update, $reason);
        } catch (Throwable) {
            // پیامِ خطا هم نباید پردازش را بشکند.
        }
    }

    /**
     * دلیلِ امن برای نمایش.
     *
     * پیام‌های فارسیِ خودِ سرویس (مثل «ذخیره فایل ناموفق بود») کامل گفته
     * می‌شوند؛ هر متنی که مسیر فایل، نام کلاس یا توکن داشته باشد با پیامِ عمومی
     * جای می‌گیرد تا نشانی یا راز در گفتگو نیاید.
     */
    private function safeReason(Throwable $error): string
    {
        $message = trim((string) $error->getMessage());
        if ($message === '' || mb_strlen($message) > 200
            || preg_match('~[/\\\\]|::|[0-9]{5,}:[A-Za-z0-9_-]{10,}~', $message)
            || ! preg_match('/\p{Arabic}/u', $message)) {
            return 'خطای داخلی سرور رخ داد و این پیام پردازش نشد.';
        }

        return $message;
    }

    /** Opportunistic, bounded retention; no cron needed, and replay IDs are never removed. */
    public function cleanup(float $deadline): void
    {
        $queries = [
            DB::table('bale_link_codes')->where('expires_at', '<=', now()),
            // Never prune a conversation created/updated seconds ago even if a
            // hosting DB timezone conversion makes its expires_at look past.
            // The router enforces expiration; cleanup needs a safety window.
            DB::table('bale_conversations')->where('expires_at', '<=', now())
                ->where('updated_at', '<=', now()->subMinutes(max(15, (int) config('bale.session_lifetime_minutes', 60)))),
            DB::table('bale_outbox')->whereIn('status', ['sent', 'failed', 'unknown', 'cancelled'])->where('updated_at', '<', now()->subDays(30)),
            ...(Schema::hasTable('bale_panel_sessions') ? [DB::table('bale_panel_sessions')->where('expires_at', '<=', now())] : []),
        ];
        foreach ($queries as $index => $query) {
            if (microtime(true) >= $deadline) {
                return;
            }
            $ids = (clone $query)->orderBy('id')->limit(100)->pluck('id')->all();
            if ($ids) {
                $query->whereIn('id', $ids)->delete();
                if ($index === 1) {
                    FlowDiagnostics::trace('expired_sessions_pruned', null, [
                        'removed_sessions' => count($ids),
                    ]);
                }
            }
        }
    }
}
