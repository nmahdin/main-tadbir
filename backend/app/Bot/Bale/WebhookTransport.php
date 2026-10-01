<?php

namespace App\Bot\Bale;

use App\Bot\Bale\Client\BaleApiException;
use App\Bot\Bale\Client\BaleClient;
use App\Models\BaleOutbox;
use App\Models\User;
use Illuminate\Support\Facades\Crypt;

/** URL capability authentication, NOT a claim of a Bale-signed request. */
final class WebhookTransport
{
    public function __construct(private Settings $settings, private BaleClient $client, private UpdateProcessor $processor, private Outbox $outbox) {}

    /** Caller holds RuntimeLock. No bot token or receiving secret is returned to the browser. */
    public function activate(User $actor, bool $rotate = false): void
    {
        abort_unless($this->settings->ready(), 422, 'ابتدا ربات را ذخیره، آزمایش و فعال کنید.');
        $base = $this->settings->webhookUrl();
        abort_unless($base && in_array(parse_url($base, PHP_URL_PORT) ?? 443, [443, 88], true), 422, 'آدرس عمومی HTTPS بک‌اند با پورت 443 یا 88 لازم است.');
        $s = $this->settings->read();
        if ($rotate || empty($s['webhook_secret'])) {
            $this->settings->write(['webhook_secret' => Crypt::encryptString(bin2hex(random_bytes(32)))], $actor);
        }
        // Keep the same secret on retry after an ambiguous registration result.
        $this->settings->write(['transport' => 'webhook', 'webhook_status' => 'unconfirmed', 'remote_webhook_matches' => false], $actor);
        $this->settings->audit($actor, $rotate ? 'bale_webhook_rotated' : 'bale_webhook_activation_requested');
        try {
            if ($this->client->call($this->settings->token(), 'setWebhook', ['url' => $this->settings->protectedWebhookUrl()]) !== true) {
                throw new BaleApiException('invalid_response');
            }
            $this->settings->test($this->client);
            if (! ($this->settings->read()['remote_webhook_matches'] ?? false)) {
                throw new BaleApiException('webhook_mismatch');
            }
            $this->settings->write(['last_error' => null]);
        } catch (BaleApiException $e) {
            $this->settings->write(['webhook_status' => 'unconfirmed', 'last_error' => $e->reason]);
            throw $e;
        }
    }

    public function accepts(#[\SensitiveParameter] string $secret): bool
    {
        $s = $this->settings->read();
        if (! $this->settings->ready() || ($s['transport'] ?? '') !== 'webhook' || empty($s['webhook_secret'])) {
            return false;
        }
        try {
            $expected = Crypt::decryptString($s['webhook_secret']);

            return preg_match('/^[a-f0-9]{64}$/D', $secret) && hash_equals($expected, $secret);
        } catch (\Throwable) {
            return false;
        }
    }

    /** Caller holds RuntimeLock and has rechecked the capability inside the lock. */
    public function receive(#[\SensitiveParameter] array $update): void
    {
        $deadline = microtime(true) + config('bale.tick_seconds');
        $this->settings->write(['last_error' => null]);
        $this->processor->process($update);
        // Prioritize the answer to THIS message over unrelated notification backlog.
        $key = $this->settings->read()['bot_id'].':'.$update['update_id'];
        $ids = BaleOutbox::whereIn('deduplication_key', [$key.':cleanup', $key])->orderBy('id')->pluck('id')->all();
        $this->outbox->flush($deadline, $ids);
        $this->outbox->flush($deadline);
        $this->processor->cleanup($deadline);
    }
}
